"""푸시 구독/해제 및 마감 알림 트리거 API."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth import CurrentUser, get_current_user
from ..push import push_to_user
from ..reminders import run_deadline_reminders
from ..supabase_client import get_supabase

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class SubscriptionIn(BaseModel):
    endpoint: str
    keys: PushKeys


class TestPushIn(BaseModel):
    title: str = "테스트 알림"
    body: str = "푸시 알림이 정상 동작합니다 🔔"


def _require_sb():
    sb = get_supabase()
    if sb is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "서버 Supabase 가 구성되지 않았습니다.",
        )
    return sb


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
def subscribe(
    sub: SubscriptionIn,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """현재 사용자의 Web Push 구독 저장(업서트)."""
    sb = _require_sb()
    sb.table("push_subscriptions").upsert(
        {
            "user_id": user.id,
            "endpoint": sub.endpoint,
            "p256dh": sub.keys.p256dh,
            "auth": sub.keys.auth,
        },
        on_conflict="endpoint",
    ).execute()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(
    endpoint: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """구독 해제."""
    sb = _require_sb()
    sb.table("push_subscriptions").delete().eq("endpoint", endpoint).eq(
        "user_id", user.id
    ).execute()
    return {"ok": True}


@router.post("/test")
def test_push(
    body: TestPushIn,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """본인에게 테스트 푸시 전송."""
    sent = push_to_user(
        user.id, {"title": body.title, "body": body.body, "url": "#/"}
    )
    return {"sent": sent}


def _require_admin(user: CurrentUser) -> None:
    sb = _require_sb()
    row = (
        sb.table("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
        .execute()
        .data
    )
    if not row or row.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "관리자 권한이 필요합니다.")


@router.post("/run-reminders")
def run_reminders(
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """관리자가 수동으로 마감 임박 알림을 트리거."""
    _require_admin(user)
    return run_deadline_reminders()
