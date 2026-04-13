-- Error tracking events table.
-- Written by the /api/errors endpoint (service role) and read only by admins.
-- No RLS required — all writes go through the service-role API route.

create table if not exists error_events (
  id          uuid        primary key default gen_random_uuid(),
  session_id  text        not null,
  level       text        not null default 'error'
                          check (level in ('fatal', 'error', 'warning', 'info')),
  message     text        not null,
  stack       text,
  name        text,
  context     jsonb,
  url         text,
  ip          text,
  created_at  timestamptz not null default now()
);

-- Query patterns: by session (grouping related errors) and by time (recent errors)
create index if not exists idx_error_events_session    on error_events (session_id);
create index if not exists idx_error_events_created   on error_events (created_at desc);
create index if not exists idx_error_events_level     on error_events (level, created_at desc);
