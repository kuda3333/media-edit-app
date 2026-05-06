"""End-to-end pytest suite for AI Animation Studio backend."""
import os
import io
import time
import uuid
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://10610352-f625-4bc8-bf8f-493af7b8d2cc.preview.emergentagent.com").rstrip("/")

# ---------- Shared session ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": "admin@example.com", "password": "admin123"},
                     timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Health & Meta ----------
class TestHealth:
    def test_health_ok(self, session):
        r = session.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"

    def test_meta_styles(self, session):
        r = session.get(f"{BASE_URL}/api/meta/styles", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("styles"), list)
        assert len(body["styles"]) >= 4
        ids = [s["id"] for s in body["styles"]]
        assert "flat_2d" in ids
        assert "anime" in ids
        assert isinstance(body.get("presets"), list)


# ---------- Auth ----------
class TestAuth:
    def test_signup_unique_user(self, session):
        email = f"e2e_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.io"
        r = session.post(f"{BASE_URL}/api/auth/signup",
                         json={"email": email, "password": "pw123456", "name": "E2E"},
                         timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["access_token"]
        assert data["user"]["email"] == email
        assert data["user"]["role"] == "user"

    def test_login_admin(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": "admin@example.com", "password": "admin123"},
                         timeout=15)
        assert r.status_code == 200
        assert r.json()["access_token"]

    def test_login_invalid(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login",
                         json={"email": "admin@example.com", "password": "wrong"},
                         timeout=15)
        assert r.status_code == 401

    def test_me(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == "admin@example.com"
        assert body["role"] == "admin"

    def test_protected_no_auth_returns_401(self, session):
        r = session.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401
        r2 = session.get(f"{BASE_URL}/api/projects", timeout=10)
        assert r2.status_code == 401


# ---------- Projects pipeline ----------
class TestProjectsPipeline:
    project_id = None
    final_video_url = None

    def test_create_project_and_run_pipeline(self, session, auth_headers, admin_token):
        script = (
            "INT. CAFE - DAY\n\nMAYA\nHello world.\n\n"
            "EXT. PARK - DAY\n\nMAYA\nGoodbye now."
        )
        r = session.post(
            f"{BASE_URL}/api/projects",
            headers=auth_headers,
            json={"title": "TEST_e2e_pipeline", "script": script, "style": "flat_2d"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["project_id"]
        assert data["status"] == "queued"
        assert data["scene_count"] >= 1
        TestProjectsPipeline.project_id = data["project_id"]

        # Poll status
        deadline = time.time() + 120
        last = None
        statuses_seen = set()
        while time.time() < deadline:
            sr = session.get(
                f"{BASE_URL}/api/projects/{TestProjectsPipeline.project_id}/status",
                headers=auth_headers,
                timeout=15,
            )
            assert sr.status_code == 200
            last = sr.json()
            statuses_seen.add(last["status"])
            if last["status"] in ("completed", "failed"):
                break
            time.sleep(3)
        assert last is not None
        assert last["status"] == "completed", f"pipeline did not complete: {last}"
        assert last["overall_progress"] == 100
        # Make sure transitions occurred
        assert "queued" in statuses_seen or "running" in statuses_seen
        vr = last.get("video_result") or {}
        assert vr.get("final_video_url"), f"no final_video_url: {last}"
        TestProjectsPipeline.final_video_url = vr["final_video_url"]

    def test_list_projects(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/projects", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(p["project_id"] == TestProjectsPipeline.project_id for p in items)

    def test_download_final_video(self, session, admin_token):
        pid = TestProjectsPipeline.project_id
        assert pid, "project not created"
        url = f"{BASE_URL}/api/projects/{pid}/files/video/final.mp4?token={admin_token}"
        r = session.get(url, timeout=30, stream=True)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        ctype = r.headers.get("content-type", "")
        assert "video" in ctype or "mp4" in ctype or "octet-stream" in ctype, ctype
        # ensure non-empty body
        chunk = next(r.iter_content(1024), b"")
        assert chunk and len(chunk) > 0


# ---------- Converter ----------
class TestConverter:
    def test_png_to_jpg(self, session, auth_headers):
        # create a small PNG in memory
        img = Image.new("RGB", (64, 64), color=(120, 60, 200))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        files = {"file": ("test.png", buf, "image/png")}
        data = {"target_format": "jpg"}
        r = session.post(
            f"{BASE_URL}/api/convert",
            headers=auth_headers,
            files=files,
            data=data,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["download_url"]
        assert body["filename"].endswith(".jpg")
        assert body["size_bytes"] > 0

        # GET converted file
        url = f"{BASE_URL}{body['download_url']}"
        r2 = session.get(url, headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        assert r2.content[:3] == b"\xff\xd8\xff"  # JPEG magic

    def test_convert_requires_auth(self, session):
        r = session.post(f"{BASE_URL}/api/convert", timeout=10)
        assert r.status_code == 401
