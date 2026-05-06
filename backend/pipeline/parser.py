"""Module 1: Script Intake & Parsing.

Extracts scenes, characters, dialogue, and a beat map from a plain-text script
using regex heuristics (industry-standard screenplay conventions).
"""
import re
import uuid
from typing import Dict, List, Tuple

SCENE_HEADING_RE = re.compile(r"^\s*(INT\.|EXT\.|INT/EXT\.|I/E\.)\s*(.+)$", re.IGNORECASE)
CHARACTER_CUE_RE = re.compile(r"^\s*([A-Z][A-Z0-9 \-']{1,30})\s*(\(.*\))?\s*$")
PARENTHETICAL_RE = re.compile(r"^\s*\((.+)\)\s*$")
TIME_OF_DAY_RE = re.compile(r"\b(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|AFTERNOON|SUNSET|SUNRISE)\b", re.IGNORECASE)

MOOD_KEYWORDS = {
    "tense": ["tense", "nervous", "afraid", "scared", "anxious", "worried", "shouts", "shouting", "angry", "furious"],
    "warm": ["smile", "laugh", "warm", "gentle", "kind", "loving", "happy", "cheerful"],
    "sad": ["cry", "crying", "tears", "sad", "sobs", "grief", "mourn"],
    "mysterious": ["shadow", "dark", "whisper", "mysterious", "strange", "eerie"],
    "action": ["runs", "jumps", "fights", "chases", "explodes", "crash"],
    "romantic": ["kiss", "embrace", "gaze", "romantic", "love"],
    "comedic": ["laughs", "joke", "silly", "comic", "funny", "trips"],
}


def _detect_mood(text: str) -> str:
    text_lower = text.lower()
    scores: Dict[str, int] = {mood: 0 for mood in MOOD_KEYWORDS}
    for mood, kws in MOOD_KEYWORDS.items():
        for kw in kws:
            scores[mood] += text_lower.count(kw)
    best = max(scores.items(), key=lambda x: x[1])
    return best[0] if best[1] > 0 else "neutral"


def _detect_time_of_day(heading: str) -> str:
    m = TIME_OF_DAY_RE.search(heading)
    return m.group(1).lower() if m else "day"


def _estimate_dialogue_duration(text: str) -> float:
    """Rough duration in seconds: 150 words/min, min 1.5s, max 12s."""
    words = len(text.split())
    seconds = max(1.5, min(12.0, words / 150.0 * 60.0))
    return round(seconds, 2)


def parse_script(script: str, max_runtime_sec: int = 300) -> Dict:
    """Parse a plain-text script into a structured project plan.

    Returns a dict with: scenes, characters, beat_map, total_estimated_duration.
    """
    lines = script.splitlines()
    scenes: List[Dict] = []
    characters: Dict[str, Dict] = {}

    current_scene: Dict = None
    current_character: str = None
    current_dialogue: List[str] = []
    current_parenthetical: str = ""
    pending_action: List[str] = []

    def finalize_dialogue():
        nonlocal current_character, current_dialogue, current_parenthetical
        if current_character and current_dialogue and current_scene is not None:
            text = " ".join(current_dialogue).strip()
            if text:
                dur = _estimate_dialogue_duration(text)
                current_scene["dialogue"].append({
                    "id": str(uuid.uuid4()),
                    "character": current_character,
                    "text": text,
                    "parenthetical": current_parenthetical,
                    "est_duration_sec": dur,
                })
                if current_character not in characters:
                    characters[current_character] = {
                        "name": current_character,
                        "description": "",
                        "line_count": 0,
                        "total_words": 0,
                    }
                characters[current_character]["line_count"] += 1
                characters[current_character]["total_words"] += len(text.split())
        current_character = None
        current_dialogue = []
        current_parenthetical = ""

    def finalize_scene():
        nonlocal pending_action
        if current_scene is not None:
            if pending_action:
                current_scene["action"] += " " + " ".join(pending_action)
                current_scene["action"] = current_scene["action"].strip()
            pending_action = []
            # compute est duration for scene
            d = sum(d["est_duration_sec"] for d in current_scene["dialogue"])
            action_dur = max(2.0, min(6.0, len(current_scene["action"].split()) / 120.0 * 60.0))
            current_scene["est_duration_sec"] = round(d + action_dur, 2)
            current_scene["mood"] = _detect_mood(current_scene["action"] + " " + " ".join(d["text"] for d in current_scene["dialogue"]))

    for raw in lines:
        line = raw.rstrip()

        m = SCENE_HEADING_RE.match(line)
        if m:
            finalize_dialogue()
            finalize_scene()
            heading = line.strip()
            current_scene = {
                "id": str(uuid.uuid4()),
                "index": len(scenes),
                "heading": heading,
                "location": m.group(2).strip(),
                "time_of_day": _detect_time_of_day(heading),
                "action": "",
                "dialogue": [],
                "mood": "neutral",
                "est_duration_sec": 0.0,
            }
            scenes.append(current_scene)
            continue

        if current_scene is None:
            # Pre-scene narrative becomes a default opening scene
            current_scene = {
                "id": str(uuid.uuid4()),
                "index": 0,
                "heading": "OPENING",
                "location": "opening",
                "time_of_day": "day",
                "action": "",
                "dialogue": [],
                "mood": "neutral",
                "est_duration_sec": 0.0,
            }
            scenes.append(current_scene)

        if not line.strip():
            finalize_dialogue()
            continue

        pm = PARENTHETICAL_RE.match(line)
        if pm and current_character is not None:
            current_parenthetical = pm.group(1).strip()
            continue

        cm = CHARACTER_CUE_RE.match(line)
        # Heuristic: character cue is fully uppercase, short, no period
        if cm and line.strip() == line.strip().upper() and "." not in line and len(line.strip()) < 30:
            finalize_dialogue()
            # flush pending action to scene
            if pending_action:
                current_scene["action"] += " " + " ".join(pending_action)
                current_scene["action"] = current_scene["action"].strip()
                pending_action = []
            current_character = cm.group(1).strip()
            continue

        if current_character is not None:
            current_dialogue.append(line.strip())
        else:
            pending_action.append(line.strip())

    finalize_dialogue()
    finalize_scene()

    # Build beat map
    t = 0.0
    beat_map = []
    for sc in scenes:
        beat_map.append({
            "scene_id": sc["id"],
            "scene_index": sc["index"],
            "start_sec": round(t, 2),
            "end_sec": round(t + sc["est_duration_sec"], 2),
            "mood": sc["mood"],
        })
        t += sc["est_duration_sec"]

    total = round(t, 2)
    warning = None
    if total > max_runtime_sec:
        warning = f"Script est. runtime {total}s exceeds {max_runtime_sec}s limit. Will auto-trim in render."

    # Character design briefs
    for name, c in characters.items():
        c["description"] = f"{name.title()} — 2D animated character, expressive face, dynamic pose"

    return {
        "scenes": scenes,
        "characters": list(characters.values()),
        "beat_map": beat_map,
        "total_estimated_duration_sec": total,
        "max_runtime_sec": max_runtime_sec,
        "warning": warning,
    }
