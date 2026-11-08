-- TradingTrainer database: run this once in the Supabase SQL editor (or with `supabase db push`).
-- Every table is private to its owner through row-level security.

-- ---------------------------------------------------------------- sessions
create table if not exists public.sessions (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at   timestamptz not null,
  updated_at   timestamptz not null default now(),
  ended        boolean not null default false,
  trade_date   date not null,
  blind        boolean not null default false,
  dataset      text not null,
  instrument   text not null check (instrument in ('MNQ', 'NQ')),
  start_et     smallint,
  trade_count  integer not null default 0,
  net          numeric(14, 2) not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists sessions_user_started_idx on public.sessions (user_id, started_at desc);

-- ------------------------------------------------------------------ trades
create table if not exists public.trades (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references public.sessions (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seq          integer not null,
  side         smallint not null check (side in (-1, 1)),
  qty          integer not null check (qty > 0),
  entry_time   timestamptz not null,
  exit_time    timestamptz not null,
  entry        numeric(14, 2) not null,
  exit         numeric(14, 2) not null,
  points       numeric(14, 2),
  gross        numeric(14, 2),
  commission   numeric(14, 2),
  net          numeric(14, 2) not null,
  r            numeric(10, 3),
  mfe          numeric(14, 2),
  mae          numeric(14, 2),
  risk_pts     numeric(14, 2),
  reason       text not null,
  notes        jsonb not null default '[]'::jsonb,
  ai_review    text,
  unique (session_id, seq)
);
create index if not exists trades_user_idx on public.trades (user_id, entry_time desc);

-- --------------------------------------------------------- lesson progress
create table if not exists public.lesson_progress (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_slug   text not null,
  score         smallint not null default 0,
  completed_at  timestamptz not null default now(),
  primary key (user_id, lesson_slug)
);

-- ------------------------------------------------- AI coach usage (limits)
create table if not exists public.coach_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists coach_requests_user_idx on public.coach_requests (user_id, created_at desc);

-- ------------------------------------------------------ row-level security
alter table public.sessions        enable row level security;
alter table public.trades          enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.coach_requests  enable row level security;

create policy "Own sessions: read"   on public.sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own sessions: insert" on public.sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own sessions: update" on public.sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own sessions: delete" on public.sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Own trades: read"   on public.trades for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own trades: insert" on public.trades for insert to authenticated
  with check ((select auth.uid()) = user_id
              and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "Own trades: update" on public.trades for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
              and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "Own trades: delete" on public.trades for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Own lessons: read"   on public.lesson_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own lessons: insert" on public.lesson_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own lessons: update" on public.lesson_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Own coach usage: read"   on public.coach_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own coach usage: insert" on public.coach_requests for insert to authenticated with check ((select auth.uid()) = user_id);
