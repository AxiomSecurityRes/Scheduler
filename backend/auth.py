"""Supabase JWT 검증 및 현재 사용자 의존성."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings


@dataclass
class CurrentUser:
    """검증된 액세스 토큰에서 추출한 사용자 정보."""

    id: str
    email: Optional[str] = None
    role: str = "authenticated"


def _decode(token: str) -> dict:
    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="서버 인증이 구성되지 않았습니다 (SUPABASE_JWT_SECRET 누락).",
        )
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"verify_aud": True},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "토큰이 만료되었습니다.")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "유효하지 않은 토큰입니다.")


def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> CurrentUser:
    """`Authorization: Bearer <token>` 헤더를 검증해 사용자 반환."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "인증 헤더가 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    payload = _decode(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "토큰에 sub 클레임이 없습니다.")
    return CurrentUser(
        id=sub,
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
    )


def get_optional_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[CurrentUser]:
    """토큰이 있으면 사용자, 없으면 None (오류를 던지지 않음)."""
    if not authorization:
        return None
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None


CurrentUserDep = Depends(get_current_user)
