"""AI Animation Studio — FastAPI backend.

Auth: JWT email/password (bcrypt hashing), Bearer tokens for mobile.
Core: Projects CRUD + script-to-video pipeline orchestration.
Tools: Media conversion endpoints.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import shutil
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks, UploadFile, File, Form, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from pipeline.runner import PipelineRunner
from pipeline.parser import parse_script
from pipeline.converter import dispatch_convert, VIDEO_PRESETS, detect_kind

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
WORKSPACE_DIR = Path(os.environ.get("WORKSPACE_DIR", "/app/workspace"))
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("anim-studio")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

runner = PipelineRunner(db, WORKSPACE_DIR)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    await db.users.create_index("email", unique=True)
    await db.projects.create_index([("owner_id", 1), ("created_at", -1)])
    await db.projects.create_index("project_id", unique=True)
    await _seed_admin()
    logger.info("Startup complete. Workspace: %s", WORKSPACE_DIR)
    yield
    # ── Shutdown ──
    client.close()


app = FastAPI(title="AI Animation Studio API", lifespan=lifespan)
api = APIRouter(prefix="/api")

bearer = HTTPBearer(auto_error=False)


# ---------- Models ----------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: str = "user"
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CreateProjectIn(BaseModel):
    title: str
    script: str
    style: str = "flat_2d"


class ConvertIn(BaseModel):
    target_format: str
    preset: Optional[str] = None
    trim_start: Optional[float] = None
    trim_end: Optional[float] = None
    speed: Optional[float] = None
    rotate: Optional[int] = None
    watermark: Optional[str] = None


# ---------- Auth utils ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> Dict:
    token = creds.credentials if creds and creds.credentials else request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def user_out(user: Dict) -> UserOut:
    return UserOut(
        id=user["id"],
        email=user["email"],
        name=user.get("name"),
        role=user.get("role", "user"),
        created_at=user["created_at"],
    )


async def _seed_admin():
    email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "name": "Admin",
            "role": "admin",
            "password_hash": hash_password(pw),
            "created_at": datetime.now(timezone.utc),
        })
        logger.info("Seeded admin user %s", email)
    elif not verify_password(pw, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw)}})
        logger.info("Updated admin password for %s", email)




# ---------- Auth endpoints ----------
@api.post("/auth/signup", response_model=TokenOut)
async def signup(body: SignupIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name or email.split("@")[0],
        "role": "user",
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], user["email"])
    return TokenOut(access_token=token, user=user_out(user))


@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"])
    return TokenOut(access_token=token, user=user_out(user))


@api.get("/auth/me", response_model=UserOut)
async def me(user: Dict = Depends(get_current_user)):
    return user_out(user)


# ---------- Projects ----------
def _sanitize_project(p: Dict) -> Dict:
    p = dict(p)
    p.pop("_id", None)
    # absolute filesystem paths should not leak raw; convert to URL paths
    pid = p.get("project_id")
    if pid:
        base = f"/api/projects/{pid}/files"
        def map_file(fp):
            if not fp: return None
            try:
                rel = Path(fp).relative_to(WORKSPACE_DIR / pid)
                return f"{base}/{rel.as_posix()}"
            except Exception:
                return None
        vr = p.get("video_result")
        if vr:
            vr["final_video_url"] = map_file(vr.get("final_video"))
            vr["vertical_video_url"] = map_file(vr.get("vertical_video"))
        ar = p.get("art_result")
        if ar:
            for b in ar.get("backgrounds", []): b["file_url"] = map_file(b.get("file"))
            for c in ar.get("character_sheets", []): c["file_url"] = map_file(c.get("file"))
        au = p.get("audio_result")
        if au:
            au["master_url"] = map_file(au.get("master_track"))
            for s in au.get("scene_tracks", []):
                s["track_url"] = map_file(s.get("scene_track"))
    return p


@api.post("/projects")
async def create_project(body: CreateProjectIn, bg: BackgroundTasks, user: Dict = Depends(get_current_user)):
    # content policy quick filter
    banned = ["nsfw", "porn", "rape", "child porn"]
    lowered = body.script.lower()
    for term in banned:
        if term in lowered:
            raise HTTPException(status_code=400, detail="Script rejected by content policy.")

    project_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    # pre-parse to show quick preview (cheap)
    try:
        preview = parse_script(body.script)
    except Exception:
        preview = {"scenes": [], "characters": [], "beat_map": [], "total_estimated_duration_sec": 0, "warning": None}

    doc = {
        "project_id": project_id,
        "owner_id": user["id"],
        "title": body.title,
        "style": body.style,
        "script": body.script,
        "status": "queued",
        "overall_progress": 0,
        "current_module": "queued",
        "logs": [],
        "parsed": preview,
        "scene_count": len(preview.get("scenes", [])),
        "character_count": len(preview.get("characters", [])),
        "created_at": now,
        "updated_at": now,
    }
    await db.projects.insert_one(doc)
    # launch background pipeline
    asyncio.create_task(runner.run_all(project_id, body.script, body.style))
    return _sanitize_project(doc)


@api.get("/projects")
async def list_projects(user: Dict = Depends(get_current_user)):
    cursor = db.projects.find(
        {"owner_id": user["id"]},
        {"_id": 0, "logs": 0, "parsed.scenes": 0, "audio_result": 0, "art_result": 0},
    ).sort("created_at", -1)
    items = await cursor.to_list(200)
    return [_sanitize_project(p) for p in items]


@api.get("/projects/{project_id}")
async def get_project(project_id: str, user: Dict = Depends(get_current_user)):
    p = await db.projects.find_one({"project_id": project_id, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return _sanitize_project(p)


@api.get("/projects/{project_id}/status")
async def project_status(project_id: str, user: Dict = Depends(get_current_user)):
    p = await db.projects.find_one(
        {"project_id": project_id, "owner_id": user["id"]},
        {"_id": 0, "project_id": 1, "status": 1, "current_module": 1, "overall_progress": 1,
         "scene_count": 1, "character_count": 1, "logs": {"$slice": -20}, "error": 1,
         "video_result": 1},
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return _sanitize_project(p)


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: Dict = Depends(get_current_user)):
    p = await db.projects.find_one({"project_id": project_id, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.delete_one({"project_id": project_id})
    proj_dir = WORKSPACE_DIR / project_id
    if proj_dir.exists():
        shutil.rmtree(proj_dir, ignore_errors=True)
    return {"ok": True}


@api.post("/projects/{project_id}/retry")
async def retry_project(project_id: str, user: Dict = Depends(get_current_user)):
    p = await db.projects.find_one({"project_id": project_id, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "queued", "overall_progress": 0, "current_module": "queued", "error": None, "logs": []}},
    )
    asyncio.create_task(runner.run_all(project_id, p["script"], p.get("style", "flat_2d")))
    return {"ok": True}


# ---------- File serving ----------
@api.get("/projects/{project_id}/files/{file_path:path}")
async def get_project_file(project_id: str, file_path: str, user: Dict = Depends(get_current_user)):
    p = await db.projects.find_one({"project_id": project_id, "owner_id": user["id"]}, {"_id": 0, "project_id": 1})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    full = WORKSPACE_DIR / project_id / file_path
    try:
        full_resolved = full.resolve()
        base_resolved = (WORKSPACE_DIR / project_id).resolve()
        if not str(full_resolved).startswith(str(base_resolved)):
            raise HTTPException(status_code=400, detail="Invalid path")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(full))


# ---------- Style presets ----------
@api.get("/meta/styles")
async def get_styles():
    return {
        "styles": [
            {"id": "flat_2d", "label": "2D Flat Animation"},
            {"id": "anime", "label": "Anime"},
            {"id": "comic_book", "label": "Comic Book"},
            {"id": "cut_out", "label": "Cut-out"},
            {"id": "rubber_hose", "label": "Rubber Hose"},
            {"id": "motion_comic", "label": "Motion Comic"},
        ],
        "presets": list(VIDEO_PRESETS.keys()),
    }


# ---------- Media Converter ----------
CONVERT_DIR = WORKSPACE_DIR / "_convert"
CONVERT_DIR.mkdir(parents=True, exist_ok=True)


@api.post("/convert")
async def convert_media(
    file: UploadFile = File(...),
    target_format: str = Form(...),
    preset: Optional[str] = Form(None),
    trim_start: Optional[float] = Form(None),
    trim_end: Optional[float] = Form(None),
    speed: Optional[float] = Form(None),
    rotate: Optional[int] = Form(None),
    watermark: Optional[str] = Form(None),
    user: Dict = Depends(get_current_user),
):
    src_ext = Path(file.filename).suffix.lower().lstrip(".")
    tgt_ext = target_format.lower().lstrip(".")
    try:
        detect_kind(src_ext); detect_kind(tgt_ext)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    job_id = str(uuid.uuid4())
    job_dir = CONVERT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    src_path = job_dir / f"src.{src_ext}"
    dst_path = job_dir / f"out.{tgt_ext}"
    with open(src_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    options = {
        "preset": preset, "trim_start": trim_start, "trim_end": trim_end,
        "speed": speed, "rotate": rotate, "watermark": watermark,
    }
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: dispatch_convert(src_path, dst_path, options))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {e}")

    return {
        "job_id": job_id,
        "download_url": f"/api/convert/{job_id}/download",
        "filename": f"converted.{tgt_ext}",
        "size_bytes": dst_path.stat().st_size,
    }


@api.get("/convert/{job_id}/download")
async def download_converted(job_id: str, user: Dict = Depends(get_current_user)):
    job_dir = CONVERT_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    out = next(job_dir.glob("out.*"), None)
    if not out:
        raise HTTPException(status_code=404, detail="Output missing")
    return FileResponse(str(out), filename=out.name)


@api.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


# ---------- Mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
