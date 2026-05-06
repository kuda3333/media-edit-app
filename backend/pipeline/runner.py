"""Pipeline Orchestrator: runs modules in sequence and streams progress to MongoDB."""
import asyncio
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

from .parser import parse_script
from .audio import assign_voices, generate_all_audio
from .art import generate_all_art
from .video import assemble_video


class PipelineRunner:
    def __init__(self, db, workspace_root: Path):
        self.db = db
        self.workspace_root = workspace_root

    def _project_dir(self, project_id: str) -> Path:
        p = self.workspace_root / project_id
        p.mkdir(parents=True, exist_ok=True)
        return p

    async def _log(self, project_id: str, module: str, message: str, progress: int):
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "module": module,
            "message": message,
            "progress": progress,
        }
        await self.db.projects.update_one(
            {"project_id": project_id},
            {
                "$set": {
                    "current_module": module,
                    "overall_progress": progress,
                    "updated_at": datetime.now(timezone.utc),
                },
                "$push": {"logs": entry},
            },
        )

    async def run_all(self, project_id: str, script: str, style: str):
        proj_dir = self._project_dir(project_id)
        try:
            await self._log(project_id, "parse", "Parsing script...", 2)
            parsed = parse_script(script)
            scene_count = len(parsed["scenes"])
            char_count = len(parsed["characters"])
            await self.db.projects.update_one(
                {"project_id": project_id},
                {"$set": {
                    "parsed": parsed,
                    "scene_count": scene_count,
                    "character_count": char_count,
                    "status": "running",
                }},
            )
            await self._log(
                project_id, "parse",
                f"Parsed {scene_count} scenes, {char_count} characters, est {parsed['total_estimated_duration_sec']}s",
                10,
            )

            if scene_count == 0:
                raise ValueError("No scenes detected in script. Add scene headings like 'INT. LOCATION - DAY'.")

            # Module 2: Audio
            await self._log(project_id, "audio", "Assigning character voices...", 12)
            voice_map = assign_voices(parsed["characters"])
            await self.db.projects.update_one(
                {"project_id": project_id}, {"$set": {"voice_map": voice_map}}
            )

            async def audio_cb(msg, pct):
                await self._log(project_id, "audio", msg, 12 + int(pct * 0.23))

            audio_result = await generate_all_audio(parsed["scenes"], voice_map, proj_dir, audio_cb)
            await self._log(project_id, "audio", "Audio master track ready", 38)
            await self.db.projects.update_one(
                {"project_id": project_id}, {"$set": {"audio_result": audio_result}}
            )

            # Module 3: Art
            async def art_cb(msg, pct):
                await self._log(project_id, "art", msg, 38 + int(pct * 0.32))

            await self._log(project_id, "art", "Generating backgrounds & characters...", 40)
            art_result = await generate_all_art(
                parsed["scenes"], parsed["characters"], style, proj_dir, art_cb
            )
            await self._log(project_id, "art", "All art generated", 72)
            await self.db.projects.update_one(
                {"project_id": project_id}, {"$set": {"art_result": art_result}}
            )

            # Module 4: Video
            async def video_cb(msg, pct):
                await self._log(project_id, "video", msg, 72 + int(pct * 0.27))

            await self._log(project_id, "video", "Assembling video...", 74)
            # moviepy is blocking; run in executor with loop reference for callbacks
            loop = asyncio.get_running_loop()
            video_result = await loop.run_in_executor(
                None, lambda: assemble_video(parsed["scenes"], audio_result, art_result, proj_dir, None, loop)
            )
            await self._log(project_id, "video", "Video encoded", 99)

            await self.db.projects.update_one(
                {"project_id": project_id},
                {"$set": {
                    "video_result": video_result,
                    "status": "completed",
                    "overall_progress": 100,
                    "current_module": "done",
                    "completed_at": datetime.now(timezone.utc),
                }},
            )
            await self._log(project_id, "done", "Pipeline complete", 100)

        except Exception as e:
            tb = traceback.format_exc()
            await self.db.projects.update_one(
                {"project_id": project_id},
                {"$set": {
                    "status": "failed",
                    "error": str(e),
                    "error_trace": tb[-2000:],
                }},
            )
            await self._log(project_id, "error", f"Pipeline failed: {e}", -1)
