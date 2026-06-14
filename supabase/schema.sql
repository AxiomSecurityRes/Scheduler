-- ============================================================================
--  중1 8반 스케줄러 — Supabase / PostgreSQL 스키마
--  Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.
--  (보안 최우선: 모든 테이블에 Row Level Security(RLS) 적용)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 확장 기능
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. profiles : auth.users 와 1:1 로 매핑되는 사용자 프로필
--    role: 'student'(일반 학생) | 'admin'(선생님/학급 임원)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    name        text not null,
    student_no  text,                                   -- 학번 (개인정보 최소화)
    role        text not null default 'student'
                check (role in ('student', 'admin')),
    created_at  timestamptz not null default now()
);

comment on table public.profiles is '사용자 프로필 및 권한';

-- 권한 확인 헬퍼 함수 (RLS 정책에서 재사용)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin'
    );
$$;

-- 회원가입 시 auth.users 트리거로 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, name, student_no, role)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'name', '학생'),
        new.raw_user_meta_data ->> 'student_no',
        coalesce(new.raw_user_meta_data ->> 'role', 'student')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. assignments : 학급 공통 일정(수행평가) + 공지
--    type: 'exam'(수행평가) | 'notice'(공지)
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
    id           uuid primary key default gen_random_uuid(),
    type         text not null default 'exam'
                 check (type in ('exam', 'notice')),
    subject      text,                          -- 과목 (예: 국어, 수학, 영어 ...)
    title        text not null,
    description  text,                           -- 평가 범위 / 상세 안내
    due_date     date,                           -- 마감일 (D-Day 계산 기준)
    images       jsonb not null default '[]'::jsonb,  -- 첨부 이미지 URL 배열
    created_by   uuid references public.profiles (id) on delete set null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.assignments is '학급 공통 수행평가 / 공지사항';

-- ---------------------------------------------------------------------------
-- 3. personal_events : 학생 개인 일정 (학원, 개인 공부 등)
-- ---------------------------------------------------------------------------
create table if not exists public.personal_events (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    subject     text,
    title       text not null,
    description text,
    due_date    date,
    completed   boolean not null default false,    -- 개인 일정 완료 체크
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table public.personal_events is '학생 개인 일정';

-- ---------------------------------------------------------------------------
-- 4. completions : 학생별 수행평가/일정 완료 체크
-- ---------------------------------------------------------------------------
create table if not exists public.completions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles (id) on delete cascade,
    assignment_id uuid references public.assignments (id) on delete cascade,
    completed     boolean not null default true,
    updated_at    timestamptz not null default now(),
    unique (user_id, assignment_id)
);

comment on table public.completions is '학생 개인별 공통 일정 완료 체크';

-- ---------------------------------------------------------------------------
-- 5. comments : 수행평가 하단 Q&A (공개/비밀글 토글)
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
    id            uuid primary key default gen_random_uuid(),
    assignment_id uuid not null references public.assignments (id) on delete cascade,
    user_id       uuid not null references public.profiles (id) on delete cascade,
    body          text not null,
    is_private    boolean not null default false,   -- true = 관리자에게만 보이기(비밀글)
    created_at    timestamptz not null default now()
);

comment on table public.comments is '수행평가 Q&A 댓글';

-- ---------------------------------------------------------------------------
-- 6. notifications : 인앱 알림 (종소리 배지)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles (id) on delete cascade,
    title         text not null,
    body          text,
    link          text,                          -- 클릭 시 이동할 경로 (예: #/detail/<id>)
    is_read       boolean not null default false,
    created_at    timestamptz not null default now()
);

comment on table public.notifications is '인앱 알림';

-- ---------------------------------------------------------------------------
-- 7. push_subscriptions : Web Push 구독 정보
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    endpoint    text not null unique,
    p256dh      text not null,
    auth        text not null,
    created_at  timestamptz not null default now()
);

comment on table public.push_subscriptions is 'Web Push 구독';

-- ---------------------------------------------------------------------------
-- 8. 인덱스
-- ---------------------------------------------------------------------------
create index if not exists idx_assignments_due       on public.assignments (due_date);
create index if not exists idx_personal_user          on public.personal_events (user_id);
create index if not exists idx_completions_user       on public.completions (user_id);
create index if not exists idx_comments_assignment    on public.comments (assignment_id);
create index if not exists idx_notifications_user     on public.notifications (user_id, is_read);
create index if not exists idx_push_user              on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- 9. updated_at 자동 갱신 트리거
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_assignments_touch on public.assignments;
create trigger trg_assignments_touch before update on public.assignments
    for each row execute function public.touch_updated_at();

drop trigger if exists trg_personal_touch on public.personal_events;
create trigger trg_personal_touch before update on public.personal_events
    for each row execute function public.touch_updated_at();

-- ============================================================================
--  Row Level Security (RLS) 정책
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.assignments        enable row level security;
alter table public.personal_events    enable row level security;
alter table public.completions        enable row level security;
alter table public.comments           enable row level security;
alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;

-- ---- profiles ----
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
    for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
    for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- assignments : 모두 읽기, 관리자만 쓰기 ----
drop policy if exists "assignments_select_all" on public.assignments;
create policy "assignments_select_all" on public.assignments
    for select using (auth.role() = 'authenticated');

drop policy if exists "assignments_admin_insert" on public.assignments;
create policy "assignments_admin_insert" on public.assignments
    for insert with check (public.is_admin());

drop policy if exists "assignments_admin_update" on public.assignments;
create policy "assignments_admin_update" on public.assignments
    for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "assignments_admin_delete" on public.assignments;
create policy "assignments_admin_delete" on public.assignments
    for delete using (public.is_admin());

-- ---- personal_events : 본인만 CRUD ----
drop policy if exists "personal_own_all" on public.personal_events;
create policy "personal_own_all" on public.personal_events
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- completions : 본인만 ----
drop policy if exists "completions_own_all" on public.completions;
create policy "completions_own_all" on public.completions
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- comments ----
--  읽기: 공개글은 모두 / 비밀글은 작성자 또는 관리자만
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
    for select using (
        not is_private
        or user_id = auth.uid()
        or public.is_admin()
    );

drop policy if exists "comments_insert_self" on public.comments;
create policy "comments_insert_self" on public.comments
    for insert with check (user_id = auth.uid());

--  수정/삭제: 작성자 또는 관리자
drop policy if exists "comments_update" on public.comments;
create policy "comments_update" on public.comments
    for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments
    for delete using (user_id = auth.uid() or public.is_admin());

-- ---- notifications : 본인 것만 ----
drop policy if exists "notifications_own_select" on public.notifications;
create policy "notifications_own_select" on public.notifications
    for select using (user_id = auth.uid());

drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- push_subscriptions : 본인 것만 ----
drop policy if exists "push_own_all" on public.push_subscriptions;
create policy "push_own_all" on public.push_subscriptions
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
--  Storage : 이미지 첨부 버킷
--  대시보드 > Storage 에서 'attachments' 버킷을 Public 으로 생성하거나
--  아래 SQL 로 생성하세요.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

-- 업로드: 인증된 사용자 / 삭제·수정: 업로더 본인 또는 관리자
drop policy if exists "attach_read" on storage.objects;
create policy "attach_read" on storage.objects
    for select using (bucket_id = 'attachments');

drop policy if exists "attach_insert" on storage.objects;
create policy "attach_insert" on storage.objects
    for insert with check (
        bucket_id = 'attachments' and auth.role() = 'authenticated'
    );

drop policy if exists "attach_delete" on storage.objects;
create policy "attach_delete" on storage.objects
    for delete using (
        bucket_id = 'attachments'
        and (owner = auth.uid() or public.is_admin())
    );

-- ============================================================================
--  완료. 첫 관리자 지정은 회원가입 후 아래 쿼리로 수동 승격하세요:
--    update public.profiles set role = 'admin' where id = '<user-uuid>';
-- ============================================================================
