"""마감 임박 수행평가에 대한 인앱 알림 + Web Push 생성."""
from __future__ import annotations

import logging
from datetime import date, timedelta

from .config import get_settings
from .push import push_to_user
from .supabase_client import get_supabase

logger = logging.getLogger("reminders")


def run_deadline_reminders() -> dict:
    """오늘 기준 D-N 인 수행평가를 찾아 미완료 학생에게 알림 생성.

    중복 방지를 위해 같은 (user, assignment, link) 의 미읽음 알림이
    이미 있으면 건너뛴다.
    """
    sb = get_supabase()
    if sb is None:
        logger.warning("Supabase 미구성 — 알림 작업을 건너뜁니다.")
        return {"created": 0, "pushed": 0}

    settings = get_settings()
    today = date.today()
    target_dates = {
        (today + timedelta(days=d)).isoformat(): d for d in settings.reminder_days
    }

    # 대상 수행평가 조회
    assignments = (
        sb.table("assignments")
        .select("id,title,subject,due_date,type")
        .eq("type", "exam")
        .in_("due_date", list(target_dates.keys()))
        .execute()
        .data
        or []
    )
    if not assignments:
        return {"created": 0, "pushed": 0}

    # 전체 학생
    students = sb.table("profiles").select("id").execute().data or []
    created = 0
    pushed = 0

    for a in assignments:
        d_day = target_dates.get(a["due_date"])
        link = f"#/detail/{a['id']}"
        title = f"D-{d_day} 마감 임박"
        body = f"[{a.get('subject') or '수행평가'}] {a['title']}"

        # 이 수행평가를 완료한 학생 집합
        done_rows = (
            sb.table("completions")
            .select("user_id")
            .eq("assignment_id", a["id"])
            .eq("completed", True)
            .execute()
            .data
            or []
        )
        done = {r["user_id"] for r in done_rows}

        for s in students:
            uid = s["id"]
            if uid in done:
                continue

            # 중복 알림 방지
            existing = (
                sb.table("notifications")
                .select("id")
                .eq("user_id", uid)
                .eq("link", link)
                .eq("title", title)
                .limit(1)
                .execute()
                .data
            )
            if existing:
                continue

            sb.table("notifications").insert(
                {
                    "user_id": uid,
                    "title": title,
                    "body": body,
                    "link": link,
                }
            ).execute()
            created += 1
            pushed += push_to_user(
                uid,
                {"title": title, "body": body, "url": link},
            )

    logger.info("마감 알림 생성: %d, 푸시: %d", created, pushed)
    return {"created": created, "pushed": pushed}
