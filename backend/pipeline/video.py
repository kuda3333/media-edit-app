"""Module 4: Video Generation & Animation.

Composites backgrounds, character art, dialogue audio, and burnt-in captions
into a final H.264 MP4 using moviepy.

Animation rules implemented:
- Ken-Burns pan/zoom on backgrounds per scene (parallax feel)
- Character sprite overlay with subtle bob animation during speech
- Captions auto-generated from dialogue
- Fade transitions between scenes
"""
import os
import math
from pathlib import Path
from typing import Dict, List

from moviepy.editor import (
    AudioFileClip,
    CompositeVideoClip,
    ColorClip,
    ImageClip,
    TextClip,
    concatenate_videoclips,
    CompositeAudioClip,
)
from PIL import Image


VIDEO_WIDTH = 1280
VIDEO_HEIGHT = 720
FPS = 24


def _prepare_bg(path: str, target_w: int, target_h: int) -> str:
    """Resize background to cover the target with a small overscan for Ken-Burns."""
    img = Image.open(path).convert("RGB")
    # overscan 10% so we can pan/zoom inside
    w = int(target_w * 1.15)
    h = int(target_h * 1.15)
    img = img.resize((w, h), Image.LANCZOS)
    out = str(Path(path).with_name(Path(path).stem + "_oversize.jpg"))
    img.save(out, "JPEG", quality=88)
    return out


def _prepare_character(path: str, target_h: int = 480) -> str:
    """Resize character to a reasonable height with transparency preserved if possible."""
    img = Image.open(path).convert("RGBA")
    ratio = target_h / img.height
    new_w = int(img.width * ratio)
    img = img.resize((new_w, target_h), Image.LANCZOS)
    out = str(Path(path).with_name(Path(path).stem + "_sized.png"))
    img.save(out, "PNG")
    return out


def build_scene_clip(
    scene: Dict,
    bg_path: str,
    character_files: Dict[str, str],
    scene_audio_path: str,
    dialogue_meta: List[Dict],
) -> CompositeVideoClip:
    audio = AudioFileClip(scene_audio_path)
    duration = max(2.5, audio.duration)

    bg_ready = _prepare_bg(bg_path, VIDEO_WIDTH, VIDEO_HEIGHT)
    bg_clip = ImageClip(bg_ready).set_duration(duration)

    # Ken Burns: slow pan left->right + slight zoom
    def bg_position(t):
        progress = t / duration
        dx = -int((bg_clip.w - VIDEO_WIDTH) * progress)
        dy = -int((bg_clip.h - VIDEO_HEIGHT) * (0.5 + 0.1 * math.sin(progress * math.pi)))
        return (dx, dy)

    bg_clip = bg_clip.set_position(bg_position)

    layers = [bg_clip]

    # Character overlay for currently-speaking line
    for d in dialogue_meta:
        char = d["character"]
        sprite_path = character_files.get(char)
        if sprite_path is None or d.get("file") is None:
            continue
        try:
            sprite_ready = _prepare_character(sprite_path, target_h=int(VIDEO_HEIGHT * 0.75))
            start_s = d["start_ms"] / 1000.0
            dur_s = max(0.5, d["duration_ms"] / 1000.0)
            sprite = ImageClip(sprite_ready).set_start(start_s).set_duration(dur_s)
            # bob animation during speech
            def bobber(dur_s_=dur_s, start_s_=start_s):
                def pos(t):
                    local = t - start_s_
                    y = int(VIDEO_HEIGHT * 0.2 + 4 * math.sin(local * 10))
                    # alternate sides per dialogue index
                    return ("center", y)
                return pos
            sprite = sprite.set_position(bobber())
            sprite = sprite.crossfadein(0.15).crossfadeout(0.15)
            layers.append(sprite)
        except Exception:
            continue

    # Captions
    for d in dialogue_meta:
        if d.get("file") is None or not d.get("duration_ms"):
            continue
        start_s = d["start_ms"] / 1000.0
        dur_s = max(0.5, d["duration_ms"] / 1000.0)
        caption_text = f"{d['character']}: {_wrap_caption(_find_text(scene, d['dialogue_id']))}"
        try:
            cap = TextClip(
                caption_text,
                fontsize=30,
                color="white",
                bg_color="rgba(0,0,0,0.55)",
                size=(VIDEO_WIDTH - 80, None),
                method="caption",
                align="center",
            ).set_start(start_s).set_duration(dur_s).set_position(("center", VIDEO_HEIGHT - 130))
            layers.append(cap)
        except Exception:
            # TextClip requires ImageMagick; skip silently if unavailable
            pass

    # Scene label overlay (first 2s)
    try:
        label = f"{scene['heading']}  \u2022  mood: {scene['mood']}"
        label_clip = TextClip(
            label, fontsize=22, color="white", bg_color="rgba(0,0,0,0.5)",
        ).set_duration(min(2.0, duration)).set_position((30, 30)).crossfadein(0.3).crossfadeout(0.3)
        layers.append(label_clip)
    except Exception:
        pass

    comp = CompositeVideoClip(layers, size=(VIDEO_WIDTH, VIDEO_HEIGHT)).set_duration(duration)
    comp = comp.set_audio(audio)
    # fade in/out between scenes
    comp = comp.crossfadein(0.3)
    return comp


def _find_text(scene: Dict, dialogue_id: str) -> str:
    for d in scene["dialogue"]:
        if d["id"] == dialogue_id:
            return d["text"]
    return ""


def _wrap_caption(text: str, max_len: int = 90) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "\u2026"


def assemble_video(
    scenes: List[Dict],
    audio_result: Dict,
    art_result: Dict,
    project_dir: Path,
    progress_cb=None,
    _loop=None,  # event loop reference passed from the async caller
) -> Dict:
    """Assemble per-scene clips and concatenate into the final MP4."""
    video_dir = project_dir / "video"
    video_dir.mkdir(parents=True, exist_ok=True)

    bg_map = {b["scene_id"]: b["file"] for b in art_result["backgrounds"]}
    char_map = {c["name"]: c["file"] for c in art_result["character_sheets"]}
    scene_audio_map = {s["scene_id"]: s for s in audio_result["scene_tracks"]}

    clips = []
    total = len(scenes)
    # Limit runtime to 300s; trim scenes beyond the limit
    runtime_acc = 0.0
    for i, sc in enumerate(scenes):
        bg_path = bg_map.get(sc["id"])
        sc_audio = scene_audio_map.get(sc["id"])
        if not bg_path or not sc_audio:
            continue
        clip = build_scene_clip(
            sc,
            bg_path,
            char_map,
            sc_audio["scene_track"],
            sc_audio["dialogue_files"],
        )
        # Trim if we would exceed cap
        remaining = 300.0 - runtime_acc
        if remaining <= 0:
            break
        if clip.duration > remaining:
            clip = clip.subclip(0, remaining)
        clips.append(clip)
        runtime_acc += clip.duration
        if progress_cb and _loop is not None:
            # We're in a thread executor — schedule the coroutine on the main loop
            asyncio.run_coroutine_threadsafe(
                progress_cb(f"Assembled scene {i+1}/{total}", int((i + 1) / total * 80)),
                _loop,
            )

    if not clips:
        raise RuntimeError("No clips to assemble — art or audio missing for all scenes.")

    final = concatenate_videoclips(clips, method="compose")
    out_path = video_dir / "final.mp4"

    if progress_cb and _loop is not None:
        asyncio.run_coroutine_threadsafe(progress_cb("Encoding MP4", 85), _loop)

    final.write_videofile(
        str(out_path),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        preset="ultrafast",
        threads=2,
        verbose=False,
        logger=None,
        temp_audiofile=str(video_dir / "temp-audio.m4a"),
        remove_temp=True,
    )

    # Also produce a 9:16 variant for mobile/TikTok
    vertical_path = video_dir / "final_vertical.mp4"
    try:
        from moviepy.video.fx.all import crop
        v = final
        # scale to fit height, then center-crop to 9:16 width
        target_w = int(final.h * 9 / 16)
        if target_w <= final.w:
            v = crop(final, width=target_w, height=final.h, x_center=final.w / 2, y_center=final.h / 2)
            # resize to 720x1280
            v = v.resize((720, 1280))
            v.write_videofile(
                str(vertical_path),
                fps=FPS,
                codec="libx264",
                audio_codec="aac",
                preset="ultrafast",
                threads=2,
                verbose=False,
                logger=None,
                temp_audiofile=str(video_dir / "temp-audio-v.m4a"),
                remove_temp=True,
            )
    except Exception:
        vertical_path = None

    return {
        "final_video": str(out_path),
        "vertical_video": str(vertical_path) if vertical_path else None,
        "duration_sec": final.duration,
        "fps": FPS,
        "resolution": f"{VIDEO_WIDTH}x{VIDEO_HEIGHT}",
    }
