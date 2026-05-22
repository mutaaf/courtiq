-- Link session-specific plans (game_recap, player_messages, huddle_script, etc.)
-- to their source session so the session detail page can auto-load them on return visits.
alter table plans add column if not exists session_id uuid references sessions(id) on delete cascade;
create index if not exists idx_plans_session_id on plans(session_id);
