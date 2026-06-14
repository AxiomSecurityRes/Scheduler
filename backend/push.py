"""Web Push 전송 로직 (pywebpush + VAPID)."""
from __future__ import annotations

import json
import logging
from typing import Iterable

from pywebpush import WebPushException, webpush

from .config import get_settings
from .supabase_client import get_supabase

logger = logging.getLogger("push")


def _vapid_claims() -> dict:
    return {"sub": get_settings().vapid_subject}


def send_web_push(subscription: dict, payload: dict) -> bool:
    """단일 구독에 푸시 전송. 성공 여부 반환.

    subscription 형식:
        {"endpoint": "...", "keys": {"p256dh": "...", "auth": "..."}}
    """
    settings = get_settings()
    if not settings.vapid_private_key:
        logger.warning("VAPID 개인키가 없어 푸시를 보낼 수 없습니다.")
        return False
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims=dict(_vapid_claims()),
            ttl=60 * 60 * 24,
        )
        return True
    except WebPushException as exc:  # pragma: no cover - 외부 의존
        logger.warning("푸시 전송 실패: %s", exc)
        # 만료/삭제된 구독은 정리
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (404, 410):
            _delete_subscription(subscription.get("endpoint"))
        return False


def _delete_subscription(endpoint: str | None) -> None:
    if not endpoint:
        return
    sb = get_supabase()
    if sb is None:
        return
    try:
        sb.table("push_subscriptions").delete().eq("endpoint", endpoint).execute()
    except Exception as exc:  # pragma: no cover
        logger.warning("만료 구독 삭제 실패: %s", exc)


def push_to_user(user_id: str, payload: dict) -> int:
    """특정 사용자의 모든 구독에 푸시 전송. 성공 건수 반환."""
    sb = get_supabase()
    if sb is None:
        return 0
    rows = (
        sb.table("push_subscriptions")
        .select("endpoint,p256dh,auth")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    return _broadcast(rows, payload)


def push_to_all(payload: dict) -> int:
    """모든 구독에 푸시 전송. 성공 건수 반환."""
    sb = get_supabase()
    if sb is None:
        return 0
    rows = (
        sb.table("push_subscriptions")
        .select("endpoint,p256dh,auth")
        .execute()
        .data
        or []
    )
    return _broadcast(rows, payload)


def _broadcast(rows: Iterable[dict], payload: dict) -> int:
    sent = 0
    for row in rows:
        sub = {
            "endpoint": row["endpoint"],
            "keys": {"p256dh": row["p256dh"], "auth": row["auth"]},
        }
        if send_web_push(sub, payload):
            sent += 1
    return sent
