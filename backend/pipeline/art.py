"""Module 3: Character & Background Art Generation.

Uses Pollinations.ai free text-to-image endpoint (no API key required, open API).
Falls back to a stylized PIL-generated gradient if the service fails.
"""
import asyncio
import hashlib
import urllib.parse
from pathlib import Path
from typing import Dict, List

import aiofiles
import aiohttp
from PIL import Image, ImageDraw, ImageFont, ImageFilter

POLLINATIONS_BASE = "https://image.pollinations.ai/prompt/"


STYLE_PROMPTS = {
    "flat_2d": "2D flat animation, clean line art, limited color palette, vector illustration",
    "anime": "anime style, cel shaded, studio ghibli inspired, vibrant colors, detailed background",
    "comic_book": "comic book style, bold ink outlines, halftone shading, dynamic composition",
    "cut_out": "paper cut-out style, layered, textured paper, soft shadows",
    "rubber_hose": "1930s rubber hose cartoon style, black and white with sepia tones, curved lines",
    "motion_comic": "motion comic, graphic novel, cinematic lighting, painterly brushstrokes",
}


def _build_prompt(base: str, style: str) -> str:
    style_hint = STYLE_PROMPTS.get(style, STYLE_PROMPTS["flat_2d"])
    return f"{base}, {style_hint}, high quality, detailed, 4k"


def _pollinations_url(prompt: str, seed: int, width: int = 1280, height: int = 720) -> str:
    encoded = urllib.parse.quote(prompt)
    return (
        f"{POLLINATIONS_BASE}{encoded}"
        f"?width={width}&height={height}&seed={seed}&nologo=true&enhance=true"
    )


async def _download_image(url: str, out_path: Path, timeout_sec: int = 90) -> bool:
    try:
        timeout = aiohttp.ClientTimeout(total=timeout_sec)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    return False
                data = await resp.read()
                if len(data) < 1024:
                    return False
                async with aiofiles.open(out_path, "wb") as f:
                    await f.write(data)
                # validate it is an image
                try:
                    Image.open(str(out_path)).verify()
                    return True
                except Exception:
                    return False
    except Exception:
        return False


def _fallback_gradient(out_path: Path, label: str, mood: str, width: int = 1280, height: int = 720) -> None:
    """Generate a stylized gradient placeholder when external art service fails."""
    mood_palettes = {
        "tense": [(20, 8, 40), (160, 20, 60)],
        "warm": [(255, 170, 80), (255, 90, 110)],
        "sad": [(30, 60, 120), (15, 20, 50)],
        "mysterious": [(10, 10, 40), (60, 20, 90)],
        "action": [(255, 60, 30), (30, 20, 20)],
        "romantic": [(220, 100, 140), (100, 40, 80)],
        "comedic": [(255, 220, 60), (255, 120, 40)],
        "neutral": [(40, 40, 60), (15, 15, 25)],
        "day": [(120, 180, 230), (30, 60, 100)],
        "night": [(10, 15, 40), (40, 20, 70)],
    }
    top, bot = mood_palettes.get(mood, mood_palettes["neutral"])
    img = Image.new("RGB", (width, height), color=bot)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        f = y / height
        r = int(top[0] * (1 - f) + bot[0] * f)
        g = int(top[1] * (1 - f) + bot[1] * f)
        b = int(top[2] * (1 - f) + bot[2] * f)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    # overlay label
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 42)
    except Exception:
        font = ImageFont.load_default()
    text = label[:60]
    tw = draw.textlength(text, font=font)
    draw.text(((width - tw) / 2, height / 2 - 20), text, fill=(255, 255, 255), font=font)
    img = img.filter(ImageFilter.GaussianBlur(radius=1))
    img.save(str(out_path), "PNG")


async def generate_background(
    scene: Dict, style: str, out_dir: Path, width: int = 1280, height: int = 720
) -> Dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    prompt = _build_prompt(
        f"cinematic background illustration of {scene['location']} during {scene['time_of_day']}, mood: {scene['mood']}",
        style,
    )
    seed = int(hashlib.md5(scene["id"].encode()).hexdigest()[:8], 16) % 1000000
    url = _pollinations_url(prompt, seed, width=width, height=height)
    bg_path = out_dir / f"scene_{scene['index']:03d}_bg.png"

    ok = await _download_image(url, bg_path)
    if not ok:
        _fallback_gradient(bg_path, scene["location"] or "Scene", scene["mood"], width, height)
        source = "fallback"
    else:
        source = "pollinations"

    return {
        "scene_id": scene["id"],
        "scene_index": scene["index"],
        "file": str(bg_path),
        "prompt": prompt,
        "source": source,
    }


async def generate_character(
    character: Dict, style: str, out_dir: Path, width: int = 512, height: int = 768
) -> Dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    prompt = _build_prompt(
        f"full-body 2D character portrait of {character['name']}, {character['description']}, neutral pose, transparent background, centered",
        style,
    )
    seed = int(hashlib.md5(character["name"].encode()).hexdigest()[:8], 16) % 1000000
    url = _pollinations_url(prompt, seed, width=width, height=height)
    char_path = out_dir / f"char_{character['name'].replace(' ', '_')}.png"

    ok = await _download_image(url, char_path)
    if not ok:
        _fallback_gradient(char_path, character["name"], "neutral", width, height)
        source = "fallback"
    else:
        source = "pollinations"

    return {
        "name": character["name"],
        "file": str(char_path),
        "prompt": prompt,
        "source": source,
    }


async def generate_all_art(
    scenes: List[Dict],
    characters: List[Dict],
    style: str,
    project_dir: Path,
    progress_cb=None,
) -> Dict:
    art_root = project_dir / "art"
    art_root.mkdir(parents=True, exist_ok=True)

    # Run background and character generation concurrently but with a small
    # concurrency limit so we don't hammer the free endpoint.
    sem = asyncio.Semaphore(3)

    async def _run_bg(sc):
        async with sem:
            return await generate_background(sc, style, art_root / "backgrounds")

    async def _run_char(c):
        async with sem:
            return await generate_character(c, style, art_root / "characters")

    total = len(scenes) + len(characters)
    completed = 0
    backgrounds: List[Dict] = []
    character_sheets: List[Dict] = []

    bg_tasks = [asyncio.create_task(_run_bg(s)) for s in scenes]
    char_tasks = [asyncio.create_task(_run_char(c)) for c in characters]

    for task in asyncio.as_completed(bg_tasks + char_tasks):
        res = await task
        if "scene_id" in res:
            backgrounds.append(res)
        else:
            character_sheets.append(res)
        completed += 1
        if progress_cb:
            await progress_cb(f"Art asset {completed}/{total}", int(completed / max(total, 1) * 100))

    backgrounds.sort(key=lambda x: x["scene_index"])
    return {
        "backgrounds": backgrounds,
        "character_sheets": character_sheets,
        "style": style,
    }
