// SportsIQ Database Types — Generated from schema

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CoachRole = 'coach' | 'head_coach' | 'admin' | 'assistant' | 'coordinator';
export type SessionType = 'practice' | 'game' | 'scrimmage' | 'tournament' | 'training';
export type Sentiment = 'positive' | 'needs-work' | 'neutral';
export type ObservationSource = 'voice' | 'typed' | 'photo' | 'video' | 'cv' | 'import' | 'debrief' | 'template' | 'observer';
export type RecordingStatus = 'recorded' | 'uploading' | 'uploaded' | 'transcribing' | 'transcribed' | 'parsing' | 'parsed' | 'reviewed' | 'failed';
export type MediaType = 'photo' | 'screenshot' | 'video' | 'game_film' | 'document';
export type PlanType = 'practice' | 'gameday' | 'weekly' | 'development_card' | 'parent_report' | 'report_card' | 'custom' | 'newsletter' | 'skill_challenge' | 'season_storyline' | 'self_assessment' | 'opponent_profile' | 'game_recap' | 'weekly_star' | 'season_summary' | 'coach_reflection' | 'player_messages' | 'team_group_message' | 'season_awards' | 'huddle_script' | 'team_personality' | 'practice_arc' | 'player_of_match';
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
  | 'player.created';

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
  is_demo?: boolean;
  /**
   * Set on graceful downgrade when the team exceeds the new tier's quota.
   * UI treats archived teams as read-only and shows a "reactivate by
   * upgrading" CTA. NULL = active.
   */
  archived_at: string | null;
  settings: Json;
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
  // Long-session pipeline (migration 030)
  transcript_request_id: string | null;
  transcript_callback_secret: string | null;
  transcript_started_at: string | null;
  transcript_completed_at: string | null;
  transcript_cost_usd: number | null;
  total_duration_seconds: number | null;
  // Segmentation cache (migration 031) — webhook stores AI-extracted observations
  // here so /capture/review opens instantly without re-running segmentation.
  segmentation_result: Json | null;
  segmentation_completed_at: string | null;
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
