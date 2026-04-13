-- Player Achievement Badges
-- Stores badges earned/awarded per player per team

create table player_achievements (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  badge_type   text not null,
  earned_at    timestamptz not null default now(),
  awarded_by   uuid references coaches(id) on delete set null,
  note         text,           -- optional coach note for manual badges
  created_at   timestamptz not null default now()
);

-- one badge per type per player (prevent duplicates)
create unique index player_achievements_player_badge_uniq
  on player_achievements(player_id, badge_type);

create index player_achievements_player_idx on player_achievements(player_id);
create index player_achievements_team_idx   on player_achievements(team_id);
