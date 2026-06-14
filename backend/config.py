"""환경 변수 기반 애플리케이션 설정."""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """`.env` 또는 OS 환경 변수에서 로드되는 설정값."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # Web Push (VAPID)
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    # 앱
    allowed_origins: str = ""
    deadline_reminder_days: str = "1,3,7"
    enable_scheduler: bool = True
    port: int = 8000

    # NEIS 오픈 API (급식 · 시간표 위젯)
    neis_api_key: str = ""               # https://open.neis.go.kr 인증키 (없어도 일부 동작)
    neis_school_name: str = "용인신촌중학교"
    neis_office_code: str = ""           # 시도교육청코드(예: 경기 J10). 비우면 학교명으로 자동 탐색
    neis_school_code: str = ""           # 표준학교코드. 비우면 학교명으로 자동 탐색
    neis_grade: int = 1
    neis_class: str = "8"

    @property
    def origins_list(self) -> List[str]:
        """CORS 허용 오리진 목록. 비어있으면 전체 허용('*')."""
        raw = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        return raw or ["*"]

    @property
    def reminder_days(self) -> List[int]:
        """마감 임박 알림 기준 일수 목록."""
        days: List[int] = []
        for part in self.deadline_reminder_days.split(","):
            part = part.strip()
            if part.isdigit():
                days.append(int(part))
        return days or [1, 3, 7]


@lru_cache
def get_settings() -> Settings:
    """설정 싱글턴."""
    return Settings()
