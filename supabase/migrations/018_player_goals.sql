-- Player Development Goals
-- Coaches set specific, trackable goals for each player

create table player_goals (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  team_id       uuid not null references teams(id) on delete cascade,
  coach_id      uuid references coaches(id) on delete set null,
  skill         text not null,           -- skill/category name this goal targets
  goal_text     text not null,           -- what the coach wants to achieve
  target_level  text,                    -- exploring | practicing | got_it | game_ready
  target_date   date,                    -- optional deadline
  status        text not null default 'active',  -- active | achieved | stalled | archived
  notes         text,                    -- coach progress notes
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index player_goals_player_idx on player_goals(player_id);
create index player_goals_team_idx   on player_goals(team_id);
create index player_goals_status_idx on player_goals(status);
