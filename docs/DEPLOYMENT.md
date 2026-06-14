# 배포 가이드 (Supabase + Render)

중1 8반 스케줄러를 처음부터 배포하는 전체 절차입니다.

---

## 1. Supabase 프로젝트 설정

### 1-1. 프로젝트 생성
1. <https://supabase.com> 에서 새 프로젝트를 만듭니다.
2. **Settings → API** 에서 다음 값을 메모합니다.
   - `Project URL` → `SUPABASE_URL`
   - `anon public` 키 → `SUPABASE_ANON_KEY` (프론트엔드용)
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (백엔드 전용, 비공개)
   - `JWT Secret` → `SUPABASE_JWT_SECRET`

### 1-2. 스키마 생성
1. **SQL Editor** 를 엽니다.
2. `supabase/schema.sql` 전체를 붙여넣고 **Run** 합니다.
   - 테이블, RLS 정책, 트리거, `attachments` Storage 버킷이 생성됩니다.

### 1-3. 인증 옵션
- **Authentication → Providers → Email** 활성화.
- 학급 내부용이라면 **Authentication → Settings → "Confirm email"** 을 끄면
  가입 즉시 로그인됩니다. (켜두면 이메일 인증 메일이 발송됩니다.)

### 1-4. 첫 관리자 지정
학생 계정으로 한 번 회원가입한 뒤, SQL Editor 에서:
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'teacher@email.com');
```

---

## 2. Web Push (VAPID) 키 생성

로컬에서 한 번 실행합니다.
```bash
pip install -r requirements.txt
python -m backend.generate_vapid_keys
```
출력된 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` 를 보관합니다.
- PUBLIC 키 → `.env` 와 `frontend/js/config.js` 양쪽에 입력
- PRIVATE 키 → `.env` (백엔드)에만 입력

---

## 3. 프론트엔드 공개 설정

`frontend/js/config.js` 를 열어 값을 채웁니다.
```js
export const CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",   // anon public
  VAPID_PUBLIC_KEY: "BPxxxx...",         // VAPID PUBLIC
  API_BASE: "",                          // 백엔드와 같은 도메인이면 빈 값
  STORAGE_BUCKET: "attachments",
  CLASS_NAME: "중학교 1학년 8반",
};
```
> ⚠️ 이 파일에는 **공개되어도 안전한 키만** 넣습니다.
> service_role 키, VAPID 개인키는 절대 넣지 마세요.

---

## 4. Render 배포

### 방법 A — Blueprint (`render.yaml`)
1. 이 저장소를 GitHub 에 푸시합니다.
2. Render → **New → Blueprint** → 저장소 선택.
3. `render.yaml` 이 자동 인식됩니다. 생성 후 **Environment** 에 아래 값을 입력:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   - (선택) `ALLOWED_ORIGINS`, `DEADLINE_REMINDER_DAYS`

### 방법 B — 수동 Web Service
- **New → Web Service** → 저장소 선택
- Build: `pip install -r requirements.txt`
- Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Health Check Path: `/api/health`
- Environment 변수는 위와 동일

배포가 끝나면 `https://<your-app>.onrender.com` 에서 앱이 열립니다.
FastAPI 가 프론트엔드(PWA)까지 함께 서빙하므로 별도 정적 호스팅이 필요 없습니다.

---

## 5. 로컬 개발

```bash
# 1) 가상환경 + 의존성
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2) 환경변수
cp .env.example .env   # 값 채우기

# 3) 실행
uvicorn backend.main:app --reload --port 8000
```
브라우저에서 <http://localhost:8000> 접속.

> 참고: Service Worker / Web Push 는 **HTTPS 또는 localhost** 에서만 동작합니다.

---

## 6. 마감 알림 동작 방식

- 기본적으로 백엔드의 `APScheduler` 가 **매일 08:00(KST)** 에
  `DEADLINE_REMINDER_DAYS`(기본 1·3·7일) 에 해당하는 수행평가를 찾아
  - 미완료 학생에게 **인앱 알림(notifications 테이블)** 생성 → 🔔 배지/실시간 표시
  - 푸시 구독자에게 **Web Push** 전송
- 관리자는 설정 메뉴 → **"마감 알림 지금 보내기"** 로 즉시 트리거할 수 있습니다.
- Render 무료 인스턴스는 유휴 시 잠들 수 있으므로, 정시 보장이 필요하면
  `render.yaml` 의 Cron 블록을 활성화하고 web 의 `ENABLE_SCHEDULER=false` 로 두세요.

---

## 7. 데이터베이스 스키마 요약

| 테이블 | 설명 | 주요 권한(RLS) |
|---|---|---|
| `profiles` | 사용자/권한(student·admin) | 본인만 수정, 전체 조회 |
| `assignments` | 학급 공통 수행평가·공지 | 전체 조회, **관리자만** 쓰기 |
| `personal_events` | 학생 개인 일정 | **본인만** CRUD |
| `completions` | 개인별 공통 일정 완료 체크 | 본인만 |
| `comments` | Q&A (공개/비밀글) | 비밀글은 작성자·관리자만 조회 |
| `notifications` | 인앱 알림 | 본인 것만 |
| `push_subscriptions` | Web Push 구독 | 본인 것만 |
| `storage: attachments` | 첨부 이미지 | 인증 사용자 업로드, 본인·관리자 삭제 |
