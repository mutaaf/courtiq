// SportsIQ Database Types — Generated from schema

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CoachRole = 'coach' | 'head_coach' | 'admin' | 'assistant' | 'coordinator';
export type SessionType = 'practice' | 'game' | 'scrimmage' | 'tournament' | 'training';
export type Sentiment = 'positive' | 'needs-work' | 'neutral';
export type ObservationSource = 'voice' | 'typed' | 'photo' | 'video' | 'cv' | 'import' | 'debrief' | 'template' | 'observer';
export type RecordingStatus = 'recorded' | 'uploading' | 'uploaded' | 'transcribing' | 'transcribed' | 'parsing' | 'parsed' | 'reviewed' | 'failed';
export type MediaType = 'photo' | 'screenshot' | 'video' | 'game_film' | 'document';
export type PlanType = 'practice' | 'gameday' | 'weekly' | 'development_card' | 'parent_report' | 'report_card' | 'custom' | 'newsletter' | 'skill_challenge' | 'season_storyline' | 'self_assessment' | 'opponent_profile' | 'game_recap' | 'weekly_star' | 'season_summary' | 'coach_reflection' | 'player_messages' | 'team_group_message' | 'season_awards' | 'huddle_script' | 'team_personality' | 'practice_arc' | 'player_of_match' | 'team_talk' | 'season_letter' | 'pregame_brief' | 'sideline_talking_points';
export type ProficiencyLevel = 'insufficient_data' | 'exploring' | 'practicing' | 'got_it' | 'game_ready';
export type Trend = 'improving' | 'plateau' | 'regressing' | 'new';
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';
export type ConfigScope = 'system' | 'org' | 'team';
export type ConfigAuditAction = 'create' | 'update' | 'delete' | 'reset';
export type CVProcessingStatus = 'none' | 'pending' | 'processing' | 'complete' | 'failed';
export type CVJobStatus = 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled';
export type CVJobPriority = 'high' | 'medium' | 'low' | 'batch';
export type AttendanceStatus = 'present' | 'absent' | 'excused';
export type AvailabilityStatus = 'available' | 'limited' | 'injured' | 'sick' | 'unavailable';
export type GoalStatus = 'active' | 'achieved' | 'stalled' | 'archived';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun … 6=Sat
export type AchievementBadgeType =
  | 'first_star'        // first positive observation
  | 'team_player'       // 10+ positive observations
  | 'grinder'           // 25+ total observations
  | 'all_rounder'       // 4+ unique skill categories
  | 'breakthrough'      // any skill reaches game_ready
  | 'game_changer'      // positive obs in a game/scrimmage
  | 'session_regular'   // attended 10+ sessions
  | 'coach_pick'        // manually awarded — general recognition
  | 'most_improved'     // manually awarded
  | 'rising_star';      // manually awarded
export type WebhookEvent =
  | 'observation.created'
  | 'session.created'
  | 'session.updated'
  | 'plan.created'
  | 'player.created'
  // Team archive + hard-delete events (ticket 0053). The bus fires these
  // exactly once per archive / unarchive / delete; payload shape is
  // { team_id, org_id } for archive/unarchive and adds { removed_counts }
  // for delete.
  | 'team.archived'
  | 'team.unarchived'
  | 'team.deleted';

export type AIInteractionType =
  | 'segment_transcript'
  | 'parse_observation'
  | 'generate_practice_plan'
  | 'generate_gameday_sheet'
  | 'generate_weekly_plan'
  | 'generate_development_card'
  | 'generate_parent_report'
  | 'generate_report_card'
  | 'analyze_photo'
  | 'analyze_video'
  | 'roster_import'
  | 'cv_coaching_event_extraction'
  | 'cv_identity_resolution'
  | 'generate_season_storyline'
  | 'transcription'
  | 'custom';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  tier?: string;
  sport_config: Json;
  settings: Json;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Coach {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: CoachRole;
  preferences: Json;
  onboarding_complete: boolean;
  // Coach-quiet-hours primitive (ticket 0042). When in the future, every
  // outbound cron short-circuits before any send work for this coach.
  paused_until: string | null;
  // Most recent meaningful activity timestamp; the check-in cron uses it to
  // find quiet coaches. Nullable for existing rows that pre-date this column.
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sport {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  default_positions: string[];
  default_categories: string[];
  default_age_groups: string[];
  plan_templates: Json;
  drill_categories: string[];
  stat_fields: Json;
  curriculum_enabled: boolean;
  default_curriculum_config: Json;
  terminology: Json;
  created_at: string;
}

export interface Curriculum {
  id: string;
  sport_id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  is_default: boolean;
  is_public: boolean;
  publisher_name: string | null;
  import_count: number;
  config: Json;
  created_at: string;
  updated_at: string;
}

export interface CurriculumSkill {
  id: string;
  curriculum_id: string;
  skill_id: string;
  name: string;
  category: string;
  age_groups: string[];
  intro_week: number | null;
  teaching_script: string | null;
  demo_video_url: string | null;
  progression_levels: Json;
  cv_evaluation_config: Json | null;
  sort_order: number;
  created_at: string;
}

/**
 * Team-scoped custom skill. Lives alongside CurriculumSkill via getMergedCurriculum.
 * skill_id is always prefixed with `custom:` (DB constraint) so it can never
 * collide with a built-in curriculum_skills.skill_id.
 */
export interface TeamCustomSkill {
  id: string;
  team_id: string;
  skill_id: string;            // always starts with 'custom:'
  name: string;
  category: string;
  age_groups: string[];
  intro_week: number | null;
  teaching_script: string | null;
  progression_levels: Json;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Discriminated union of base and custom skills returned by getMergedCurriculum.
 * Consumers that need to tell them apart can check `is_custom`.
 */
export type MergedSkill =
  | (CurriculumSkill & { is_custom: false })
  | (TeamCustomSkill & { is_custom: true });

export interface Team {
  id: string;
  org_id: string;
  sport_id: string;
  curriculum_id: string | null;
  name: string;
  age_group: string;
  season: string | null;
  season_weeks: number | null;
  current_week: number;
  is_active: boolean;
  settings: Json;
  // Team archive state (migration 029 + ticket 0053). Null when the team is
  // live; a timestamp once the admin (or the auto-downgrade webhook) sets it.
  // Default reads on /api/me + the team switcher filter rows on this column.
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamCoach {
  team_id: string;
  coach_id: string;
  role: 'head_coach' | 'coach' | 'assistant';
}

export interface Player {
  id: string;
  team_id: string;
  name: string;
  nickname: string | null;
  name_variants: string[] | null;
  age_group: string;
  date_of_birth: string | null;
  position: string;
  jersey_number: number | null;
  photo_url: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  medical_notes: string | null;
  notes: string | null;
  is_active: boolean;
  // Ticket 0034 — coach-confirmed cross-season link to this player's prior-season
  // players row (nullable self-FK). Carries NO new information about the minor; it
  // is only a pointer used to thread the coach's own prior-season parent report as
  // continuity context. Null for every existing player (behaves as today).
  prior_player_id: string | null;
  // Ticket 0052 — soft-state marker the next-season turnover flow flips when a
  // player aged up / left the program. Released != deleted: the row stays and
  // cross-season observation history stays attached by id (so the parent-report
  // "since last report" narrative and the AI prompts' multi-season memory keep
  // working), but every active-roster read filters released_at IS NULL so the
  // released kid stops appearing on capture / roster / parent contact.
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  team_id: string;
  coach_id: string;
  type: SessionType;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  opponent: string | null;
  result: string | null;
  notes: string | null;
  planned_drills: Json | null;
  actual_drills: Json | null;
  curriculum_week: number | null;
  cv_processing_status: CVProcessingStatus;
  cv_source_files: Json | null;
  coach_debrief_text: string | null;
  coach_debrief_extracts: Json | null;
  quality_rating: number | null;
  created_at: string;
}

export interface SessionAttendance {
  id: string;
  session_id: string;
  player_id: string;
  status: AttendanceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerAvailability {
  id: string;
  player_id: string;
  team_id: string;
  status: AvailabilityStatus;
  reason: string | null;
  expected_return: string | null; // ISO date YYYY-MM-DD
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringSession {
  id: string;
  team_id: string;
  coach_id: string;
  type: SessionType;
  day_of_week: DayOfWeek;
  start_time: string | null;  // HH:MM
  end_time: string | null;    // HH:MM
  location: string | null;
  start_date: string;         // YYYY-MM-DD
  end_date: string;           // YYYY-MM-DD
  created_at: string;
}

export interface Observation {
  id: string;
  player_id: string | null;
  team_id: string;
  coach_id: string;
  session_id: string | null;
  recording_id: string | null;
  media_id: string | null;
  category: string;
  sentiment: Sentiment;
  text: string;
  raw_text: string | null;
  source: ObservationSource;
  ai_parsed: boolean;
  coach_edited: boolean;
  ai_interaction_id: string | null;
  skill_id: string | null;
  drill_id: string | null;
  event_type: string | null;
  result: string | null;
  cv_metrics: Json | null;
  cv_failure_tags: string[] | null;
  cv_identity_confidence: number | null;
  video_clip_ref: Json | null;
  audio_annotation: Json | null;
  source_modalities: string[] | null;
  local_id: string | null;
  synced_at: string | null;
  is_synced: boolean;
  is_highlighted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Recording {
  id: string;
  team_id: string;
  coach_id: string;
  session_id: string | null;
  storage_path: string | null;
  local_path: string | null;
  file_size_bytes: number | null;
  mime_type: string;
  raw_transcript: string | null;
  transcript_provider: string | null;
  transcript_confidence: number | null;
  status: RecordingStatus;
  retry_count: number;
  last_error: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface Media {
  id: string;
  team_id: string;
  coach_id: string;
  player_id: string | null;
  session_id: string | null;
  type: MediaType;
  storage_path: string | null;
  local_path: string | null;
  thumbnail_path: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  ai_analysis: string | null;
  ai_interaction_id: string | null;
  caption: string | null;
  tags: string[] | null;
  cv_processing_status: CVProcessingStatus;
  cv_processing_job_id: string | null;
  is_synced: boolean;
  synced_at: string | null;
  created_at: string;
}

export interface AIInteraction {
  id: string;
  coach_id: string;
  team_id: string;
  interaction_type: AIInteractionType;
  model: string;
  system_prompt: string;
  user_prompt: string;
  prompt_context: Json | null;
  response_text: string | null;
  response_parsed: Json | null;
  response_tokens_in: number | null;
  response_tokens_out: number | null;
  response_latency_ms: number | null;
  coach_accepted: boolean | null;
  coach_edited: boolean | null;
  coach_rating: number | null;
  coach_feedback: string | null;
  status: 'success' | 'error' | 'timeout' | 'rate_limited';
  error_message: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  team_id: string;
  coach_id: string;
  player_id: string | null;
  session_id: string | null;
  ai_interaction_id: string | null;
  type: PlanType;
  title: string | null;
  content: string;
  content_structured: Json | null;
  curriculum_week: number | null;
  skills_targeted: string[] | null;
  is_shared: boolean;
  share_token: string | null;
  share_expires_at: string | null;
  /**
   * Ticket 0045 — slugged drill names the coach ACTUALLY ran on this plan
   * (stamped by the timer's "end practice" flow). Empty array by default; the
   * unfinished-drills rollover diff treats `[]` as "everything skipped" so a
   * force-closed timer is generous to the next plan generation.
   */
  completed_drill_ids: string[];
  created_at: string;
}

export interface Drill {
  id: string;
  sport_id: string;
  org_id: string | null;
  coach_id: string | null;
  curriculum_skill_id: string | null;
  name: string;
  description: string;
  category: string;
  age_groups: string[];
  duration_minutes: number | null;
  player_count_min: number;
  player_count_max: number | null;
  equipment: string[] | null;
  video_url: string | null;
  diagram_url: string | null;
  cv_eval_config: Json | null;
  setup_instructions: string | null;
  teaching_cues: string[] | null;
  source: 'seeded' | 'coach' | 'ai' | 'community' | 'curriculum';
  created_at: string;
}

export interface PlayerSkillProficiency {
  id: string;
  player_id: string;
  skill_id: string;
  session_type: string | null;
  proficiency_level: ProficiencyLevel;
  success_rate: number | null;
  reps_evaluated: number | null;
  trend: Trend | null;
  practice_success_rate: number | null;
  game_success_rate: number | null;
  transfer_score: number | null;
  last_observation_at: string | null;
  computed_at: string;
}

export interface ParentShare {
  id: string;
  player_id: string;
  team_id: string;
  coach_id: string;
  share_token: string;
  pin: string | null;
  include_observations: boolean;
  include_development_card: boolean;
  include_report_card: boolean;
  include_highlights: boolean;
  include_goals: boolean;
  include_drills: boolean;
  include_coach_note: boolean;
  include_skill_challenges: boolean;
  custom_message: string | null;
  view_count: number;
  last_viewed_at: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

// Public coach-to-coach referral card mapping (ticket 0010). Maps a public token
// to ONE team_personality plan + the creating coach. No minor data — the public
// read renders team-level content only.
export interface TeamCardShare {
  id: string;
  token: string;
  plan_id: string;
  coach_id: string;
  is_active: boolean;
  created_at: string;
}

// Public coach profile card mapping (ticket 0026). Maps a public token to the
// COACH themselves (not a plan): /coach/[token] renders the coach's standing
// identity surface. No minor data — the public read exposes only coach-level
// fields + aggregate integer counts derived from existing rows.
export interface CoachCardShare {
  id: string;
  token: string;
  coach_id: string;
  is_active: boolean;
  created_at: string;
}

// Public game-recap card mapping (ticket 0027). Maps a public token to ONE
// game_recap plan + the creating coach: /recap/[token] renders the team-level
// recap a coach drops in the team group chat. No minor data — the public read
// renders team-level content only and strips player_highlights (per-minor names).
export interface GameRecapShare {
  id: string;
  token: string;
  plan_id: string;
  coach_id: string;
  is_active: boolean;
  created_at: string;
}

export interface ConfigOverride {
  id: string;
  org_id: string | null;
  team_id: string | null;
  scope: 'org' | 'team';
  domain: string;
  key: string;
  value: Json;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigAuditLog {
  id: string;
  config_override_id: string | null;
  org_id: string | null;
  team_id: string | null;
  domain: string;
  key: string;
  action: ConfigAuditAction;
  previous_value: Json | null;
  new_value: Json | null;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

export interface FeatureFlag {
  id: string;
  flag_key: string;
  name: string;
  description: string | null;
  default_enabled: boolean;
  enabled_tiers: string[];
  created_at: string;
}

export interface OrgFeatureFlag {
  org_id: string;
  flag_key: string;
  enabled: boolean;
  enabled_by: string | null;
  enabled_at: string;
}

export interface OrgBranding {
  org_id: string;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string | null;
  font_family: string | null;
  custom_css: string | null;
  parent_portal_header_text: string | null;
  parent_portal_footer_text: string | null;
  email_sender_name: string | null;
  email_footer_html: string | null;
  custom_domain: string | null;
  updated_at: string;
}

export interface OrgRole {
  id: string;
  org_id: string;
  role_key: string;
  name: string;
  description: string | null;
  permissions: Json;
  is_system: boolean;
  sort_order: number;
  created_at: string;
}

export interface NotificationSettings {
  id: string;
  org_id: string;
  coach_id: string | null;
  notify_parent_on_report: boolean;
  notify_coach_on_parent_view: boolean;
  notify_coach_on_processing_complete: boolean;
  weekly_digest_coach: boolean;
  weekly_digest_parent: boolean;
  channels: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  coach_id: string;
  entity_type: string;
  entity_id: string;
  operation: SyncOperation;
  payload: Json | null;
  status: SyncStatus;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  synced_at: string | null;
}

export interface Webhook {
  id: string;
  org_id: string;
  coach_id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  is_active: boolean;
  last_triggered_at: string | null;
  last_status: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Season Archives ──────────────────────────────────────────────────────────

export interface SeasonArchiveSkill {
  name: string;
  category: string;
  level: ProficiencyLevel;
  trend: Trend | null;
}

export interface SeasonArchivePlayer {
  player_id: string;
  player_name: string;
  skills: SeasonArchiveSkill[];
}

export interface SeasonArchive {
  id: string;
  org_id: string;
  team_id: string;
  coach_id: string;
  season_name: string;
  start_date: string | null;
  end_date: string | null;
  session_count: number;
  observation_count: number;
  player_count: number;
  player_snapshot: SeasonArchivePlayer[];
  notes: string | null;
  archived_at: string;
  created_at: string;
}

export interface PlayerAchievement {
  id: string;
  player_id: string;
  team_id: string;
  badge_type: AchievementBadgeType;
  earned_at: string;
  awarded_by: string | null;
  note: string | null;
  created_at: string;
}

export interface PlayerGoal {
  id: string;
  player_id: string;
  team_id: string;
  coach_id: string | null;
  skill: string;
  goal_text: string;
  target_level: ProficiencyLevel | null;
  target_date: string | null;
  status: GoalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Player Notes (Private Coach Journal) ────────────────────────────────────

export interface PlayerNote {
  id: string;
  player_id: string;
  team_id: string;
  coach_id: string | null;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Team Announcements ───────────────────────────────────────────────────────

export type AnnouncementExpiry = '3d' | '7d' | '14d' | 'never';

export interface TeamAnnouncement {
  id: string;
  team_id: string;
  created_by: string;
  title: string;
  body: string;
  expires_at: string | null;
  created_at: string;
}

// ─── Parent Reactions ─────────────────────────────────────────────────────────

export interface ParentReaction {
  id: string;
  share_token: string;
  player_id: string | null;
  team_id: string | null;
  coach_id: string | null;
  reaction: string;
  message: string | null;
  parent_name: string | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Ticket 0039 — one rating fact per (coach, drill). COACH-private, cross-team:
 * the structured-coach-artifact moat that lets a coach's thumbs-up travel across
 * phones, teams, and seasons. NO `team_id`, no player reference, no observation
 * text — only who, which drill, the rating, when, and a best-effort run count
 * sourced from the existing local drill-run-history.
 *
 * Ticket 0044 extends this with a `signal_type` column (default 'rating') so
 * the same table can also persist a coach's "hide these suggestions"
 * dismissal. Existing rows from 0039 default to 'rating' on the column-add;
 * the new 'dismiss_suggestion' value is reserved for the dismiss POST. The
 * v1 CHECK allow-list is exactly those two values.
 */
export interface CoachDrillSignal {
  coach_id: string;
  drill_id: string;
  rating: 'up' | 'down';
  run_count: number;
  last_rated_at: string;
  signal_type: 'rating' | 'dismiss_suggestion';
}

/**
 * Ticket 0044 — per-(sport, drill, next_drill) aggregate of how many distinct
 * coaches in the same sport rated `drill_id` and then rated `next_drill_id`
 * within 14 days. NO coach reference anywhere on this row — the integer
 * `coach_count` is the only quantification — so the table itself is
 * privacy-safe even ignoring the route's >=5 k-anonymity floor. Refreshed
 * nightly by the `/api/cron/refresh-drill-sequences` route.
 */
export interface DrillSequenceAggregate {
  sport: string;
  drill_id: string;
  next_drill_id: string;
  coach_count: number;
  last_refreshed_at: string;
}
