"""Module 5: Media Conversion Tools.

Supports video/audio/image format conversions, aspect-ratio presets, trim,
watermark, speed ramp, and subtitle burn-in using ffmpeg, Pillow, and pydub.
"""
import os
import subprocess
from pathlib import Path
from typing import Dict, Optional

from PIL import Image
from pydub import AudioSegment

VIDEO_PRESETS = {
    "4k": (3840, 2160),
    "1080p": (1920, 1080),
    "720p": (1280, 720),
    "480p": (854, 480),
    "square": (1080, 1080),
    "vertical": (720, 1280),
}

VIDEO_EXT = {"mp4", "mov", "webm", "avi", "gif"}
AUDIO_EXT = {"wav", "mp3", "ogg", "aac", "flac"}
IMAGE_EXT = {"png", "jpg", "jpeg", "webp", "gif", "bmp"}


def _run(cmd: list) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[-800:]}")


def convert_image(src: Path, dst: Path) -> None:
    img = Image.open(str(src))
    ext = dst.suffix.lower().lstrip(".")
    if ext in ("jpg", "jpeg"):
        img = img.convert("RGB")
        img.save(str(dst), "JPEG", quality=92)
    elif ext == "png":
        img.save(str(dst), "PNG")
    elif ext == "webp":
        img.save(str(dst), "WEBP", quality=90)
    elif ext == "gif":
        img.save(str(dst), "GIF")
    elif ext == "bmp":
        img.convert("RGB").save(str(dst), "BMP")
    else:
        raise ValueError(f"Unsupported image format: {ext}")


def convert_audio(src: Path, dst: Path) -> None:
    ext = dst.suffix.lower().lstrip(".")
    audio = AudioSegment.from_file(str(src))
    fmt = {"mp3": "mp3", "wav": "wav", "ogg": "ogg", "aac": "adts", "flac": "flac"}.get(ext)
    if not fmt:
        raise ValueError(f"Unsupported audio format: {ext}")
    audio.export(str(dst), format=fmt)


def convert_video(
    src: Path,
    dst: Path,
    preset: Optional[str] = None,
    trim_start: Optional[float] = None,
    trim_end: Optional[float] = None,
    speed: Optional[float] = None,
    rotate: Optional[int] = None,
    watermark_text: Optional[str] = None,
    subtitle_file: Optional[Path] = None,
) -> None:
    ext = dst.suffix.lower().lstrip(".")
    if ext not in VIDEO_EXT:
        raise ValueError(f"Unsupported video format: {ext}")

    cmd = ["ffmpeg", "-y"]
    if trim_start is not None:
        cmd += ["-ss", str(trim_start)]
    cmd += ["-i", str(src)]
    if trim_end is not None and trim_start is not None:
        cmd += ["-t", str(max(0.1, trim_end - trim_start))]
    elif trim_end is not None:
        cmd += ["-to", str(trim_end)]

    vfilters = []
    if preset and preset in VIDEO_PRESETS:
        w, h = VIDEO_PRESETS[preset]
        vfilters.append(f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black")
    if rotate:
        mapping = {90: "transpose=1", 180: "transpose=2,transpose=2", 270: "transpose=2"}
        if rotate in mapping:
            vfilters.append(mapping[rotate])
    if speed and speed > 0 and speed != 1.0:
        vfilters.append(f"setpts={1.0/speed}*PTS")
    if watermark_text:
        safe = watermark_text.replace(":", "\\:").replace("'", "\\'")
        vfilters.append(
            f"drawtext=text='{safe}':fontcolor=white:fontsize=28:"
            f"box=1:boxcolor=black@0.4:boxborderw=8:x=w-tw-20:y=h-th-20"
        )
    if subtitle_file:
        vfilters.append(f"subtitles='{str(subtitle_file)}'")

    if ext == "gif":
        # GIF needs its own vf chain — override any earlier vfilters
        gif_filters = "fps=15,scale=480:-1:flags=lanczos"
        if vfilters:
            # prepend existing transform filters (scale/rotate/speed) but NOT drawtext/subtitles
            safe = [f for f in vfilters if not f.startswith("drawtext") and not f.startswith("subtitles")]
            if safe:
                gif_filters = ",".join(safe) + "," + gif_filters
        cmd += ["-vf", gif_filters, "-an"]
    else:
        if vfilters:
            cmd += ["-vf", ",".join(vfilters)]
        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"]
        cmd += ["-c:a", "aac", "-b:a", "128k"]
    # audio speed filter (must come after afilters list is declared)
    afilters = []
    if speed and speed > 0 and speed != 1.0:
        # chain atempo between 0.5 and 2.0 per stage
        s = speed
        stages = []
        while s > 2.0:
            stages.append(2.0)
            s /= 2.0
        while s < 0.5:
            stages.append(0.5)
            s /= 0.5
        stages.append(s)
        if ext != "gif":  # GIF has no audio
            afilters.append(",".join(f"atempo={v}" for v in stages))
    if afilters:
        cmd += ["-af", ",".join(afilters)]

    cmd += [str(dst)]
    _run(cmd)


def extract_audio(src: Path, dst: Path) -> None:
    ext = dst.suffix.lower().lstrip(".")
    fmt_map = {"mp3": ["-c:a", "libmp3lame"], "wav": [], "aac": ["-c:a", "aac"], "ogg": ["-c:a", "libvorbis"], "flac": ["-c:a", "flac"]}
    if ext not in fmt_map:
        raise ValueError(f"Unsupported audio extract format: {ext}")
    cmd = ["ffmpeg", "-y", "-i", str(src), "-vn"] + fmt_map[ext] + [str(dst)]
    _run(cmd)


def detect_kind(ext: str) -> str:
    ext = ext.lower().lstrip(".")
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in IMAGE_EXT:
        return "image"
    raise ValueError(f"Unsupported extension: {ext}")


def dispatch_convert(src: Path, dst: Path, options: Dict) -> None:
    src_kind = detect_kind(src.suffix)
    dst_kind = detect_kind(dst.suffix)

    if src_kind == "video" and dst_kind == "audio":
        extract_audio(src, dst)
        return
    if src_kind != dst_kind:
        raise ValueError(f"Cannot convert {src_kind} -> {dst_kind}")

    if src_kind == "image":
        convert_image(src, dst)
    elif src_kind == "audio":
        convert_audio(src, dst)
    else:
        convert_video(
            src,
            dst,
            preset=options.get("preset"),
            trim_start=options.get("trim_start"),
            trim_end=options.get("trim_end"),
            speed=options.get("speed"),
            rotate=options.get("rotate"),
            watermark_text=options.get("watermark"),
        )
