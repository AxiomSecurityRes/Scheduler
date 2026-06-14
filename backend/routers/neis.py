"""NEIS 오픈 API 프록시 — 오늘의 급식 + 우리 반 시간표.

프론트엔드의 CORS 제약과 API 키 노출을 피하기 위해 백엔드가 중계한다.
학교 코드가 설정되지 않은 경우 학교명으로 자동 탐색한다.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Optional

import httpx
from fastapi import APIRouter, Query

from ..config import get_settings

logger = logging.getLogger("neis")
router = APIRouter(prefix="/api/neis", tags=["neis"])

NEIS_BASE = "https://open.neis.go.kr/hub"


def _params(extra: dict) -> dict:
    s = get_settings()
    p = {"Type": "json", "pIndex": 1, "pSize": 100}
    if s.neis_api_key:
        p["KEY"] = s.neis_api_key
    p.update(extra)
    return p


async def _get(client: httpx.AsyncClient, endpoint: str, extra: dict) -> list[dict]:
    """NEIS 엔드포인트 호출 후 row 리스트 반환 (없으면 빈 리스트)."""
    try:
        r = await client.get(f"{NEIS_BASE}/{endpoint}", params=_params(extra), timeout=8)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:  # pragma: no cover - 외부 의존
        logger.warning("NEIS %s 호출 실패: %s", endpoint, exc)
        return []
    block = data.get(endpoint)
    if not block or len(block) < 2:
        return []
    return block[1].get("row", []) or []


@lru_cache
def _cache_holder() -> dict:
    return {}


async def _resolve_school(client: httpx.AsyncClient) -> Optional[tuple[str, str]]:
    """(office_code, school_code) 반환. 설정값 우선, 없으면 학교명으로 탐색(캐시)."""
    s = get_settings()
    if s.neis_office_code and s.neis_school_code:
        return s.neis_office_code, s.neis_school_code

    cache = _cache_holder()
    if "school" in cache:
        return cache["school"]

    rows = await _get(client, "schoolInfo", {"SCHUL_NM": s.neis_school_name})
    if not rows:
        return None
    row = rows[0]
    result = (row.get("ATPT_OFCDC_SC_CODE"), row.get("SD_SCHUL_CODE"))
    if all(result):
        cache["school"] = result
        return result
    return None


@router.get("/meal")
async def meal(d: Optional[str] = Query(default=None, description="YYYYMMDD")):
    """지정일(기본 오늘)의 급식 정보."""
    target = (d or date.today().strftime("%Y%m%d")).replace("-", "")
    async with httpx.AsyncClient() as client:
        school = await _resolve_school(client)
        if not school:
            return {"date": target, "meals": [], "error": "학교 정보를 찾을 수 없습니다."}
        office, code = school
        rows = await _get(client, "mealServiceDietInfo",
                          {"ATPT_OFCDC_SC_CODE": office, "SD_SCHUL_CODE": code, "MLSV_YMD": target})
    meals = []
    for r in rows:
        dishes = [
            line.split("(")[0].strip()
            for line in (r.get("DDISH_NM", "") or "").replace("<br/>", "\n").split("\n")
            if line.strip()
        ]
        meals.append({
            "type": r.get("MMEAL_SC_NM", "급식"),      # 조식/중식/석식
            "dishes": dishes,
            "calorie": (r.get("CAL_INFO") or "").strip(),
        })
    return {"date": target, "meals": meals}


@router.get("/timetable")
async def timetable(d: Optional[str] = Query(default=None, description="YYYYMMDD")):
    """지정일(기본 오늘, 주말이면 다음 평일)의 우리 반 시간표."""
    s = get_settings()
    if d:
        target_dt = datetime.strptime(d.replace("-", ""), "%Y%m%d")
    else:
        target_dt = datetime.now()
        # 주말이면 다음 월요일로
        while target_dt.weekday() >= 5:
            target_dt += timedelta(days=1)
    target = target_dt.strftime("%Y%m%d")
    # 학년도/학기 추정
    year = target_dt.year
    ay = str(year if target_dt.month >= 3 else year - 1)
    sem = "1" if 3 <= target_dt.month <= 7 else "2"

    async with httpx.AsyncClient() as client:
        school = await _resolve_school(client)
        if not school:
            return {"date": target, "periods": [], "error": "학교 정보를 찾을 수 없습니다."}
        office, code = school
        rows = await _get(client, "misTimetable", {
            "ATPT_OFCDC_SC_CODE": office, "SD_SCHUL_CODE": code,
            "AY": ay, "SEM": sem, "ALL_TI_YMD": target,
            "GRADE": str(s.neis_grade), "CLASS_NM": str(s.neis_class),
        })
    periods = []
    for r in rows:
        periods.append({
            "period": r.get("PERIO", ""),
            "subject": (r.get("ITRT_CNTNT") or "").strip(),
        })
    periods.sort(key=lambda x: int(x["period"]) if str(x["period"]).isdigit() else 99)
    return {"date": target, "grade": s.neis_grade, "class": s.neis_class, "periods": periods}
