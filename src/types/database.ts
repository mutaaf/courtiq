// SportsIQ Database Types — Generated from schema

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CoachRole = 'coach' | 'head_coach' | 'admin' | 'assistant' | 'coordinator';
export type SessionType = 'practice' | 'game' | 'scrimmage' | 'tournament' | 'training';
export type Sentiment = 'positive' | 'needs-work' | 'neutral';
export type ObservationSource = 'voice' | 'typed' | 'photo' | 'video' | 'cv' | 'import' | 'debrief' | 'template' | 'observer';
export type RecordingStatus = 'recorded' | 'uploading' | 'uploaded' | 'transcribing' | 'transcribed' | 'parsing' | 'parsed' | 'reviewed' | 'failed';
export type MediaType = 'photo' | 'screenshot' | 'video' | 'game_film' | 'document';
export type PlanType = 'practice' | 'gameday' | 'weekly' | 'development_card' | 'parent_report' | 'report_card' | 'custom' | 'newsletter' | 'skill_challenge' | 'season_storyline' | 'self_assessment' | 'opponent_profile' | 'game_recap' | 'weekly_star' | 'season_summary' | 'coach_reflection' | 'player_messages' | 'team_group_message' | 'season_awards' | 'huddle_script' | 'team_personality' | 'practice_arc' | 'player_of_match' | 'team_talk' | 'season_letter' | 'pregame_brief' | 'sideline_talking_points' | 'postgame_parent_texts' | 'mid_season_team_newsletter';
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
  | 'generate_player_handoff_card'
  | 'generate_player_trajectory'
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
  // Referral-conversion celebration card bookmark (ticket 0047). The home card
  // fires when the live referralCount > last_seen_referral_count and advances
  // this value on view. NOT NULL DEFAULT 0 in the DB; existing rows start at 0.
  last_seen_referral_count: number;
  // Vanity handle for the public coach profile (ticket 0054). One-time-claim
  // (v1 has no rename flow). Lowercase alphanumeric + hyphens, 2–32 chars,
  // no leading/trailing hyphen — same shape the DB CHECK enforces and the
  // /api/coach-handle/{available,claim} routes validate. Null until claimed.
  handle: string | null;
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
  /**
   * Ticket 0049 — when this plan was created by cloning a published practice
   * plan from another coach via /plan/<token>, this points at the SOURCE
   * plan's id (attribution). Null on every plan that wasn't cloned. The
   * source plan being deleted clears this to NULL (the clone keeps running).
   */
  source_plan_id: string | null;
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

// Parent-to-OTHER-coach invite audit (ticket 0060). One row per parent tap of
// the "Invite Sofia's coach with one tap" surface on /share/[token]. NO minor
// data: no parent_email, no parent_phone, no date_of_birth, no sibling last
// name. The candidate-lookup route resolves the sibling's first name from
// `players.name.split(' ')[0]` and surfaces it as a pre-fill the parent can
// edit before sending; what is persisted here is parent-authored. The
// Parent → parent on-team forward attribution edge (ticket 0079). One row
// per (sender_player, recipient_player) edge written when a parent on the
// team forwards this week's report to another parent on the SAME team via
// the new POST /api/share/parent-forward. COPPA: no names, no emails, no
// note text — only opaque ids and a team scope. UNIQUE on
// (sender_player_id, recipient_player_id) is the durable idempotency gate.
//
// Ticket 0080 widens the row with `cross_team` so attribution surfaces can
// distinguish in-team forwards (the 0079 default — `cross_team = false`)
// from cross-team-same-program forwards (`cross_team = true`). Per
// LESSONS#0103 — declaring the field non-optional here is fine because
// migration 071 stamps NOT NULL DEFAULT FALSE; every existing 0079 caller
// still byte-identical inherits the default.
export interface ParentForwardSignal {
  id: string;
  sender_player_id: string;
  recipient_player_id: string;
  team_id: string;
  dispatched_at: string;
  opened_at: string | null;
  cross_team: boolean;
}

// referral_code is stamped from `makeReferralCode(programId)` so the program
// owns the referral (the parent never receives a referral credit per AC).
export interface ParentInitiatedInvite {
  id: string;
  from_share_token: string;
  from_player_id: string | null;
  to_coach_email: string;
  sibling_first_name: string | null;
  program_id: string | null;
  referral_code: string | null;
  sent_at: string;
}

// Parent-to-program-director referral audit (ticket 0050). One row per submit
// of the parent portal's "Send this to our program director" form. NO minor
// data: no player_id, no observation excerpt, no DOB. The source coach is
// resolved at read time via parent_shares -> teams -> coaches; never copied
// here. claimed_at/claimed_org_id are stamped on the row when the director
// completes the 0033 claim flow under a verified signed_director_id.
export interface ProgramReferral {
  id: string;
  share_token: string;
  parent_first_name: string;
  parent_email: string | null;
  director_first_name: string;
  director_email: string;
  director_email_hash: string;
  note: string | null;
  signed_director_id: string;
  sent_at: string;
  claimed_at: string | null;
  claimed_org_id: string | null;
}

// Public coach-to-coach referral card mapping (ticket 0010). Maps a public token
// to ONE team_personality plan + the creating coach. No minor data — the public
// read renders team-level content only.
//
// Ticket 0043 extends this with a nullable `type` column (default 'team_card')
// so the mid-season team-newsletter share can ride on this same mapping table
// (the value 'mid_season_team_newsletter' on a newsletter share row) instead
// of needing a brand-new shares table. Existing rows default-fill to
// 'team_card' so the team-card flow stays byte-identical.
export interface TeamCardShare {
  id: string;
  token: string;
  plan_id: string;
  coach_id: string;
  is_active: boolean;
  type: 'team_card' | 'mid_season_team_newsletter' | null;
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

// Public practice-plan share mapping (ticket 0049). Maps a public token to ONE
// type='practice' plan + the publishing coach: /plan/[token] renders the
// drill list and a "Save to my team" CTA other coaches tap to clone the plan
// onto their own team. No minor data — practice plans are team-level (drill
// names + durations + focus areas, never per-player); the public read pins
// type='practice' so a future plan type that embedded a minor identifier
// could not cross. The optional `note` is the publisher's one-line context.
export interface PracticePlanShare {
  id: string;
  token: string;
  plan_id: string;
  coach_id: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

// Single-drill publish-and-clone primitive (ticket 0064). One row per
// (coach_id, drill_id) — re-publish UPDATEs caption + updated_at on the SAME
// row and reuses the same share_token. COACH-TO-COACH only — no player,
// parent, or minor reference. The clone destination is the cloning coach's
// preferences.favorited_drills array (the 0039 primitive), not a new table.
export interface DrillShare {
  id: string;
  coach_id: string;
  drill_id: string;
  share_token: string;
  caption: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// One row per (drill_share, cloner_coach) — the source of the publisher's
// clone-count rollup on their authed coach-profile dashboard. UNIQUE on
// (drill_share_id, cloner_coach_id) makes the clone route idempotent.
export interface DrillShareClone {
  id: string;
  drill_share_id: string;
  cloner_coach_id: string;
  cloned_at: string;
}

// Named persistent coach-to-coach edge (ticket 0063). A `coach_follows` row
// means the follower wants to see the followee's next published practice plans
// at the top of their own /plans league feed. COACH-TO-COACH ONLY — no
// player, parent, or minor reference. The UNIQUE(follower_id, followee_id)
// constraint makes follow idempotent; the CHECK(follower_id <> followee_id)
// blocks self-follow.
export interface CoachFollow {
  id: string;
  follower_id: string;
  followee_id: string;
  created_at: string;
}

// Weekly-pulse share mapping (ticket 0057). Maps a public token to a coach +
// team + ISO week so /week/[token] renders an aggregate "what my team is
// working on this week" card the coach drops in the league group chat. NO
// per-minor data on this table: the public render path joins live to teams /
// observations / sessions for team-level aggregates only (session count, top
// categories, focus line). The (coach_id, team_id, iso_week) UNIQUE
// constraint guarantees a coach who taps Publish twice in the same week
// reuses the same token.
export interface WeeklyPulseShare {
  id: string;
  token: string;
  coach_id: string;
  team_id: string;
  iso_week: string;
  caption: string | null;
  is_active: boolean;
  created_at: string;
}

// Coach-to-director invite contact (ticket 0065). One row per (coach_id,
// director_email_hash) — a re-invite of the same director by the same coach
// increments invite_count and bumps last_invited_at on the SAME row. The
// table is COACH-TO-DIRECTOR ONLY — no player, parent, session, observation,
// age band, or minor reference. The director_email_hash exists so the dedup
// query (shared 30-day check across this table AND program_referrals from
// 0050) never puts a raw email into a WHERE clause (mirrors the 0050
// posture). The raw email is stored so a second invite can re-send to the
// same address; it is NEVER returned to the client (the prefill GET masks
// it as `m***@example.com`).
export interface CoachDirectorContact {
  id: string;
  coach_id: string;
  director_first_name: string;
  director_email: string;
  director_email_hash: string;
  last_invited_at: string;
  invite_count: number;
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
  // Ticket 0056 — coach-side one-tap thank-you reply. Both NULL until the
  // coach taps Send on the in-app sheet; coach_reply_id points at the
  // team_announcements row that carries the actual reply (existing channel).
  coach_reply_at: string | null;
  coach_reply_id: string | null;
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

/**
 * Ticket 0059 — the cross-coach program-internal "what worked for me coaching
 * this kid" handoff card. One row per (source_coach, source_player, source_team)
 * by the idempotency UNIQUE constraint. `card_body` is COACH-AUTHORED prose
 * (the AI summarizes the source coach's existing observations into 3-4 short
 * sentences; it does NOT invent new descriptive minor data). The receiving
 * coach's claim stamps `claimed_*` and writes the body into the existing
 * `player_notes` table — no new column on `players` (COPPA).
 */
export interface PlayerHandoff {
  id: string;
  source_coach_id: string;
  source_player_id: string;
  source_team_id: string;
  org_id: string;
  season_label: string;
  card_body: string;
  ai_provider: string;
  claimed_by_coach_id: string | null;
  claimed_at: string | null;
  claimed_player_id: string | null;
  is_archived: boolean;
  created_at: string;
}

// Ticket 0061 — per-player "Week 1 vs now" trajectory cache row.
// The route writes one row per (player_id, observation_count_bucket) on AI
// miss; re-opens in the same bucket read the cached row.
export interface PlayerTrajectoryAnchor {
  headline: string;
  sentence: string;
  observation_id: string;
  observed_at: string;
}
export interface PlayerTrajectoryTurningPoint {
  observation_id: string;
  observed_at: string;
  oneWordLabel: string;
}
export interface PlayerTrajectory {
  id: string;
  player_id: string;
  observation_count_bucket: number;
  started: PlayerTrajectoryAnchor;
  now: PlayerTrajectoryAnchor;
  turning_points: Array<{ observation_id: string; observed_at: string; one_word_label: string }>;
  created_at: string;
}

// Ticket 0061 — per-(coach, player) view audit. Drives the free-tier
// 30-day preview gate. One row per VIEW (not per generation) so the wall
// stays consistent whether the route hit the cache or invoked the AI.
export interface PlayerTrajectoryView {
  id: string;
  coach_id: string;
  player_id: string;
  viewed_at: string;
}

// Ticket 0067 — substitute-coach Tuesday-night handoff. One row per
// (session_id, coach_id) — re-creating the handoff for the same session
// UPDATES this row in place. The observer_token is minted by
// src/lib/observer-utils.ts (the existing 24h HMAC token shape) so the
// sub-facing page rides the SAME validation path the bare observer link
// rides. The three include-flag booleans drive what the public
// /sub/<token> page renders; the sub_note_* fields carry the sub-coach's
// optional one-line note back to the regular coach.
export interface SubHandoff {
  id: string;
  session_id: string;
  coach_id: string;
  observer_token: string;
  sub_first_name: string | null;
  include_queued_drills: boolean;
  include_weekly_focus: boolean;
  include_eyes_on_players: boolean;
  sub_note_text: string | null;
  sub_note_at: string | null;
  sub_note_seen_at: string | null;
  created_at: string;
}

// Ticket 0068 — the season-opener share. ONE row per team per season; a
// re-create on the same (team_id, season_label) REPLACES the focus_line +
// the token (the coach can refresh a stale link in one tap).
export interface SeasonOpenerShare {
  id: string;
  team_id: string;
  coach_id: string;
  token: string;
  season_label: string;
  focus_line: string;
  created_at: string;
}

// Ticket 0069 — coach-facing post-loss decompression. ONE row per
// (session, coach): the 30-second voice note the coach records on the
// drive home from a bad loss, the AI's single drill recommendation for
// the next practice's drill #1, and the consumed-state stamp the
// /api/ai/plan route flips when it inserts the drill at index 0.
// COACH-AUTHORED ONLY — never a player FK, never a parent contact.
// The transcript may mention a player by first name (the coach said it
// on the recording); the AI prompt is positive about first-names-only,
// and a defensive last-name strip runs on the `why` line before
// persistence (LESSONS#0061).
export interface GameDecompression {
  id: string;
  session_id: string;
  coach_id: string;
  team_id: string;
  transcript: string;
  duration_seconds: number;
  recommended_drill_name: string | null;
  recommended_drill_setup: string[] | null;
  recommended_drill_why: string | null;
  consumed_at: string | null;
  consumed_plan_id: string | null;
  created_at: string;
}

// Ticket 0072 — dormant-coach reactivation signal. ONE row per (dormant
// coach, prior player) edge fired when a parent on that prior player's
// row opens a parent-portal token for a DIFFERENT team (their other
// kid's fall season). The dormant coach's /home surface reads the
// unconsumed rows and renders the <ReturningParentCard />; the 0042
// quiet-coach cron extension reads the unconsumed-and-not-yet-notified
// rows and sends ONE email per signal. The parent email is stored as a
// SHA-256 hash — never the plaintext — and the dormant-coach surface
// never reads it either way (the only personalisation is the prior
// player's first name, which the coach already has on their roster).
export interface CoachReactivationSignal {
  id: string;
  dormant_coach_id: string;
  prior_team_id: string;
  prior_player_id: string;
  returning_parent_email_hash: string;
  fired_at: string;
  notified_at: string | null;
  consumed_at: string | null;
}

// Ticket 0073 — coach reputation milestone primitive. One row per
// (published coach, milestone kind) edge written by the clone-route
// best-effort hook when the publishing coach's reputation crosses a
// documented threshold. The home-card reads unconsumed rows and
// renders the most-recent; tapping "Got it" stamps notified_at.
export type CoachReputationMilestoneKind =
  | 'clones_3'
  | 'clones_10'
  | 'clones_25'
  | 'clones_50'
  | 'programs_2'
  | 'programs_4'
  | 'programs_8'
  // Ticket 0076 — the cloning coach ran the cloned drill AND thumbed
  // it up. Stuck-kind milestones fire from the thumbs-up hook.
  | 'stuck_1'
  | 'stuck_3'
  | 'stuck_8';

// Ticket 0076 — clone-stick edge. One row per (drill_share, cloner)
// when the cloning coach later thumbs-up the drill they cloned (a
// 0044 coach_drill_signals row with rating='up' signaled AFTER the
// drill_share_clones row). The signal — distinct from the raw clone
// — is "the cloning coach ran the drill on a real court and it
// worked". COACH-TO-COACH only — no player or parent reference.
export interface DrillCloneStickSignal {
  id: string;
  drill_share_id: string;
  cloner_coach_id: string;
  cloner_org_id: string | null;
  stuck_at: string;
}

export interface CoachReputationMilestone {
  id: string;
  published_coach_id: string;
  milestone_kind: CoachReputationMilestoneKind;
  crossed_at: string;
  notified_at: string | null;
}

// Ticket 0078 — dormant-publisher reactivation dispatch primitive.
// One row per (publishing coach, milestone) edge written when the
// existing 0042 cron's new 0078 branch dispatches a reactivation
// email to a dormant publishing coach whose 0073 / 0076 milestone
// row was crossed in the last 24h. The cron's per-coach cooldown
// lookup reads this table by (published_coach_id, dispatched_at
// DESC) to enforce the 60-day anti-fatigue contract. The UNIQUE
// (published_coach_id, milestone_id) constraint makes the dispatch
// row idempotent across re-runs of the same cron in the same
// window. COACH-TO-COACH only — no player or parent reference.
export interface CoachCloneReactivationSignal {
  id: string;
  published_coach_id: string;
  milestone_id: string;
  dispatched_at: string;
}

// Ticket 0081 — in-product DM primitive. ONE row per (sender_coach,
// recipient_coach, drill_share | plan_share) edge written when the
// publishing coach taps "Thank this coach" on a 0076 stuck milestone
// card. The receiving coach reads the row from /home's new Inbox
// surface; the row is the ENDPOINT of the publish-clone-stick loop,
// NOT the start of a chat (no thread, no reply). The schema-level
// UNIQUE on (sender, recipient, share) is the load-bearing anti-spam
// contract — ONE message per edge FOREVER.
//
// COPPA: this row carries the publisher's free text (sanitized to
// <= 280 chars + an anti-email-leak scan at the route layer) and
// the FK keys for sender/recipient/share/milestone. NO email, NO
// surname, NO phone, NO team name, NO player id, NO observation id,
// NO kid data is persisted on this row.
export interface CoachThankMessage {
  id: string;
  sender_coach_id: string;
  recipient_coach_id: string;
  drill_share_id: string | null;
  plan_share_id: string | null;
  milestone_id: string | null;
  body: string;
  sent_at: string;
  read_at: string | null;
}

// Ticket 0074 — referral credit grant primitive. One row per
// (inviter coach, milestone kind) edge written by the apply-credit
// route when the inviter's count of qualified converted coaches
// crosses a documented threshold. The home-card reads unconsumed rows
// and renders the most-recent; tapping "Got it" stamps notified_at.
// The qualified_referral_coach_ids array is the LOAD-BEARING AUDIT
// TRAIL — the original list of UUIDs at the moment the milestone
// fired, preserved even after a converted coach later deletes their
// account (LESSONS#0044 billing immutability).
export type ReferralCreditMilestoneKind =
  | 'qualified_3'
  | 'qualified_10'
  | 'qualified_25';

export interface ReferralCreditGrant {
  id: string;
  inviter_coach_id: string;
  milestone_kind: ReferralCreditMilestoneKind;
  qualified_referral_coach_ids: string[];
  credit_amount_cents: number;
  credit_currency: string;
  stripe_customer_balance_txn_id: string | null;
  granted_at: string;
  redeemed_period_end: string | null;
  notified_at: string | null;
}

// Ticket 0087 — director-side snooze row backing the "Maybe later" button
// on the new program-org-tier upgrade card. One row per (org_id, card_kind)
// edge; the program-pulse route reads the row and suppresses the card
// while `snoozed_until` is in the future. The CHECK enum on `card_kind`
// is intentionally narrow — v1 carries only `program_org_tier`.
export type OrgCardKind = 'program_org_tier';

export interface OrgCardSnooze {
  id: string;
  org_id: string;
  card_kind: OrgCardKind;
  snoozed_until: string;
  snoozed_by_coach_id: string;
  snoozed_at: string;
}

// ─── Ticket 0088 — coach_first_signal_celebrations ─────────────────────────
//
// Per-(coach, signal-kind) dedup row so the /home first-cross-coach-signal
// activation card fires EXACTLY ONCE per coach per kind. The card names
// the moment a coach crosses from "user of SportsIQ" to "person other
// coaches learn from"; the row's existence + dismissed_at = the
// activation moment has already been shown and dismissed.
export type CoachFirstSignalKind =
  | 'clone'
  | 'thank'
  | 'parent_forward'
  | 'parent_forward_cross_team'
  | 'reaction_cross_team'
  | 'paid_receipts_d60'
  | 'program_canon_inherited';

export interface CoachFirstSignalCelebration {
  id: string;
  coach_id: string;
  kind: CoachFirstSignalKind;
  fired_at: string;
  celebrated_at: string;
  dismissed_at: string | null;
}

// ─── Ticket 0090 — program_drill_canon ──────────────────────────────────────
//
// The institutional artifact a director publishes ONCE per program: the top
// 5-10 drills 3+ of the program's coaches have thumbed up via the existing
// 0039 cross-team `coach_drill_signals` persistence. Every new coach who
// joins the program post-publish inherits the canon's drill_ids into their
// own coach_drill_signals on day one (the "inheritance edge" extension to
// the existing staff-invite flow). superseded_at NULL = the active canon
// for that org; a re-publish stamps the old row's superseded_at and writes
// a new one. drill_ids is a JSONB array of UUID strings.
export interface ProgramDrillCanon {
  id: string;
  org_id: string;
  published_by_coach_id: string;
  drill_ids: string[];
  published_at: string;
  superseded_at: string | null;
}
