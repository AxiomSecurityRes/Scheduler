"""FastAPI 진입점 — API + PWA 정적 프론트엔드 서빙 + 스케줄러."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .reminders import run_deadline_reminders
from .routers import health, neis, notifications

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

_scheduler: BackgroundScheduler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 시 백그라운드 스케줄러 관리."""
    global _scheduler
    settings = get_settings()
    if settings.enable_scheduler:
        _scheduler = BackgroundScheduler(timezone="Asia/Seoul")
        # 매일 오전 8시(KST) 마감 임박 알림
        _scheduler.add_job(
            run_deadline_reminders,
            CronTrigger(hour=8, minute=0),
            id="deadline_reminders",
            replace_existing=True,
        )
        _scheduler.start()
        logger.info("백그라운드 스케줄러 시작됨 (매일 08:00 KST).")
    try:
        yield
    finally:
        if _scheduler:
            _scheduler.shutdown(wait=False)
            logger.info("스케줄러 종료됨.")


app = FastAPI(
    title="중1 8반 스케줄러 API",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API 라우터 ---
app.include_router(health.router)
app.include_router(notifications.router)
app.include_router(neis.router)


# --- PWA 정적 파일 서빙 ---
# /js, /css, /icons 등 정적 자원
if FRONTEND_DIR.exists():
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/icons", StaticFiles(directory=FRONTEND_DIR / "icons"), name="icons")


def _file(name: str) -> FileResponse:
    return FileResponse(FRONTEND_DIR / name)


@app.get("/manifest.json", include_in_schema=False)
def manifest():
    return _file("manifest.json")


@app.get("/service-worker.js", include_in_schema=False)
def service_worker():
    # SW 는 루트 스코프에서 동작해야 하므로 루트 경로로 서빙
    return FileResponse(
        FRONTEND_DIR / "service-worker.js",
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/"},
    )


@app.get("/offline.html", include_in_schema=False)
def offline():
    return _file("offline.html")


@app.get("/", include_in_schema=False)
def index():
    if not (FRONTEND_DIR / "index.html").exists():
        return JSONResponse({"detail": "frontend 가 빌드되지 않았습니다."}, 404)
    return _file("index.html")


# SPA 폴백 — API 가 아닌 경로는 index.html 로 (해시 라우팅 사용)
@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    candidate = FRONTEND_DIR / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return _file("index.html")
