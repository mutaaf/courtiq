-- ═══════════════════════════════════════════════════════
-- Migration 015 — Recurring Sessions
-- Coaches can define a weekly recurring session template
-- (e.g. every Tuesday 4-5pm) and generate individual
-- sessions for the whole season in one click.
-- ═══════════════════════════════════════════════════════

create table if not exists recurring_sessions (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id) on delete cascade,
  coach_id     uuid not null references coaches(id) on delete cascade,
  type         text not null default 'practice'
                 check (type in ('practice', 'game', 'scrimmage', 'tournament', 'training')),
  -- 0=Sunday … 6=Saturday (matches JS Date.getDay())
  day_of_week  smallint not null check (day_of_week between 0 and 6),
  start_time   time,
  end_time     time,
  location     text,
  start_date   date not null,
  end_date     date not null,
  created_at   timestamptz default now(),
  constraint end_after_start check (end_date >= start_date)
);

-- RLS: coaches may only see / touch their own team's schedules
alter table recurring_sessions enable row level security;

create policy "recurring_sessions_coach_access" on recurring_sessions
  using (
    coach_id = auth.uid()
    or team_id in (
      select team_id from team_coaches where coach_id = auth.uid()
    )
  );
