"""service_role 권한의 Supabase 클라이언트 (서버 전용)."""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from supabase import Client, create_client

from .config import get_settings


@lru_cache
def get_supabase() -> Optional[Client]:
    """service_role 키로 생성한 Supabase 클라이언트.

    설정이 비어 있으면(로컬 개발 등) None 을 반환하여 서버가
    죽지 않고 기능만 비활성화되도록 한다.
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
