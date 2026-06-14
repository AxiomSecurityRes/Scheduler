"""헬스 체크 및 공개 설정 엔드포인트."""
from __future__ import annotations

from fastapi import APIRouter

from ..config import get_settings
from ..supabase_client import get_supabase

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict:
    """Render 헬스 체크용."""
    return {"status": "ok"}


@router.get("/public-config")
def public_config() -> dict:
    """프론트엔드가 필요로 하는 공개 설정 (anon 키는 별도)."""
    settings = get_settings()
    return {
        "supabaseConfigured": get_supabase() is not None,
        "vapidPublicKey": settings.vapid_public_key,
        "pushEnabled": bool(settings.vapid_public_key and settings.vapid_private_key),
    }
