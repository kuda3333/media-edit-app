"""Module 2: Soundtrack Generation (TTS + mixing).

Uses edge-tts (free Microsoft Edge voices, no API key) and pydub for mixing.
Each character gets a distinct voice profile; dialogue is mixed at -6 dBFS.
"""
import os
import asyncio
import hashlib
from pathlib import Path
from typing import Dict, List

import edge_tts
from pydub import AudioSegment

# Curated set of English multi-accent voices from Microsoft Edge TTS.
VOICE_POOL = [
    ("en-US-GuyNeural", "male", "warm"),
    ("en-US-DavisNeural", "male", "deep"),
    ("en-US-TonyNeural", "male", "energetic"),
    ("en-US-JennyNeural", "female", "friendly"),
    ("en-US-AriaNeural", "female", "cheerful"),
    ("en-GB-RyanNeural", "male", "british"),
    ("en-GB-SoniaNeural", "female", "british"),
    ("en-AU-NatashaNeural", "female", "australian"),
    ("en-IN-PrabhatNeural", "male", "indian"),
    ("en-IN-NeerjaNeural", "female", "indian"),
]

NARRATOR_VOICE = "en-US-AndrewNeural"


def _voice_for_character(name: str) -> Dict:
    """Deterministically pick a voice per character name."""
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    voice_id, gender, style = VOICE_POOL[h % len(VOICE_POOL)]
    # small rate/pitch variation by hash
    rate_delta = (h % 21 - 10)  # -10% to +10%
    pitch_delta = ((h // 21) % 21 - 10)  # -10Hz to +10Hz
    return {
        "character": name,
        "voice_id": voice_id,
        "gender": gender,
        "style": style,
        "rate": f"{'+' if rate_delta >= 0 else ''}{rate_delta}%",
        "pitch": f"{'+' if pitch_delta >= 0 else ''}{pitch_delta}Hz",
    }


def assign_voices(characters: List[Dict]) -> Dict[str, Dict]:
    return {c["name"]: _voice_for_character(c["name"]) for c in characters}


async def _tts_to_file(text: str, voice_id: str, rate: str, pitch: str, out_path: Path) -> None:
    communicate = edge_tts.Communicate(text, voice=voice_id, rate=rate, pitch=pitch)
    await communicate.save(str(out_path))


async def synthesize_scene_audio(
    scene: Dict,
    voice_map: Dict[str, Dict],
    scene_dir: Path,
) -> Dict:
    """Synthesize all dialogue for a scene and mix into a single scene track.

    Returns metadata about generated audio files and the scene track path.
    """
    scene_dir.mkdir(parents=True, exist_ok=True)
    dialogue_files: List[Dict] = []

    # Sequentially synthesize each dialogue line
    cursor_ms = 0
    scene_track = AudioSegment.silent(duration=400)  # small lead-in silence
    cursor_ms = 400

    for idx, d in enumerate(scene["dialogue"]):
        char = d["character"]
        v = voice_map.get(char)
        if v is None:
            v = _voice_for_character(char)
            voice_map[char] = v

        out_file = scene_dir / f"dlg_{idx:03d}_{char.replace(' ', '_')}.mp3"
        try:
            await _tts_to_file(d["text"], v["voice_id"], v["rate"], v["pitch"], out_file)
        except Exception as e:
            # Skip this line on failure, record
            dialogue_files.append({
                "dialogue_id": d["id"],
                "character": char,
                "file": None,
                "error": str(e),
                "start_ms": cursor_ms,
                "duration_ms": 0,
            })
            continue

        seg = AudioSegment.from_file(str(out_file))
        # Normalize dialogue to approx -6 dBFS
        target_dbfs = -6.0
        gain = target_dbfs - seg.dBFS if seg.dBFS != float("-inf") else 0
        seg = seg.apply_gain(gain)

        # Append with small inter-line gap (250ms)
        scene_track += seg + AudioSegment.silent(duration=250)

        dialogue_files.append({
            "dialogue_id": d["id"],
            "character": char,
            "file": str(out_file),
            "start_ms": cursor_ms,
            "duration_ms": len(seg),
        })
        cursor_ms += len(seg) + 250

    # If no dialogue, create a 2s silent placeholder
    if len(scene["dialogue"]) == 0:
        scene_track = AudioSegment.silent(duration=2000)

    scene_wav = scene_dir / "scene_track.wav"
    scene_track.export(str(scene_wav), format="wav", parameters=["-ar", "44100", "-ac", "2"])

    return {
        "scene_id": scene["id"],
        "scene_track": str(scene_wav),
        "duration_ms": len(scene_track),
        "dialogue_files": dialogue_files,
    }


async def generate_all_audio(
    scenes: List[Dict],
    voice_map: Dict[str, Dict],
    project_dir: Path,
    progress_cb=None,
) -> Dict:
    audio_root = project_dir / "audio"
    audio_root.mkdir(parents=True, exist_ok=True)

    scene_tracks: List[Dict] = []
    total = len(scenes)
    for i, sc in enumerate(scenes):
        scene_dir = audio_root / f"scene_{sc['index']:03d}"
        meta = await synthesize_scene_audio(sc, voice_map, scene_dir)
        scene_tracks.append(meta)
        if progress_cb:
            await progress_cb(f"Audio scene {i+1}/{total} done", int((i + 1) / total * 100))

    # Build master track (concatenation of all scene tracks)
    master = AudioSegment.silent(duration=0)
    for st in scene_tracks:
        master += AudioSegment.from_file(st["scene_track"])

    master_path = audio_root / "master.wav"
    master.export(str(master_path), format="wav", parameters=["-ar", "44100", "-ac", "2"])

    return {
        "scene_tracks": scene_tracks,
        "master_track": str(master_path),
        "total_duration_ms": len(master),
        "voice_map": voice_map,
    }
