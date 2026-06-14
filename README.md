# 📚 8반 스케줄러 (Class 8 Scheduler)

중학교 1학년 8반을 위한 **프리미엄 학급 스케줄러 & 수행평가 관리** PWA 웹 애플리케이션.
웹 브라우저 접속과 모바일 홈 화면 앱 설치(PWA)를 모두 지원합니다.

> **기술 스택** — Vanilla JS · Tailwind CSS · FastAPI(Python) · Supabase(PostgreSQL) · Render

---

## ✨ 핵심 기능

| # | 기능 | 설명 |
|---|---|---|
| 1 | **인증 & 권한** | 이메일/비밀번호 로그인, 개인정보 최소 수집(이름·학번), `admin`/`student` 권한 분리 |
| 2 | **듀얼 뷰 대시보드** | 학급 공통(수행평가)·개인 일정을 함께/분리 조회, **D-Day 자동 계산** 및 임박순 정렬, 동적 색조(🔴 D-3 / 🟡 D-7 / 🟢 그 외), 과목·유형 필터 |
| 3 | **상세 페이지** | 평가 범위·안내, **다중 이미지 슬라이드 뷰어**(Supabase Storage), 개인 완료 체크(취소선·투명도 피드백) |
| 4 | **Q&A** | 게시물 하단 댓글, **전체공개/비밀글(관리자만)** 토글 |
| 5 | **알림** | 마감 임박 **Web Push** + 인앱 종소리 🔔 배지(실시간), 관리자 수동 발송 |
| 6 | **PWA** | `manifest.json` + Service Worker, 홈 화면 설치, 오프라인 캐싱 |
| 7 | **UI/UX** | 모바일 우선 반응형, 부드러운 애니메이션, **다크/라이트 모드**(시스템 자동 감지) |

---

## 🗂️ 프로젝트 구조

```
Scheduler/
├── README.md                  # 본 문서
├── .env.example               # 백엔드 환경변수 예시
├── .gitignore
├── requirements.txt           # Python 의존성
├── render.yaml                # Render 배포 Blueprint
│
├── backend/                   # FastAPI 백엔드 (API + PWA 정적 서빙)
│   ├── __init__.py
│   ├── main.py                # 앱 진입점, 라우팅, 정적 서빙, 스케줄러
│   ├── config.py              # 환경변수 설정
│   ├── supabase_client.py     # service_role Supabase 클라이언트
│   ├── auth.py                # Supabase JWT 검증
│   ├── push.py                # Web Push 전송(pywebpush)
│   ├── reminders.py           # 마감 임박 알림 생성 로직
│   ├── generate_vapid_keys.py # VAPID 키 생성 유틸
│   └── routers/
│       ├── __init__.py
│       ├── health.py          # 헬스체크 / 공개설정
│       └── notifications.py   # 푸시 구독·해제·발송 API
│
├── frontend/                  # PWA 프론트엔드 (Vanilla JS)
│   ├── index.html             # 앱 셸 + Tailwind 설정
│   ├── manifest.json          # PWA 매니페스트
│   ├── service-worker.js      # 오프라인 캐싱 + 푸시 수신
│   ├── offline.html           # 오프라인 폴백
│   ├── css/styles.css         # 보조 스타일
│   ├── icons/                 # 앱 아이콘(192·512·maskable)
│   └── js/
│       ├── config.js          # 🔧 공개 설정(직접 입력)
│       ├── supabaseClient.js  # Supabase 브라우저 클라이언트
│       ├── auth.js            # 인증 + 로그인 화면
│       ├── store.js           # 데이터 액세스 계층
│       ├── ui.js              # DOM/토스트/모달/테마/D-Day 유틸
│       ├── dashboard.js       # 대시보드 + 추가/수정 폼
│       ├── detail.js          # 상세 + 이미지 슬라이더 + Q&A
│       ├── notifications.js   # 인앱 알림 + Web Push 구독
│       ├── pwa.js             # SW 등록 + 설치 프롬프트
│       └── app.js             # 부트스트랩 + 헤더 + 라우터
│
├── supabase/
│   └── schema.sql             # 테이블 · RLS · Storage 스키마
└── docs/
    └── DEPLOYMENT.md          # 상세 배포 가이드
```

---

## 🚀 빠른 시작

```bash
# 1) 의존성 설치
pip install -r requirements.txt

# 2) VAPID 키 생성 (푸시 알림용)
python -m backend.generate_vapid_keys

# 3) 환경변수 설정
cp .env.example .env            # Supabase / VAPID 값 입력

# 4) 프론트 공개설정 입력
#    frontend/js/config.js 의 SUPABASE_URL / ANON_KEY / VAPID_PUBLIC_KEY

# 5) Supabase SQL Editor 에 supabase/schema.sql 실행

# 6) 로컬 실행
uvicorn backend.main:app --reload --port 8000
# → http://localhost:8000
```

전체 배포(Supabase + Render) 절차는 **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** 를 참고하세요.

---

## 🔐 보안 설계

- 모든 테이블에 **Row Level Security(RLS)** 적용 — 권한은 DB 가 최종 강제합니다.
- 학급 공통 수행평가/공지는 **관리자만** 작성·수정·삭제 가능.
- 비밀 댓글은 **작성자와 관리자에게만** 노출(RLS `select` 정책).
- 브라우저에는 `anon` 공개키만 노출, `service_role`·VAPID 개인키는 서버 전용.
- 사용자 입력은 출력 시 HTML 이스케이프 처리(XSS 방지).

---

## 🛠️ 첫 관리자 지정

회원가입 후 Supabase SQL Editor 에서:
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'teacher@email.com');
```
