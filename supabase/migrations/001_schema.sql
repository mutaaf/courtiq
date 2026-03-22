-- ═══════════════════════════════════════════════════════
-- CourtIQ Unified Schema — Migration 001
-- ═══════════════════════════════════════════════════════

-- ORGANIZATION & AUTH
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  sport_config jsonb default '{}',
  settings jsonb default '{}',
  tier text default 'free' check (tier in ('free', 'coach', 'pro_coach', 'program', 'organization')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table coaches (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  role text not null default 'coach'
    check (role in ('coach', 'head_coach', 'admin', 'assistant', 'coordinator')),
  preferences jsonb default '{}',
  onboarding_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- SPORT CONFIGURATION
create table sports (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  icon text,
  default_positions text[] not null,
  default_categories text[] not null,
  default_age_groups text[] not null,
  plan_templates jsonb default '{}',
  drill_categories text[] not null,
  stat_fields jsonb default '[]',
  curriculum_enabled boolean default false,
  default_curriculum_config jsonb default '{}',
  terminology jsonb default '{}',
  created_at timestamptz default now()
);

-- CURRICULUM ENGINE
create table curricula (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid references sports(id),
  org_id uuid references organizations(id),
  name text not null,
  description text,
  is_default boolean default false,
  config jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table curriculum_skills (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid references curricula(id) on delete cascade,
  skill_id text not null,
  name text not null,
  category text not null,
  age_groups text[] not null,
  intro_week int,
  teaching_script text,
  demo_video_url text,
  progression_levels jsonb not null,
  cv_evaluation_config jsonb,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- TEAMS & PLAYERS
create table teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  sport_id uuid references sports(id),
  curriculum_id uuid references curricula(id),
  name text not null,
  age_group text not null,
  season text,
  season_weeks int,
  current_week int default 1,
  is_active boolean default true,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table team_coaches (
  team_id uuid references teams(id) on delete cascade,
  coach_id uuid references coaches(id) on delete cascade,
  role text default 'coach' check (role in ('head_coach', 'coach', 'assistant')),
  primary key (team_id, coach_id)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  nickname text,
  name_variants text[],
  age_group text not null,
  date_of_birth date,
  position text default 'Flex',
  jersey_number int,
  photo_url text,
  parent_name text,
  parent_email text,
  parent_phone text,
  medical_notes text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PLAYER IDENTITY GRAPH (Phase 2)
create table player_identity_graph (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  appearance_embeddings jsonb,
  jersey_map jsonb,
  voice_enrollment bytea,
  session_appearances jsonb,
  updated_at timestamptz default now()
);

-- SESSIONS
create table sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  coach_id uuid references coaches(id),
  type text not null check (type in ('practice', 'game', 'scrimmage', 'tournament', 'training')),
  date date not null,
  start_time time,
  end_time time,
  location text,
  opponent text,
  result text,
  notes text,
  planned_drills jsonb,
  actual_drills jsonb,
  curriculum_week int,
  cv_processing_status text default 'none'
    check (cv_processing_status in ('none', 'pending', 'processing', 'complete', 'failed')),
  cv_source_files jsonb,
  coach_debrief_text text,
  coach_debrief_extracts jsonb,
  created_at timestamptz default now()
);

-- AI INTERACTION LOG
create table ai_interactions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches(id),
  team_id uuid references teams(id),
  interaction_type text not null check (interaction_type in (
    'segment_transcript', 'parse_observation',
    'generate_practice_plan', 'generate_gameday_sheet',
    'generate_weekly_plan', 'generate_development_card',
    'generate_parent_report', 'generate_report_card',
    'analyze_photo', 'analyze_video', 'roster_import',
    'cv_coaching_event_extraction', 'cv_identity_resolution', 'custom'
  )),
  model text not null,
  system_prompt text not null,
  user_prompt text not null,
  prompt_context jsonb,
  response_text text,
  response_parsed jsonb,
  response_tokens_in int,
  response_tokens_out int,
  response_latency_ms int,
  coach_accepted boolean,
  coach_edited boolean,
  coach_rating int check (coach_rating between 1 and 5),
  coach_feedback text,
  status text default 'success'
    check (status in ('success', 'error', 'timeout', 'rate_limited')),
  error_message text,
  created_at timestamptz default now()
);

-- RECORDINGS
create table recordings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  coach_id uuid references coaches(id),
  session_id uuid references sessions(id),
  storage_path text,
  local_path text,
  file_size_bytes bigint,
  mime_type text default 'audio/webm',
  raw_transcript text,
  transcript_provider text,
  transcript_confidence float,
  status text default 'recorded'
    check (status in ('recorded', 'uploading', 'uploaded', 'transcribing',
                       'transcribed', 'parsing', 'parsed', 'reviewed', 'failed')),
  retry_count int default 0,
  last_error text,
  duration_seconds int,
  created_at timestamptz default now()
);

-- OBSERVATIONS
create table observations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  coach_id uuid references coaches(id),
  session_id uuid references sessions(id),
  recording_id uuid references recordings(id),
  media_id uuid,
  category text not null,
  sentiment text default 'neutral'
    check (sentiment in ('positive', 'needs-work', 'neutral')),
  text text not null,
  raw_text text,
  source text default 'typed'
    check (source in ('voice', 'typed', 'photo', 'video', 'cv', 'import', 'debrief')),
  ai_parsed boolean default false,
  coach_edited boolean default false,
  ai_interaction_id uuid references ai_interactions(id),
  skill_id text,
  drill_id text,
  event_type text,
  result text,
  cv_metrics jsonb,
  cv_failure_tags text[],
  cv_identity_confidence float,
  video_clip_ref jsonb,
  audio_annotation jsonb,
  source_modalities text[],
  local_id text,
  synced_at timestamptz,
  is_synced boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- MEDIA
create table media (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  coach_id uuid references coaches(id),
  player_id uuid references players(id),
  session_id uuid references sessions(id),
  type text not null check (type in ('photo', 'screenshot', 'video', 'game_film', 'document')),
  storage_path text,
  local_path text,
  thumbnail_path text,
  file_size_bytes bigint,
  mime_type text,
  ai_analysis text,
  ai_interaction_id uuid references ai_interactions(id),
  caption text,
  tags text[],
  cv_processing_status text default 'none',
  cv_processing_job_id text,
  is_synced boolean default true,
  synced_at timestamptz,
  created_at timestamptz default now()
);

-- add FK for observations.media_id
alter table observations add constraint observations_media_id_fkey
  foreign key (media_id) references media(id);

-- AI-GENERATED PLANS
create table plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  coach_id uuid references coaches(id),
  player_id uuid references players(id),
  ai_interaction_id uuid references ai_interactions(id),
  type text not null check (type in (
    'practice', 'gameday', 'weekly', 'development_card',
    'parent_report', 'report_card', 'custom'
  )),
  title text,
  content text not null,
  content_structured jsonb,
  curriculum_week int,
  skills_targeted text[],
  is_shared boolean default false,
  share_token text unique,
  share_expires_at timestamptz,
  created_at timestamptz default now()
);

-- DRILL LIBRARY
create table drills (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid references sports(id),
  org_id uuid references organizations(id),
  coach_id uuid references coaches(id),
  curriculum_skill_id uuid references curriculum_skills(id),
  name text not null,
  description text not null,
  category text not null,
  age_groups text[] not null,
  duration_minutes int,
  player_count_min int default 1,
  player_count_max int,
  equipment text[],
  video_url text,
  diagram_url text,
  cv_eval_config jsonb,
  setup_instructions text,
  teaching_cues text[],
  source text default 'seeded'
    check (source in ('seeded', 'coach', 'ai', 'community', 'curriculum')),
  created_at timestamptz default now()
);

-- PLAYER SKILL PROFICIENCY
create table player_skill_proficiency (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  skill_id text not null,
  session_type text,
  proficiency_level text not null
    check (proficiency_level in ('insufficient_data', 'exploring', 'practicing', 'got_it', 'game_ready')),
  success_rate float,
  reps_evaluated int,
  trend text check (trend in ('improving', 'plateau', 'regressing', 'new')),
  practice_success_rate float,
  game_success_rate float,
  transfer_score float,
  last_observation_at timestamptz,
  computed_at timestamptz default now(),
  unique (player_id, skill_id, session_type)
);

-- PARENT SHARE PORTAL
create table parent_shares (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  team_id uuid references teams(id),
  coach_id uuid references coaches(id),
  share_token text unique not null,
  pin text,
  include_observations boolean default false,
  include_development_card boolean default true,
  include_report_card boolean default true,
  include_highlights boolean default true,
  include_goals boolean default true,
  include_drills boolean default true,
  include_coach_note boolean default true,
  include_skill_challenges boolean default true,
  custom_message text,
  view_count int default 0,
  last_viewed_at timestamptz,
  is_active boolean default true,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- CV PROCESSING JOBS (Phase 2)
create table cv_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  team_id uuid references teams(id),
  media_id uuid references media(id),
  status text default 'queued'
    check (status in ('queued', 'processing', 'complete', 'failed', 'cancelled')),
  priority text default 'medium'
    check (priority in ('high', 'medium', 'low', 'batch')),
  stage text default 'court_registration'
    check (stage in ('court_registration', 'detection', 'tracking', 'pose',
                      'ball_tracking', 'identity_fusion', 'event_detection', 'output', 'complete')),
  progress_pct int default 0,
  player_tracks jsonb,
  event_log jsonb,
  identity_resolution jsonb,
  unresolved_tracks jsonb,
  processing_time_seconds int,
  frames_processed int,
  observations_generated int,
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- SYNC QUEUE
create table sync_log (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches(id),
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('create', 'update', 'delete')),
  payload jsonb,
  status text default 'pending'
    check (status in ('pending', 'syncing', 'synced', 'failed', 'conflict')),
  retry_count int default 0,
  error_message text,
  created_at timestamptz default now(),
  synced_at timestamptz
);

-- CONFIG OVERRIDES
create table config_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  scope text not null check (scope in ('org', 'team')),
  domain text not null,
  key text not null,
  value jsonb not null,
  changed_by uuid references coaches(id),
  change_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, team_id, domain, key)
);

alter table config_overrides add constraint config_scope_check
  check (
    (scope = 'org' and org_id is not null and team_id is null) or
    (scope = 'team' and team_id is not null)
  );

-- CONFIG CHANGE AUDIT LOG
create table config_audit_log (
  id uuid primary key default gen_random_uuid(),
  config_override_id uuid references config_overrides(id) on delete set null,
  org_id uuid references organizations(id),
  team_id uuid references teams(id),
  domain text not null,
  key text not null,
  action text not null check (action in ('create', 'update', 'delete', 'reset')),
  previous_value jsonb,
  new_value jsonb,
  changed_by uuid references coaches(id),
  change_reason text,
  created_at timestamptz default now()
);

-- FEATURE FLAGS
create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text unique not null,
  name text not null,
  description text,
  default_enabled boolean default false,
  enabled_tiers text[] default '{}',
  created_at timestamptz default now()
);

create table org_feature_flags (
  org_id uuid references organizations(id) on delete cascade,
  flag_key text references feature_flags(flag_key) on delete cascade,
  enabled boolean not null,
  enabled_by uuid references coaches(id),
  enabled_at timestamptz default now(),
  primary key (org_id, flag_key)
);

-- ORG BRANDING
create table org_branding (
  org_id uuid primary key references organizations(id) on delete cascade,
  logo_light_url text,
  logo_dark_url text,
  favicon_url text,
  primary_color text default '#F97316',
  secondary_color text default '#3B82F6',
  accent_color text,
  font_family text,
  custom_css text,
  parent_portal_header_text text,
  parent_portal_footer_text text,
  email_sender_name text,
  email_footer_html text,
  custom_domain text,
  updated_at timestamptz default now()
);

-- CUSTOM ROLES
create table org_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  role_key text not null,
  name text not null,
  description text,
  permissions jsonb not null,
  is_system boolean default false,
  sort_order int default 0,
  created_at timestamptz default now(),
  unique (org_id, role_key)
);

-- NOTIFICATION PREFERENCES
create table notification_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  coach_id uuid references coaches(id) on delete cascade,
  notify_parent_on_report boolean default true,
  notify_coach_on_parent_view boolean default true,
  notify_coach_on_processing_complete boolean default true,
  weekly_digest_coach boolean default true,
  weekly_digest_parent boolean default false,
  channels text[] default '{push,email}',
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PROFICIENCY RECOMPUTE QUEUE
create table proficiency_recompute_queue (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  skill_id text not null,
  triggered_by text,
  status text default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
  created_at timestamptz default now(),
  processed_at timestamptz
);

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════

create index idx_observations_player on observations(player_id);
create index idx_observations_team on observations(team_id);
create index idx_observations_session on observations(session_id);
create index idx_observations_skill on observations(skill_id);
create index idx_observations_source on observations(source);
create index idx_observations_created on observations(created_at desc);
create index idx_observations_local_id on observations(local_id);
create index idx_obs_player_skill_created on observations(player_id, skill_id, created_at desc) where skill_id is not null;
create index idx_obs_player_source on observations(player_id, source, created_at desc);
create index idx_players_team on players(team_id);
create index idx_sessions_team on sessions(team_id);
create index idx_sessions_date on sessions(date desc);
create index idx_plans_team on plans(team_id);
create index idx_plans_share_token on plans(share_token);
create index idx_recordings_team on recordings(team_id);
create index idx_recordings_status on recordings(status);
create index idx_media_team on media(team_id);
create index idx_media_player on media(player_id);
create index idx_ai_interactions_coach on ai_interactions(coach_id);
create index idx_ai_interactions_type on ai_interactions(interaction_type);
create index idx_ai_interactions_created on ai_interactions(created_at desc);
create index idx_parent_shares_token on parent_shares(share_token);
create index idx_team_coaches_coach on team_coaches(coach_id);
create index idx_sync_log_status on sync_log(status);
create index idx_curriculum_skills_curriculum on curriculum_skills(curriculum_id);
create index idx_player_skill_proficiency_player on player_skill_proficiency(player_id);
create index idx_prof_player_skill on player_skill_proficiency(player_id, skill_id);
create index idx_cv_processing_jobs_session on cv_processing_jobs(session_id);
create index idx_cv_processing_jobs_status on cv_processing_jobs(status);
create index idx_config_overrides_org on config_overrides(org_id);
create index idx_config_overrides_team on config_overrides(team_id);
create index idx_config_overrides_domain on config_overrides(domain, key);
create index idx_config_org_lookup on config_overrides(org_id, domain, key) where team_id is null;
create index idx_config_team_lookup on config_overrides(team_id, domain, key) where team_id is not null;
create index idx_config_audit_org on config_audit_log(org_id);
create index idx_config_audit_created on config_audit_log(created_at desc);
create index idx_org_feature_flags_org on org_feature_flags(org_id);
create index idx_proficiency_queue_status on proficiency_recompute_queue(status);

-- ═══════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════

create or replace function notify_proficiency_recompute()
returns trigger as $$
begin
  if NEW.skill_id is not null and NEW.player_id is not null then
    insert into proficiency_recompute_queue (player_id, skill_id, triggered_by)
    values (NEW.player_id, NEW.skill_id, 'observation_insert');
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_observation_proficiency
after insert on observations
for each row execute function notify_proficiency_recompute();

create or replace function update_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger trg_organizations_updated_at before update on organizations for each row execute function update_updated_at();
create trigger trg_coaches_updated_at before update on coaches for each row execute function update_updated_at();
create trigger trg_teams_updated_at before update on teams for each row execute function update_updated_at();
create trigger trg_players_updated_at before update on players for each row execute function update_updated_at();
create trigger trg_observations_updated_at before update on observations for each row execute function update_updated_at();
create trigger trg_config_overrides_updated_at before update on config_overrides for each row execute function update_updated_at();
create trigger trg_notification_settings_updated_at before update on notification_settings for each row execute function update_updated_at();
