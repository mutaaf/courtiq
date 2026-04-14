-- Private Coach Notes
-- Coaches jot confidential notes about players (never shown to parents)

create table player_notes (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  team_id     uuid not null references teams(id) on delete cascade,
  coach_id    uuid references coaches(id) on delete set null,
  content     text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index player_notes_player_idx on player_notes(player_id);
create index player_notes_team_idx   on player_notes(team_id);
create index player_notes_pinned_idx on player_notes(player_id, pinned);
