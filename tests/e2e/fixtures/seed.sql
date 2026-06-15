-- ════════════════════════════════════════════════════════════════════════
-- E2E seed — minimum rows the Playwright suite needs to run against a REAL
-- local Supabase in CI (ticket docs/backlog/0006).
--
-- Applied by the `e2e-tests` CI job AFTER `supabase start` (so migrations
-- 001–033 have already run, including the sport seeds in 003) and BEFORE
-- `npm start`. The job runs this with psql `ON_ERROR_STOP=1`, so any failure
-- here fails the job — there is no `|| true` masking the seed.
--
-- WHY a real DB at all: the public pages the CI suite actually exercises
-- (/login, /signup, /share/<token>, the OG image route) render through
-- middleware that calls supabase.auth.getUser() on EVERY request, and the
-- share page's server component fetches /api/share/<token> which reads these
-- tables with the service-role key. With the old dummy URL (localhost:54321 +
-- test-anon-key, nothing listening) those server-side calls hung/500'd and
-- even the public-page specs couldn't load. A reachable, seeded Supabase
-- fixes that.
--
-- The browser-layer specs (share-flow / plans-flow / admin-flow /
-- signup-onboarding) mock /api/* via page.route(), so their assertions are
-- fed by mocks, not these rows. The rows below still mirror the spec fixtures
-- 1:1 so the REAL (un-mocked) /api/share/<token> path renders the same data —
-- this is the contract the seed guarantees, and the AC's required floor.
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING so re-running (e.g. a
-- retried CI step) is safe.
-- ════════════════════════════════════════════════════════════════════════

-- Fixed UUIDs so specs / debugging can reference rows deterministically.
-- (The TS fixtures in tests/e2e/helpers/auth.ts use string ids like
--  'org-e2e-test-001'; Postgres uuid columns need real UUIDs, so we map the
--  same logical entities to fixed UUIDs here.)

begin;

-- ── auth.users ──────────────────────────────────────────────────────────
-- coaches.id references auth.users(id), so the coach's auth user must exist
-- first. No password is set: no CI spec actually authenticates (the
-- signInViaUI specs test.skip() without E2E_TEST_EMAIL/E2E_TEST_PASSWORD),
-- this row exists only to satisfy the FK. 'e2e@test.com' mirrors TEST_COACH.
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'e2e@test.com',
  now(), now(), now()
)
on conflict (id) do nothing;

-- ── organizations ───────────────────────────────────────────────────────
insert into organizations (id, name, slug, tier)
values ('00000000-0000-4000-a000-000000000010', 'E2E Test Org', 'e2e-test-org', 'pro_coach')
on conflict (id) do nothing;

-- ── org_branding (share page reads org_branding for the parent portal) ────
insert into org_branding (org_id, primary_color, parent_portal_header_text)
values ('00000000-0000-4000-a000-000000000010', '#F97316', 'Progress Report')
on conflict (org_id) do nothing;

-- ── coaches ──────────────────────────────────────────────────────────────
-- 'E2E Test Coach' mirrors TEST_COACH; role 'admin' so the (skipped-in-CI)
-- admin-flow spec has a valid coach if creds are ever supplied.
-- preferences.referral_code is stored explicitly as 'AAAAAA' = makeReferralCode
-- of this coach's UUID (the first 12 hex bytes are all 0x00 → CHARS[0]='A').
-- That's the SAME code the team-card / season-recap CTAs deep-link to; storing
-- it here lets the public /api/referrals/lookup (ticket 0021) resolve the
-- inviting coach's first name deterministically regardless of e2e spec ordering
-- (rather than relying on another spec to lazily persist it first).
insert into coaches (id, org_id, full_name, email, role, onboarding_complete, preferences)
values (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000010',
  'E2E Test Coach', 'e2e@test.com', 'admin', true,
  '{"referral_code": "AAAAAA"}'::jsonb
)
on conflict (id) do nothing;

-- ── coaches.handle for the vanity coach URL e2e (ticket 0054) ───────────────
-- The handle column is added by migration 051_coaches_handle.sql. The e2e
-- spec at tests/e2e/coach-handle-flow.spec.ts visits /coach/e2e-coach
-- expecting the SAME coach card the existing
-- /coach/test-coach-card-token-e2e-001 token renders.
-- Idempotent: a re-applied seed UPDATEs to the same value (the ON CONFLICT
-- on the prior insert short-circuits, so we set the handle explicitly).
update coaches set handle = 'e2e-coach'
  where id = '00000000-0000-4000-a000-000000000001'
    and (handle is null or handle <> 'e2e-coach');

-- ── teams ─────────────────────────────────────────────────────────────────
-- name 'E2E Test Team' is asserted by share-flow.spec.ts:56 (and mirrors
-- TEST_TEAM in helpers/auth.ts). sport_id resolves to the basketball row
-- seeded by migration 003_sport_seeds.sql.
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000010',
  (select id from sports where slug = 'basketball' limit 1),
  'E2E Test Team', '11-13', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- ── players ───────────────────────────────────────────────────────────────
-- 'Alice Walker' is asserted by share-flow.spec.ts:51 (mirrors TEST_PLAYERS[0]).
-- 'Bob Carter' mirrors TEST_PLAYERS[1] and the injectPendingObservations
-- fixture used by signup-onboarding-capture.spec.ts. players.age_group is
-- NOT NULL, so it must be set here (the TS fixture omits it).
insert into players (id, team_id, name, nickname, name_variants, age_group, position, jersey_number, parent_name, is_active)
values
  ('00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020',
   'Alice Walker', null, null, '11-13', 'Guard', 1, 'Walker Family', true),
  ('00000000-0000-4000-a000-000000000031',
   '00000000-0000-4000-a000-000000000020',
   'Bob Carter', 'Bobby', '{"Bobby","Bob C."}', '11-13', 'Forward', 5, null, true)
on conflict (id) do nothing;

-- ── cross-season memory (ticket 0034) ──────────────────────────────────────
-- A PRIOR-season team in the SAME org, plus the prior-season players row for
-- Alice and the prior-season parent_report that the cross-season note draws on.
-- The current-season Alice (...030) is linked to this prior row via
-- prior_player_id so the parent-report route can resolve the cross-season note
-- deterministically (no live AI call in the seed itself). All rows are org-scoped
-- to the E2E org (...010), proving the link stays inside the coach's own org.
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000021',
  '00000000-0000-4000-a000-000000000010',
  (select id from sports where slug = 'basketball' limit 1),
  'E2E Test Team (Last Season)', '11-13', 'Spring 2025', 10, 10, false
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-000000000021',
  '00000000-0000-4000-a000-000000000001',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- Alice's PRIOR-season players row (a different team_id, same coach/org).
insert into players (id, team_id, name, nickname, name_variants, age_group, position, jersey_number, parent_name, is_active)
values
  ('00000000-0000-4000-a000-000000000032',
   '00000000-0000-4000-a000-000000000021',
   'Alice Walker', null, null, '11-13', 'Guard', 1, 'Walker Family', false)
on conflict (id) do nothing;

-- The prior-season parent report the cross-season note is grounded in.
insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured)
values (
  '00000000-0000-4000-a000-000000000073',
  '00000000-0000-4000-a000-000000000021',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000032',
  'parent_report',
  'Parent Report - Alice Walker (Spring 2025)',
  '{}',
  '{
    "player_name": "Alice Walker",
    "greeting": "Alice had a strong first season.",
    "highlights": ["Hesitated on closeouts but kept trying"],
    "skill_progress": [{"skill_name": "Defense", "level": "Practicing", "narrative": "Closeouts were tentative early on."}],
    "encouragement": "Keep showing up.",
    "coach_note": "Closeouts are the growth edge heading into next season."
  }'::jsonb
)
on conflict (id) do nothing;

-- Link the current-season Alice (...030) to her prior-season self (...032).
update players
  set prior_player_id = '00000000-0000-4000-a000-000000000032'
  where id = '00000000-0000-4000-a000-000000000030';

-- ── completed-season team (ticket 0036 — season-wrap card) ─────────────────
-- A team in the SAME org whose season is COMPLETE (current_week >= season_weeks)
-- with at least one practice + positive observations, so /api/season/wrap returns
-- phase 'complete' with factual totals + a growth highlight. The season-wrap home
-- card renders for this team and is ABSENT for the in-progress main team (...020).
-- season_weeks/current_week are INTEGER columns — no JSON quoting needed here
-- (LESSONS.md 2026-05-25 #0031 only applies to jsonb config values).
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000022',
  '00000000-0000-4000-a000-000000000010',
  (select id from sports where slug = 'basketball' limit 1),
  'E2E Wrap Team', '11-13', 'Fall 2025', 10, 10, true
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-000000000022',
  '00000000-0000-4000-a000-000000000001',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- An active player on the completed-season team (carried forward by the rollover).
insert into players (id, team_id, name, nickname, name_variants, age_group, position, jersey_number, parent_name, is_active)
values
  ('00000000-0000-4000-a000-000000000033',
   '00000000-0000-4000-a000-000000000022',
   'Devon Hayes', null, null, '11-13', 'Guard', 7, null, true)
on conflict (id) do nothing;

-- A practice session so the wrap phase reads 'complete' (zero practices → not_started).
insert into sessions (id, team_id, coach_id, type, date, location, notes)
values (
  '00000000-0000-4000-a000-000000000042',
  '00000000-0000-4000-a000-000000000022',
  '00000000-0000-4000-a000-000000000001',
  'practice', current_date - 20, 'Main Gym', 'E2E wrap-team practice'
)
on conflict (id) do nothing;

-- Positive observations so the wrap builds a growth highlight for Devon.
insert into observations (id, player_id, team_id, coach_id, session_id, category, sentiment, text, source, ai_parsed, is_highlighted)
values
  ('00000000-0000-4000-a000-000000000053',
   '00000000-0000-4000-a000-000000000033',
   '00000000-0000-4000-a000-000000000022',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000042',
   'Defense', 'positive', 'Locked down the wing all game', 'typed', false, true),
  ('00000000-0000-4000-a000-000000000054',
   '00000000-0000-4000-a000-000000000033',
   '00000000-0000-4000-a000-000000000022',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000042',
   'Defense', 'positive', 'Great close-outs on shooters', 'typed', false, false)
on conflict (id) do nothing;

-- ── sessions ──────────────────────────────────────────────────────────────
-- One practice session the observations below hang off of.
insert into sessions (id, team_id, coach_id, type, date, location, notes)
values (
  '00000000-0000-4000-a000-000000000040',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'practice', current_date - 3, 'Main Gym', 'E2E seed practice session'
)
on conflict (id) do nothing;

-- ── debriefed session (ticket 0014 — carryover strip) ─────────────────────
-- An older practice session with coach_debrief_extracts populated so the
-- carryover route returns a deterministic phrase for the capture-carryover
-- spec. The focus phrase 'closeouts' is the one asserted in the spec.
insert into sessions (id, team_id, coach_id, type, date, location, notes, coach_debrief_extracts)
values (
  '00000000-0000-4000-a000-000000000041',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'practice', current_date - 10, 'Main Gym', 'E2E seed debriefed session',
  '{"session_summary":"Good practice","player_highlights":[],"areas_to_improve":[],"next_practice_focus":[{"focus":"closeouts","rationale":"Gave up too many open threes","suggested_drill":"Close-out drill"},{"focus":"weak-hand finishing","rationale":"Drove left repeatedly","suggested_drill":"Mikan drill"}],"coaching_tip":"Keep it simple","overall_tone":"good"}'::jsonb
)
on conflict (id) do nothing;

-- ── observations ──────────────────────────────────────────────────────────
-- A few observations on Alice (positive ones surface on the parent portal as
-- highlights / season stats). Text mirrors the spec fixtures so the un-mocked
-- /api/share path renders the same content the mocked path asserts.
insert into observations (id, player_id, team_id, coach_id, session_id, category, sentiment, text, source, ai_parsed, is_highlighted)
values
  ('00000000-0000-4000-a000-000000000050',
   '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040',
   'Defense', 'positive', 'Great lateral movement on defense', 'voice', true, true),
  ('00000000-0000-4000-a000-000000000051',
   '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040',
   'Offense', 'positive', 'Strong finish at the rim in the scrimmage', 'typed', false, false),
  ('00000000-0000-4000-a000-000000000052',
   '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040',
   'Effort', 'positive', 'First one back on defense every possession', 'typed', false, false)
on conflict (id) do nothing;

-- ── parent_shares (the share-token row the parent portal resolves) ─────────
-- share_token 'test-share-token-e2e-001' matches SHARE_TOKEN in
-- share-flow.spec.ts. is_active=true, far-future expiry so the real
-- /api/share/<token> route returns 200 (not 404/410) for the un-mocked path.
insert into parent_shares (id, player_id, team_id, coach_id, share_token, include_report_card, include_highlights, include_observations, is_active, expires_at)
values (
  '00000000-0000-4000-a000-000000000060',
  '00000000-0000-4000-a000-000000000030',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'test-share-token-e2e-001',
  true, true, true, true,
  now() + interval '365 days'
)
on conflict (share_token) do nothing;

-- ── plans: existing portal sections for Alice (ticket 0009 regression) ──────
-- The share-flow "existing sections still render" spec asserts the Practice at
-- Home card (skill_challenge) renders alongside Coach's Best Moments (the
-- starred observation seeded above) for a player who has all sections. Alice
-- has NO weekly_star/player_of_match plan, so her portal shows NO spotlight
-- card — that's the spotlight-absent regression case.
insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured)
values
  ('00000000-0000-4000-a000-000000000071',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000030',
   'skill_challenge',
   'Skill Challenge — Alice Walker',
   '{}',
   '{
     "player_name": "Alice Walker",
     "week_label": "Week of May 18",
     "parent_note": "Two quick drills to try at home this week.",
     "challenges": [
       {"title": "Defensive Slides", "skill_area": "Defense", "difficulty": "beginner", "minutes_per_day": 10, "description": "Practice lateral slides.", "steps": ["Set two cones", "Slide between them"], "success_criteria": "10 clean slides", "encouragement": "Stay low!"}
     ]
   }'::jsonb),
  ('00000000-0000-4000-a000-000000000072',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000030',
   'report_card',
   'Report Card — Alice Walker',
   '{}',
   '{
     "player_name": "Alice Walker",
     "skills": [],
     "strengths": ["On-ball defense"],
     "growth_areas": ["Off-hand finishing"],
     "coach_note": "A real anchor on defense this season."
   }'::jsonb)
on conflict (id) do nothing;

-- ── plans: a Player of the Match spotlight for Bob Carter (ticket 0009) ─────
-- The share-flow spotlight spec asserts a "Player of the Match" card with this
-- artifact's headline + coach_message. content_structured carries the
-- player_of_match shape (session_label + headline + achievement + key_moment +
-- coach_message). player_id scopes the spotlight to Bob so it never leaks onto
-- Alice's portal. type='player_of_match' is allowed by the plans table.
insert into plans (id, team_id, coach_id, player_id, session_id, type, title, content, content_structured)
values (
  '00000000-0000-4000-a000-000000000070',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000031',
  '00000000-0000-4000-a000-000000000040',
  'player_of_match',
  'Player of the Match — Bob Carter (Game vs. Lincoln)',
  '{}',
  '{
    "player_name": "Bob Carter",
    "session_label": "Game vs. Lincoln",
    "headline": "Owned the paint all game",
    "achievement": "Crashed the boards relentlessly and protected the rim on every possession.",
    "key_moment": "Blocked the buzzer-beater to seal the win.",
    "coach_message": "You were the difference-maker out there today, Bob!"
  }'::jsonb
)
on conflict (id) do nothing;

-- ── parent_shares: spotlight token resolving to Bob Carter (ticket 0009) ────
-- share_token 'test-share-token-e2e-spotlight' matches SPOTLIGHT_TOKEN in
-- share-flow.spec.ts. Points at Bob (player ...031) so the un-mocked
-- /api/share/<token> path renders his Player of the Match spotlight.
insert into parent_shares (id, player_id, team_id, coach_id, share_token, include_highlights, include_observations, is_active, expires_at)
values (
  '00000000-0000-4000-a000-000000000061',
  '00000000-0000-4000-a000-000000000031',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'test-share-token-e2e-spotlight',
  true, true, true,
  now() + interval '365 days'
)
on conflict (share_token) do nothing;

-- ── plans: a team_personality artifact for the team (ticket 0010) ───────────
-- The public team-card surface renders ONLY team-level content_structured
-- fields (team_type / type_emoji / tagline / description / traits / strengths /
-- growth_areas / coaching_tips / team_motto). player_id is NULL — this is a
-- team-level artifact, never per-player. type='team_personality' is allowed by
-- the plans_type_check constraint (migration 034). The team_type / tagline /
-- first trait below are asserted by team-card-flow.spec.ts.
insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured)
values (
  '00000000-0000-4000-a000-000000000080',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  null,
  'team_personality',
  '🔥 The Grinders',
  '{}',
  '{
    "team_type": "The Grinders",
    "type_emoji": "🔥",
    "tagline": "Hard work is their superpower",
    "description": "A relentless, defense-first team that never quits, no matter the scoreboard.",
    "traits": [
      {"name": "Work Ethic", "score": 92, "description": "They out-hustle everyone on the floor."},
      {"name": "Defense", "score": 85, "description": "First one back every possession."},
      {"name": "Grit", "score": 88, "description": "They thrive when the game gets tight."}
    ],
    "strengths": ["Relentless effort", "Lockdown defense"],
    "growth_areas": ["Half-court offense"],
    "coaching_tips": ["Lean into their effort identity", "Run more set plays in the half court"],
    "team_motto": "Leave it all on the court"
  }'::jsonb
)
on conflict (id) do nothing;

-- ── team_card_shares: the public referral token resolving to that plan (0010) ─
-- token 'test-team-card-token-e2e-001' matches TEAM_CARD_TOKEN in
-- team-card-flow.spec.ts. is_active=true so the public /api/team-card/<token>
-- route returns 200. The seeded coach has NO preferences.referral_code, so the
-- route lazily generates makeReferralCode(coach uuid) = 'AAAAAA' (all-zero hex
-- bytes) and the page CTA deep-links to /signup?ref=AAAAAA.
insert into team_card_shares (id, token, plan_id, coach_id, is_active)
values (
  '00000000-0000-4000-a000-000000000081',
  'test-team-card-token-e2e-001',
  '00000000-0000-4000-a000-000000000080',
  '00000000-0000-4000-a000-000000000001',
  true
)
on conflict (token) do nothing;

-- ── plans: a mid_season_team_newsletter artifact for the team (ticket 0043) ─
-- The public /share/team-newsletter/<token> page reads ONLY the team-level
-- newsletter fields (headline / arc_summary / team_strengths / focus_areas /
-- coach_voice_quote). player_id is NULL — the newsletter is TEAM-wide by
-- construction (the AI schema has no per-player field). type=
-- 'mid_season_team_newsletter' is allowed by plans_type_check after
-- migration 049 widens the allow-list. The headline + an arc_summary
-- substring + a focus_areas substring below are asserted by
-- mid-season-newsletter-flow.spec.ts.
--
-- IMPORTANT: the plan id uses the unused 0...e0 range so it does NOT collide
-- with the existing season_summary plan id (0...090) below — an earlier draft
-- of this seed reused 090 and the on-conflict-do-nothing on the LATER
-- season_summary insert silently skipped that row, breaking
-- season-recap-flow.spec.ts on a fresh-CI DB (same hard-to-spot family as
-- LESSONS#84 / #85 / #86: a seed bug only the fresh DB under ON_ERROR_STOP=1
-- surfaces).
insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured)
values (
  '00000000-0000-4000-a000-0000000000e0',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  null,
  'mid_season_team_newsletter',
  'Mid-Season Newsletter — E2E Test Team',
  '{}',
  '{
    "headline": "Six weeks in: ball movement is starting to land.",
    "arc_summary": "We have built around moving the ball and crashing the boards. The last two practices have shown those reps starting to translate.",
    "team_strengths": [
      "The team is sharing the ball more on the second pass.",
      "Effort on rebounds is showing up in the second half of practice."
    ],
    "focus_areas": [
      "Closing out without fouling.",
      "Talking on defense in transition."
    ],
    "coach_voice_quote": "When we move the ball, good things happen — that has been the through line of this stretch."
  }'::jsonb
)
on conflict (id) do nothing;

-- ── team_card_shares: the public newsletter token (ticket 0043) ─────────────
-- token 'test-team-newsletter-token-e2e-001' matches NEWSLETTER_TOKEN in
-- mid-season-newsletter-flow.spec.ts. The new `type` column (added in
-- migration 049) is set to 'mid_season_team_newsletter' so the public
-- /api/share/team-newsletter/<token> reader resolves it; existing
-- team-card rows keep the default 'team_card' value so the 0010 referral
-- flow is byte-identical.
insert into team_card_shares (id, token, plan_id, coach_id, is_active, type)
values (
  '00000000-0000-4000-a000-0000000000e1',
  'test-team-newsletter-token-e2e-001',
  '00000000-0000-4000-a000-0000000000e0',
  '00000000-0000-4000-a000-000000000001',
  true,
  'mid_season_team_newsletter'
)
on conflict (token) do nothing;

-- ── plans: a season_summary artifact for the team (ticket 0017) ─────────────
-- The public season-recap surface renders ONLY the team-level recap fields named
-- in PUBLIC_RECAP_FIELDS (headline / season_period / overall_assessment /
-- team_highlights / skill_progress / team_challenges / coaching_insights /
-- next_season_priorities / closing_message). player_id is NULL — this is a
-- team-level artifact. content_structured deliberately INCLUDES player_breakthroughs
-- (with per-player names) so the COPPA strip is exercised end-to-end: the public
-- /api/season-recap/<token> route must NOT expose those. type='season_summary' is
-- allowed by plans_type_check (migration 034). The headline / closing_message
-- below are asserted by season-recap-flow.spec.ts.
insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured)
values (
  '00000000-0000-4000-a000-000000000090',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  null,
  'season_summary',
  'Season Recap — E2E Test Team',
  '{}',
  '{
    "headline": "A Season of Breakthroughs",
    "season_period": "Spring 2026 · Mar 1 – May 20",
    "overall_assessment": "The team grew from a group that struggled to hold a lead into one that closes games with poise.",
    "team_highlights": [
      {"title": "Defense first", "description": "Held opponents under 30 in the back half of the season."},
      {"title": "Comeback wins", "description": "Three double-digit comebacks down the stretch."}
    ],
    "skill_progress": [
      {"skill": "Transition defense", "status": "most_improved", "description": "Sprinting back as a unit."},
      {"skill": "Free throws", "status": "strength", "description": "Reliable from the line under pressure."}
    ],
    "player_breakthroughs": [
      {"player_name": "Alice Walker", "achievement": "Became the team defensive anchor."},
      {"player_name": "Bob Carter", "achievement": "Went from bench to starting point guard."}
    ],
    "team_challenges": ["Half-court spacing", "Turnovers vs. the press"],
    "coaching_insights": "The data shows the team responds to tight, competitive practice reps far more than to lecture.",
    "next_season_priorities": ["Install a base half-court offense", "Add a press-break package"],
    "closing_message": "You showed up every week and got better every week. That is what a real season looks like."
  }'::jsonb
)
on conflict (id) do nothing;

-- ── season_recap_shares: the public referral token resolving to that plan (0017) ─
-- token 'test-season-recap-token-e2e-001' matches SEASON_RECAP_TOKEN in
-- season-recap-flow.spec.ts. is_active=true so the public /api/season-recap/<token>
-- route returns 200. The seeded coach has NO preferences.referral_code, so the
-- route lazily generates makeReferralCode(coach uuid) = 'AAAAAA' (all-zero hex
-- bytes) and the page CTA deep-links to /signup?ref=AAAAAA.
insert into season_recap_shares (id, token, plan_id, coach_id, is_active)
values (
  '00000000-0000-4000-a000-000000000091',
  'test-season-recap-token-e2e-001',
  '00000000-0000-4000-a000-000000000090',
  '00000000-0000-4000-a000-000000000001',
  true
)
on conflict (token) do nothing;

-- ── coach_card_shares: the public coach-profile token (ticket 0026) ─────────
-- token 'test-coach-card-token-e2e-001' matches COACH_CARD_TOKEN in
-- coach-card-flow.spec.ts. is_active=true so the public /api/coach-card/<token>
-- route returns 200. The card is scoped to the COACH (not a plan): the route
-- derives the sports ('Basketball') + age group ('11-13') from the coach's
-- seeded basketball team, counts the seeded practice sessions + observed players,
-- and resolves the coach's referral_code 'AAAAAA' (set on the coaches row), which
-- the page CTA deep-links to as /signup?ref=AAAAAA. No minor data is exposed —
-- only aggregate integers + coach-level fields.
insert into coach_card_shares (id, token, coach_id, is_active)
values (
  '00000000-0000-4000-a000-0000000000a1',
  'test-coach-card-token-e2e-001',
  '00000000-0000-4000-a000-000000000001',
  true
)
on conflict (token) do nothing;

-- ── a game session (ticket 0027) ────────────────────────────────────────────
-- GameRecapCard renders only for game/scrimmage/tournament sessions, and the
-- authenticated in-app share-control spec navigates to this session id. The
-- game_recap plan below is scoped to it so the card auto-loads the saved recap
-- (and thus the "Share this recap" control) without a live AI call.
insert into sessions (id, team_id, coach_id, type, date, location, opponent, result, notes)
values (
  '00000000-0000-4000-a000-000000000042',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'game', current_date - 1, 'Away Gym', 'Eagles', 'W 42-30', 'E2E seed game session'
)
on conflict (id) do nothing;

-- ── plans: a game_recap artifact for the team (ticket 0027) ─────────────────
-- The public recap surface renders ONLY the team-level fields named in
-- PUBLIC_RECAP_FIELDS (title / result_headline / intro / key_moments /
-- team_performance / coach_message / looking_ahead). content_structured
-- deliberately INCLUDES player_highlights (with per-minor names + stat lines) so
-- the COPPA strip is exercised end-to-end: the public /api/recap-card/<token>
-- route must NOT expose those. type='game_recap' is allowed by plans_type_check
-- (migration 034). The result_headline / coach_message below are asserted by
-- recap-card-flow.spec.ts; the player_highlights names/stats are asserted ABSENT.
insert into plans (id, team_id, coach_id, player_id, session_id, type, title, content, content_structured)
values (
  '00000000-0000-4000-a000-000000000092',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  null,
  '00000000-0000-4000-a000-000000000042',
  'game_recap',
  'Game Recap vs Eagles — May 24',
  '{}',
  '{
    "title": "Game Recap vs Eagles — May 24",
    "result_headline": "Victory Over the Eagles",
    "intro": "The team controlled the game from the opening tip and never let the Eagles back in, closing it out with poise down the stretch.",
    "key_moments": [
      {"headline": "Defensive stand", "description": "A late stop sealed the win."},
      {"headline": "Fast-break flurry", "description": "Three straight transition buckets."}
    ],
    "player_highlights": [
      {"player_name": "Alice Walker", "highlight": "Locked down the other team best scorer.", "stat_line": "12 pts, 6 reb"},
      {"player_name": "Bob Carter", "highlight": "Ran the offense with poise.", "stat_line": "8 ast"}
    ],
    "team_performance": {
      "offensive_note": "Moved the ball well and found the open shooter.",
      "defensive_note": "Switched everything and contested every shot.",
      "effort_note": "Sprinted back on defense all game."
    },
    "coach_message": "Proud of how this team plays for each other. That was a team win.",
    "looking_ahead": "We carry this momentum into next week."
  }'::jsonb
)
on conflict (id) do nothing;

-- ── game_recap_shares: the public referral token resolving to that plan (0027) ──
-- token 'test-game-recap-token-e2e-001' matches GAME_RECAP_TOKEN in
-- recap-card-flow.spec.ts. is_active=true so the public /api/recap-card/<token>
-- route returns 200. The seeded coach's referral_code 'AAAAAA' (set on the
-- coaches row) is what the page CTA deep-links to as /signup?ref=AAAAAA.
insert into game_recap_shares (id, token, plan_id, coach_id, is_active)
values (
  '00000000-0000-4000-a000-000000000093',
  'test-game-recap-token-e2e-001',
  '00000000-0000-4000-a000-000000000092',
  '00000000-0000-4000-a000-000000000001',
  true
)
on conflict (token) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Ticket 0028 — program pulse fixture (Organization-tier org)
-- ════════════════════════════════════════════════════════════════════════
-- The program-pulse card is Organization-tier + admin only. The default E2E org
-- (org-e2e-test-001) is intentionally pro_coach (other specs depend on that), so
-- this block seeds a SEPARATE Organization-tier program with an admin director,
-- a couple of coaches (one quiet), two teams, and a week of sessions/observations
-- so the server-backed POST /api/ai/program-pulse resolves a real pulse
-- deterministically. The program-pulse e2e mocks /api/me + the endpoint (the
-- authed path skips in CI without E2E creds); this seed backs the un-mocked
-- endpoint for whenever creds point at this org's admin.

-- Auth users for the director + both coaches. coaches.id references
-- auth.users(id), so each coach's auth user must exist first (FK
-- coaches_id_fkey). No passwords are set: no CI spec authenticates as these.
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-a000-000000000101',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'director-e2e@test.com', now(), now(), now()),
  ('00000000-0000-4000-a000-000000000102',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'coach-active-e2e@test.com', now(), now(), now()),
  ('00000000-0000-4000-a000-000000000103',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'coach-quiet-e2e@test.com', now(), now(), now())
on conflict (id) do nothing;

-- Organization-tier program.
insert into organizations (id, name, slug, tier)
values ('00000000-0000-4000-a000-000000000110', 'E2E Program Org', 'e2e-program-org', 'organization')
on conflict (id) do nothing;

-- Director (admin) + two coaches. coach-quiet logs NO activity this week.
insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values
  ('00000000-0000-4000-a000-000000000101',
   '00000000-0000-4000-a000-000000000110',
   'E2E Program Director', 'director-e2e@test.com', 'admin', true),
  ('00000000-0000-4000-a000-000000000102',
   '00000000-0000-4000-a000-000000000110',
   'Coach Active', 'coach-active-e2e@test.com', 'coach', true),
  ('00000000-0000-4000-a000-000000000103',
   '00000000-0000-4000-a000-000000000110',
   'Coach Quiet', 'coach-quiet-e2e@test.com', 'coach', true)
on conflict (id) do nothing;

-- Two teams in the program (asserted by name as 'Program U10s' / 'Program U12s').
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000120',
  '00000000-0000-4000-a000-000000000110',
  (select id from sports where slug = 'basketball' limit 1),
  'Program U10s', '9-10', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000121',
  '00000000-0000-4000-a000-000000000110',
  (select id from sports where slug = 'basketball' limit 1),
  'Program U12s', '11-13', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;

-- A week of sessions: the director + the active coach logged practices; the quiet
-- coach logged nothing → active_coaches = 2 of 3 in the resolved pulse.
insert into sessions (id, team_id, coach_id, type, date, location, notes)
values
  ('00000000-0000-4000-a000-000000000130',
   '00000000-0000-4000-a000-000000000120',
   '00000000-0000-4000-a000-000000000101',
   'practice', current_date - 4, 'Program Gym', 'Program U10s practice'),
  ('00000000-0000-4000-a000-000000000131',
   '00000000-0000-4000-a000-000000000120',
   '00000000-0000-4000-a000-000000000101',
   'practice', current_date - 2, 'Program Gym', 'Program U10s practice'),
  ('00000000-0000-4000-a000-000000000132',
   '00000000-0000-4000-a000-000000000121',
   '00000000-0000-4000-a000-000000000102',
   'practice', current_date - 1, 'Program Gym', 'Program U12s practice')
on conflict (id) do nothing;

-- A week of team-level observations (NO player_id — the pulse is coach/team
-- aggregate only and never reads player rows). U12s carries the needs-work
-- cluster so it becomes the team-to-watch.
insert into observations (id, player_id, team_id, coach_id, session_id, category, sentiment, text, source, ai_parsed)
values
  ('00000000-0000-4000-a000-000000000140',
   null, '00000000-0000-4000-a000-000000000120',
   '00000000-0000-4000-a000-000000000101',
   '00000000-0000-4000-a000-000000000130',
   'Defense', 'positive', 'Strong defensive rotations from the group', 'typed', false),
  ('00000000-0000-4000-a000-000000000141',
   null, '00000000-0000-4000-a000-000000000120',
   '00000000-0000-4000-a000-000000000101',
   '00000000-0000-4000-a000-000000000131',
   'Effort', 'positive', 'Whole team hustled in transition', 'typed', false),
  ('00000000-0000-4000-a000-000000000142',
   null, '00000000-0000-4000-a000-000000000121',
   '00000000-0000-4000-a000-000000000102',
   '00000000-0000-4000-a000-000000000132',
   'Offense', 'needs-work', 'Spacing broke down in the half court', 'typed', false),
  ('00000000-0000-4000-a000-000000000143',
   null, '00000000-0000-4000-a000-000000000121',
   '00000000-0000-4000-a000-000000000102',
   '00000000-0000-4000-a000-000000000132',
   'IQ', 'positive', 'Read the press well as a unit', 'typed', false)
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Ticket 0031 — program weekly-focus fixture (org-scoped config override)
-- ════════════════════════════════════════════════════════════════════════
-- The program weekly focus reuses the EXISTING System→Org→Team config cascade:
-- one config_overrides row at ORG scope (domain `program` / key `focus`, value =
-- the free-text string in the jsonb `value` column). This seeds the focus for the
-- Organization-tier program org (...110) so the un-mocked GET /api/org/weekly-focus
-- resolves the same string the program-focus e2e mock asserts whenever creds point
-- at that org's admin. value is stored as a JSON string (jsonb column), which
-- resolveConfig returns verbatim. unique (org_id, team_id, domain, key); team_id
-- is null for the org-scope override. No per-minor data — org-direction config only.
insert into config_overrides (id, org_id, team_id, scope, domain, key, value, changed_by)
values (
  '00000000-0000-4000-a000-000000000150',
  '00000000-0000-4000-a000-000000000110',
  null,
  'org',
  'program',
  'focus',
  '"spacing & off-ball movement"'::jsonb,
  '00000000-0000-4000-a000-000000000101'
)
on conflict (org_id, team_id, domain, key) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Ticket 0033 — public program directory + per-team claim fixture
-- ════════════════════════════════════════════════════════════════════════
-- The /programs directory and /org/<slug> pages are SERVER components: their
-- data comes from the seed, not page.route() mocks (LESSONS.md 2026-05-21). This
-- block seeds:
--   • a DISCOVERABLE org ('Discoverable Rec League', slug 'discoverable-rec') with
--     settings.discoverable = true → it MUST appear at /programs and its team must
--     show a "Coach this team — free" CTA on /org/discoverable-rec.
--   • The existing default E2E org ('E2E Test Org', slug 'e2e-test-org') has NO
--     discoverable flag, so the directory spec asserts it is ABSENT (the opt-in
--     gate working). No new "hidden" org is needed — that org is the negative case.
--
-- The discoverable flag is a jsonb boolean: `settings = '{"discoverable": true}'`
-- is valid JSON under psql ON_ERROR_STOP=1 (LESSONS.md 2026-05-25 re: jsonb
-- literals). The org's coach needs a matching auth.users row FIRST (coaches.id
-- references auth.users(id) — LESSONS.md 2026-05-25), seeded in the same block.

-- Auth user for the discoverable org's director (FK coaches_id_fkey). No password.
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-000000000201',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'discoverable-dir-e2e@test.com', now(), now(), now()
)
on conflict (id) do nothing;

-- The discoverable org: settings.discoverable = true opts it into the directory.
insert into organizations (id, name, slug, tier, settings)
values (
  '00000000-0000-4000-a000-000000000210',
  'Discoverable Rec League', 'discoverable-rec', 'pro_coach',
  '{"discoverable": true}'::jsonb
)
on conflict (id) do nothing;

-- Branding (the org landing page reads org_branding).
insert into org_branding (org_id, primary_color, parent_portal_header_text)
values ('00000000-0000-4000-a000-000000000210', '#F97316', 'Go Hawks')
on conflict (org_id) do nothing;

-- The director coach for the discoverable org.
insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values (
  '00000000-0000-4000-a000-000000000201',
  '00000000-0000-4000-a000-000000000210',
  'Discoverable Director', 'discoverable-dir-e2e@test.com', 'admin', true
)
on conflict (id) do nothing;

-- One active team in the discoverable org. Its id is the claim key the per-team
-- CTA deep-links to as /signup?org=discoverable-rec&team=<this id>. The CTA spec
-- asserts the href contains exactly that.
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000220',
  '00000000-0000-4000-a000-000000000210',
  (select id from sports where slug = 'basketball' limit 1),
  'U10 Hawks', '9-10', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;

-- ── archive + delete a team (ticket 0053) ──────────────────────────────────
-- A disposable second team in the SAME org as the default E2E coach, so the
-- archive→hard-delete flow can act on it WITHOUT touching the rows the
-- existing specs depend on (...020 / ...021 / ...022). Live (archived_at
-- null) on seed; the e2e spec archives it then deletes it.
--
-- The spec test.skip()s without E2E_TEST_EMAIL/E2E_TEST_PASSWORD (no CI run
-- has those creds), so the always-green proof here is the vitest matrix.
-- This row exists so a local authenticated run can exercise the page.
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active, archived_at)
select
  '00000000-0000-4000-a000-0000000000E1',
  '00000000-0000-4000-a000-000000000010',
  (select id from sports where slug = 'basketball' limit 1),
  'E2E Disposable Team', '11-13', 'Spring 2026', 10, 1, true, null
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-0000000000E1',
  '00000000-0000-4000-a000-000000000001',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0049 — publish + clone a practice plan
-- ────────────────────────────────────────────────────────────────────────
-- A type='practice' plan with three drills + a practice_plan_shares row so the
-- public /plan/<token> page renders the drill list end-to-end. content_structured
-- is a jsonb literal (LESSONS#0031) — every string in the JSON is quoted as a
-- JSON string. The drill list keys (name / duration_minutes / focus) match the
-- public page's expected shape. NO player data — practice plans are team-level
-- by construction, which is the COPPA contract.
insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured)
values (
  '00000000-0000-4000-a000-0000000000c0',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  null,
  'practice',
  'Tuesday Practice — Closeouts + Scrimmage',
  '{}',
  '{
    "drills": [
      {"name": "Defensive Slides", "duration_minutes": 10, "focus": "Defense"},
      {"name": "Closeout Drill",   "duration_minutes": 12, "focus": "Defense"},
      {"name": "Scrimmage",        "duration_minutes": 15, "focus": "Effort"}
    ],
    "total_minutes": 37
  }'::jsonb
)
on conflict (id) do nothing;

-- The public share token for the practice plan above. Matches PRACTICE_PLAN_TOKEN
-- in tests/e2e/practice-plan-share-and-clone-flow.spec.ts. is_active=true so the
-- public /api/practice-plan-shares/<token> route returns 200 + the four-key
-- payload. note rides through verbatim to the public page.
insert into practice_plan_shares (id, token, plan_id, coach_id, note, is_active)
values (
  '00000000-0000-4000-a000-0000000000c1',
  'test-practice-plan-token-e2e-001',
  '00000000-0000-4000-a000-0000000000c0',
  '00000000-0000-4000-a000-000000000001',
  'Worked great with our U12s on Tuesday.',
  true
)
on conflict (token) do nothing;

-- ── delete-a-practice (ticket 0051) ─────────────────────────────────────────
-- TWO disposable practice sessions on the E2E Test Team that exist ONLY for
-- delete-practice-flow.spec.ts to delete. We don't reuse session ...040 because
-- other specs (share-flow / weekly-digest / capture-arc-continuity) read its
-- observations; deleting it cross-contaminates the suite.
--   - session ...0F0: an EMPTY practice → exercises preserve-mode (no notes).
--   - session ...0F1: a populated practice with 2 observations attached →
--     exercises cascade-mode confirm flow without touching ...040's rows.
insert into sessions (id, team_id, coach_id, type, date, location, notes)
values
  ('00000000-0000-4000-a000-0000000000F0',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   'practice', current_date - 1, 'Disposable Gym',
   'E2E seed: empty session for delete-a-practice (ticket 0051)'),
  ('00000000-0000-4000-a000-0000000000F1',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   'practice', current_date - 2, 'Disposable Gym',
   'E2E seed: populated session for delete-a-practice cascade-mode (ticket 0051)')
on conflict (id) do nothing;

insert into observations (id, player_id, team_id, coach_id, session_id, category, sentiment, text, source, ai_parsed, is_highlighted)
values
  ('00000000-0000-4000-a000-0000000000F2',
   '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-0000000000F1',
   'Effort', 'positive',
   'E2E seed: disposable observation for delete cascade (ticket 0051)',
   'typed', false, false),
  ('00000000-0000-4000-a000-0000000000F3',
   '00000000-0000-4000-a000-000000000031',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-0000000000F1',
   'Effort', 'positive',
   'E2E seed: second disposable observation for delete cascade (ticket 0051)',
   'typed', false, false)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0055 — league-internal practice-plan discovery
-- ────────────────────────────────────────────────────────────────────────
-- Adds a SECOND coach (Coach James Stark) in the SAME org as the default
-- E2E coach (...010), with their OWN basketball team and a published
-- practice-plan share. The /plans page rendered for the default E2E coach
-- must surface this peer coach's plan in the new <LeaguePlansSection /> at
-- the top (eligible:true, plans:[1]).
--
-- LESSONS#84 — seed BOTH auth.users AND coaches with matching UUIDs (the
-- coaches.id FK references auth.users(id) on delete cascade).
-- LESSONS#101 — pick non-colliding UUID ranges. The 0...301 range is
-- unused above.
-- COPPA: NO new players or observations — the peer team's plan is
-- team-level (practice plan, no player_id). The league-discovery surface
-- never reads players / observations / parent_shares.

-- Auth user for the peer coach (FK coaches_id_fkey).
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-000000000301',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'james-league-e2e@test.com',
  now(), now(), now()
)
on conflict (id) do nothing;

-- The peer coach in the SAME org as the E2E coach (...010). full_name
-- 'James Stark' so the route's first-name extraction returns 'James'.
insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values (
  '00000000-0000-4000-a000-000000000301',
  '00000000-0000-4000-a000-000000000010',
  'James Stark', 'james-league-e2e@test.com', 'coach', true
)
on conflict (id) do nothing;

-- The peer coach's team — basketball (same sport as the E2E coach's
-- ...020 team), age_group '11-13' (asserted by the e2e spec's row line).
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000302',
  '00000000-0000-4000-a000-000000000010',
  (select id from sports where slug = 'basketball' limit 1),
  'E2E League Peer Team', '11-13', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-000000000302',
  '00000000-0000-4000-a000-000000000301',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- The peer coach's published practice plan. title 'Tuesday Closeouts
-- Series' is asserted by tests/e2e/league-plans-discovery.spec.ts. No
-- player_id — practice plans are team-level.
insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured)
values (
  '00000000-0000-4000-a000-000000000303',
  '00000000-0000-4000-a000-000000000302',
  '00000000-0000-4000-a000-000000000301',
  null,
  'practice',
  'Tuesday Closeouts Series',
  '{}',
  '{
    "drills": [
      {"name": "Closeout Drill", "duration_minutes": 12, "focus": "Defense"},
      {"name": "Scrimmage",      "duration_minutes": 18, "focus": "Effort"}
    ],
    "total_minutes": 30
  }'::jsonb
)
on conflict (id) do nothing;

-- The active practice_plan_shares row pointing at the peer's plan. The
-- token is unique to this ticket so it never collides with 0049's
-- existing token.
insert into practice_plan_shares (id, token, plan_id, coach_id, note, is_active)
values (
  '00000000-0000-4000-a000-000000000304',
  'test-league-plan-token-e2e-001',
  '00000000-0000-4000-a000-000000000303',
  '00000000-0000-4000-a000-000000000301',
  'Worked well on Tuesday with our U13s.',
  true
)
on conflict (token) do nothing;

-- ── ticket 0056 — parent_reaction the Thank-Sarah e2e flow consumes ─────────
-- A single reaction tied to Alice (...030, the E2E player) on the E2E coach's
-- team. parent_name='Sarah' makes the rendered button read "Thank Sarah". The
-- reaction's id is hardcoded so the openReply deep-link assertion in
-- tests/e2e/thank-parent-flow.spec.ts can target this row directly.
--
-- Per LESSONS#0084: the player + the coach + the team already exist (Alice +
-- the E2E coach + E2E Test Team are seeded above). Per LESSONS#0101: the new
-- UUID family (0aa1) is non-colliding with any existing parent_reactions seed
-- (there is none — this is the FIRST one added). The 0023/0041 fixtures only
-- seed parent_reactions in vitest mocks, not in this SQL file.
--
-- COPPA: NO new descriptive minor data added; reaction.message is the
-- parent's freely-typed note (treated as parent content). The two new columns
-- from migration 053 (coach_reply_at / coach_reply_id) default to NULL, so
-- the row starts unreplied — the spec's first test will flip them.
insert into parent_reactions (id, share_token, player_id, team_id, coach_id, reaction, message, parent_name, is_read)
values (
  '00000000-0000-4000-a000-000000000aa1',
  'test-share-token-e2e-001',
  '00000000-0000-4000-a000-000000000030',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  '❤️',
  'thank you for sticking with him on his shooting',
  'Sarah',
  false
)
on conflict (id) do nothing;

-- Alice needs a parent_email so the send-reply route can server-resolve the
-- recipient from players.parent_contact (LESSONS#0039 — never trust a client-
-- supplied recipient). This is an UPDATE because Alice's row is already
-- inserted above and her ON CONFLICT (id) DO NOTHING would otherwise leave
-- parent_email NULL forever.
update players
  set parent_email = 'sarah@walker-family.test'
  where id = '00000000-0000-4000-a000-000000000030'
    and (parent_email is null or parent_email = '');

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0057 — weekly-pulse share card (one tap → public /week/<token>)
-- ────────────────────────────────────────────────────────────────────────
-- ONE active weekly_pulse_shares row tied to the existing E2E coach + E2E
-- team, plus a small observations seed inside the row's ISO week so the
-- public GET route's category aggregation has data. UUIDs in the 0...00a2/
-- 0...00a3 family (the parent_reactions seed above used 0...00a1; verified
-- non-colliding per LESSONS#0101). iso_week is a calendar-frozen value
-- ('2026-W22' = Mon May 25 → Sun May 31 UTC) so the spec assertions are
-- deterministic regardless of when CI runs.
--
-- COPPA: NO new player rows; the existing Alice (...030) carries the seeded
-- observations. The public /api/weekly-pulse/<token> route's response is
-- key-set-allow-listed (asserted in tests/api/weekly-pulse-token-get.test.ts)
-- so even with `player_id` set on these obs rows, no minor name / observation
-- text / parent contact crosses to the public card.
insert into weekly_pulse_shares (id, token, coach_id, team_id, iso_week, caption, is_active)
values (
  '00000000-0000-4000-a000-0000000000a2',
  'test-weekly-pulse-token-e2e-001',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000020',
  '2026-W22',
  'anyone want to swap closeout drills?',
  true
)
on conflict (token) do nothing;

-- Two observations stamped INSIDE the seed iso_week range so the public GET
-- route's topCategories aggregation returns a deterministic ordering. The
-- text/player_id are populated (just like the existing 0050/0051 obs) so the
-- response allow-list is the only thing preventing them from crossing to the
-- public card — the assertion in the spec confirms they DO NOT cross.
insert into observations (id, player_id, team_id, coach_id, session_id, category, sentiment, text, source, ai_parsed, is_highlighted, created_at)
values
  ('00000000-0000-4000-a000-0000000000a3',
   '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040',
   'Defense', 'positive',
   'E2E seed: 0057 obs inside iso_week 2026-W22',
   'typed', false, false,
   '2026-05-27T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000a4',
   '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040',
   'Effort', 'positive',
   'E2E seed: 0057 obs inside iso_week 2026-W22',
   'typed', false, false,
   '2026-05-28T14:00:00Z')
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0058 — Sunday-evening plan-finish prompt
-- ────────────────────────────────────────────────────────────────────────
-- ONE draft `plans` row (type='practice' with `content_structured` missing
-- scrimmage + cooldown — `isPlanDraft` returns true on this shape) tied to
-- the existing E2E coach + E2E Test Team, plus ONE upcoming session in the
-- next 7 days on the same team so the cron's eligibility check passes.
--
-- LESSONS#0101 — pick a non-colliding UUID range. The 0...00b0/b1 family is
-- unused above (existing seeds occupy 0...00a*/c*/e* + 0...0F*). Verified
-- via grep against the rest of this file before commit.
-- LESSONS#0085 — content_structured is a jsonb literal; every JSON string
-- key/value is double-quoted inside a single-quoted SQL string. created_at
-- is set explicitly so the draft is < 7 days old at cron time and falls
-- into the route's `gte('created_at', now - 7d)` window deterministically.
-- LESSONS#0086 — no special chars in this block that the agent shell would
-- mishandle on commit (we commit via -F /tmp/msg.txt anyway).
-- COPPA: no player_id (practice plans are team-level), no player names in
-- content_structured. The Sunday email surface reads only title + drills.
insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured, created_at)
values (
  '00000000-0000-4000-a000-0000000000b0',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  null,
  'practice',
  'Closeout & spacing — Tuesday',
  '{}',
  '{
    "warmup": {"name": "Defensive Slides", "duration_minutes": 10, "description": "lateral slides"},
    "drills": [
      {"name": "Closeout Drill", "duration_minutes": 12, "description": "closeouts under control"}
    ]
  }'::jsonb,
  now() - interval '2 days'
)
on conflict (id) do nothing;

-- Upcoming session in the next 7 days on the same team. current_date + 2
-- keeps it inside the route's [today, today+7] window every time CI runs.
insert into sessions (id, team_id, coach_id, type, date, location, notes)
values (
  '00000000-0000-4000-a000-0000000000b1',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'practice', current_date + 2, 'Main Gym', 'E2E seed upcoming session for ticket 0058'
)
on conflict (id) do nothing;

-- ── ticket 0059: cross-coach player handoff card seed ──────────────────────
-- One additional coach in the SAME org (the RECEIVING coach), plus a TARGET
-- team for her with a player whose first name matches Alice (the SOURCE
-- coach's player in the existing seed). The migration's UNIQUE on
-- (source_coach_id, source_player_id, source_team_id) means the handoff row
-- only inserts ONCE per re-seed (on conflict → do nothing).
--
-- UUID family: '00000000-0000-4000-a000-000000000002' for the second coach
-- (LESSONS#0028 says EVERY new coach needs a matching auth.users row first;
-- LESSONS#0043 says verify no collision — none in this range). Player /
-- team rows in the 0...c1 / 0...c2 / 0...c3 / 0...c4 range (LESSONS#0101).

-- Second coach's auth.users row (FK requirement, LESSONS#0028).
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'e2e-receiver@test.com',
  now(), now(), now()
)
on conflict (id) do nothing;

-- The receiving coach in the SAME org as the source coach.
insert into coaches (id, org_id, full_name, email, role, onboarding_complete, preferences)
values (
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000010',
  'Receiver Coach', 'e2e-receiver@test.com', 'admin', true,
  '{}'::jsonb
)
on conflict (id) do nothing;

-- The TARGET team (the next-season team in the same program).
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-0000000000c2',
  '00000000-0000-4000-a000-000000000010',
  (select id from sports where slug = 'basketball' limit 1),
  'Target Team 0059', '12-13', 'Fall 2026', 10, 1, true
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-0000000000c2',
  '00000000-0000-4000-a000-000000000002',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- The receiving coach's just-imported player whose first name matches Alice
-- (the existing SOURCE coach's seeded player at ...030). age_group is
-- '12-13', within ±1 of Alice's source age_group '11-13' so the matcher
-- accepts it. Jersey number omitted on this side so the jersey check
-- defaults to a non-blocking skip.
insert into players (id, team_id, name, nickname, name_variants, age_group, position, is_active)
values (
  '00000000-0000-4000-a000-0000000000c3',
  '00000000-0000-4000-a000-0000000000c2',
  'Alice Henderson', null, null, '12-13', 'Guard', true
)
on conflict (id) do nothing;

-- A handoff card already minted by the SOURCE coach (coach ...001) for
-- the source player Alice Walker (...030), in the same org (...010). This
-- gives the e2e a deterministic candidate the receiver lookup will find
-- and surface as a "1 handoff note" badge on the target roster row.
insert into player_handoffs
  (id, source_coach_id, source_player_id, source_team_id, org_id, season_label,
   card_body, ai_provider, is_archived)
values (
  '00000000-0000-4000-a000-0000000000c4',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000030',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000010',
  'Spring 2026',
  'Alice responds well to short specific cues during shooting drills. One drill that landed for me: stationary form-shoot. She is still working on left-hand finishing.',
  'anthropic',
  false
)
on conflict (source_coach_id, source_player_id, source_team_id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0060 — parent-side sibling-coach invite candidate seed
-- ────────────────────────────────────────────────────────────────────────
-- The candidate-lookup route at /api/share/[token]/sibling-invite-candidate
-- walks the inviting parent's `players.parent_email` to find a SECOND
-- active `players` row on a DIFFERENT team. To exercise the happy path
-- against a real seeded DB we need:
--
--   1) ONE additional `auth.users` row for the OTHER coach (per
--      LESSONS#0084 — coaches.id references auth.users(id), so the
--      auth row MUST be inserted before the coaches row).
--   2) ONE `coaches` row for the OTHER coach. `onboarding_complete = false`
--      is the invite-target signal (LESSONS#0096 reconciliation — the
--      ticket prose said "not on SportsIQ", which is structurally
--      impossible since every team_coaches row FK-references a coaches
--      row; `onboarding_complete = false` IS the schema's "not yet
--      onboarded" boolean).
--   3) ONE `teams` row for the OTHER team, owned by the OTHER coach via
--      `team_coaches` (LESSONS#0057 — teams.coach_id does not exist).
--   4) ONE `players` row on the OTHER team with the SAME parent_email
--      as the existing E2E player (sarah@walker-family.test).
--
-- UUIDs in the 0...d0+ range — verified non-colliding with the existing
-- 0..00cN family used by ticket 0059 (LESSONS#0101).

insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-0000000000d0',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'riley@hornets-e2e.test',
  now(), now(), now()
)
on conflict (id) do nothing;

insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values (
  '00000000-0000-4000-a000-0000000000d0',
  '00000000-0000-4000-a000-000000000010',
  'Coach Riley', 'riley@hornets-e2e.test', 'coach', false
)
on conflict (id) do nothing;

insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-0000000000d1',
  '00000000-0000-4000-a000-000000000010',
  (select id from sports where slug = 'basketball' limit 1),
  'E2E Sibling Hornets', '9-10', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-0000000000d1',
  '00000000-0000-4000-a000-0000000000d0',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- The SIBLING player — same parent_email as Alice (the existing E2E
-- player at ...030) so the candidate-lookup finds her by walking the
-- parent_email edge. Parent-typed name "Sofia Walker" — the route strips
-- to first space-delimited token "Sofia" before returning it (COPPA).
insert into players (id, team_id, name, nickname, name_variants, age_group, position,
                     parent_name, parent_email, is_active)
values (
  '00000000-0000-4000-a000-0000000000d2',
  '00000000-0000-4000-a000-0000000000d1',
  'Sofia Walker', null, null, '9-10', 'Guard',
  'Walker Family', 'sarah@walker-family.test', true
)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0061 — player-development-trajectory card
-- ────────────────────────────────────────────────────────────────────────
-- Eleven additional observations on the existing E2E player (Alice ...030)
-- and ONE pre-warmed `player_trajectories` cache row so the e2e exercises
-- the cache-hit path WITHOUT a live `callAI` against a real provider. UUIDs
-- in the 0...00f0..0...00fb range (the 0...00e* family was used by the cron
-- ticket, 0...00d* by 0059; verified non-colliding against the rest of this
-- file per LESSONS#0101 / #0043 — a colliding id would silently no-op under
-- `on conflict (id) do nothing`).
--
-- COPPA posture: the cache row stores the AI-derived started/now sentences;
-- the observations carry the player_id for the route's count + cache lookup
-- and never cross to a public surface (the JSON route is authed, and the
-- response allow-list is asserted in the API vitest).
-- LESSONS#0084: no new auth.users rows — the E2E coach already exists.
-- LESSONS#0085: jsonb columns are quoted as JSON strings inside SQL strings
-- via `'..."text"...'::jsonb` so the seed parses under psql ON_ERROR_STOP=1.

insert into observations (id, player_id, team_id, coach_id, session_id, category, sentiment, text, source, ai_parsed, is_highlighted, created_at)
values
  ('00000000-0000-4000-a000-0000000000f0', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Defense', 'needs-work',
   '0061 seed: hesitated on closeouts', 'typed', false, false, '2026-03-01T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f1', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Defense', 'needs-work',
   '0061 seed: lost her player on the second pass', 'typed', false, false, '2026-03-08T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f2', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'IQ', 'positive',
   '0061 seed: talked teammates through a closeout', 'typed', false, false, '2026-03-15T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f3', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Defense', 'positive',
   '0061 seed: stayed forward on a closeout', 'typed', false, false, '2026-03-22T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f4', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Offense', 'positive',
   '0061 seed: started using her left hand on the drive', 'typed', false, false, '2026-04-05T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f5', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Effort', 'positive',
   '0061 seed: held a defensive stance through three reps', 'typed', false, false, '2026-04-12T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f6', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Defense', 'positive',
   '0061 seed: recovered to the next shooter', 'typed', false, false, '2026-04-19T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f7', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Offense', 'positive',
   '0061 seed: cleared the help defender on the drive', 'typed', false, false, '2026-05-03T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f8', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Defense', 'positive',
   '0061 seed: closed out and recovered cleanly', 'typed', false, false, '2026-05-10T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000f9', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Defense', 'positive',
   '0061 seed: held help-side rotation through two reps', 'typed', false, false, '2026-05-17T14:00:00Z'),
  ('00000000-0000-4000-a000-0000000000fa', '00000000-0000-4000-a000-000000000030',
   '00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040', 'Defense', 'positive',
   '0061 seed: closeouts staying under control', 'typed', false, false, '2026-05-20T14:00:00Z')
on conflict (id) do nothing;

-- The pre-warmed cache row at the bucket the route lands on for the seeded
-- observation count. Alice now has 2 (pre-existing) + 11 (just above) = 13
-- observations; bucket = floor(13/3)*3 = 12. The route's first authed read
-- for this (player, bucket) hits this cached row and returns it without a
-- callAI invocation — that is the e2e contract this row is here to prove.
-- The two anchor sentences are the canonical "started" / "now" the AC names;
-- the spec asserts them by exact substring.
insert into player_trajectories (id, player_id, observation_count_bucket, started, now, turning_points)
values (
  '00000000-0000-4000-a000-0000000000fb',
  '00000000-0000-4000-a000-000000000030',
  12,
  '{"headline": "Tentative on closeouts", "sentence": "Alice started the season hesitating on closeouts.", "observation_id": "00000000-0000-4000-a000-0000000000f0", "observed_at": "2026-03-01T14:00:00Z"}'::jsonb,
  '{"headline": "Closes out and recovers", "sentence": "Alice now closes out and recovers under control.", "observation_id": "00000000-0000-4000-a000-0000000000fa", "observed_at": "2026-05-20T14:00:00Z"}'::jsonb,
  '[{"observation_id": "00000000-0000-4000-a000-0000000000f3", "observed_at": "2026-03-22T14:00:00Z", "one_word_label": "forward"},
    {"observation_id": "00000000-0000-4000-a000-0000000000f7", "observed_at": "2026-05-03T14:00:00Z", "one_word_label": "drive"}]'::jsonb
)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0064 — single-drill publish-and-clone
-- ────────────────────────────────────────────────────────────────────────
-- The ticket adds:
--   • ONE deterministic drill row (with a known UUID — the migration-seeded
--     drills use gen_random_uuid() defaults, so we can't reference one
--     without inserting our own). This drill is what the seeded share row
--     resolves to on /drill/<token>.
--   • ONE drill_shares row owned by the existing E2E coach (...001) for
--     the seeded drill, with an active token + caption.
--   • ONE additional auth.users + coaches row for the CLONER coach (the
--     spec signs in as this second coach and taps Save). LESSONS#0084 —
--     coaches.id FK references auth.users(id); seed the auth user FIRST.
--   • UUIDs in the 0...010+ family. The existing 0...00d2/0...00f* /
--     0...0aa1 families are taken; 0...0110+ is unused above (verified
--     via grep before commit per LESSONS#0101 / #0043).
--
-- COPPA: the drill_shares table never references a player, parent, or
-- session. The cloner-coach row carries no player data of its own; the
-- only sharing primitive on this surface is COACH-TO-COACH.

-- One deterministic drill row. The migration's gen_random_uuid() defaults
-- mean the e2e spec cannot pin to a seed-migration drill; we insert our
-- own with a fixed UUID so the spec's URL resolves deterministically.
insert into drills (id, sport_id, name, description, category, age_groups,
                    duration_minutes, player_count_min, player_count_max,
                    equipment, teaching_cues, setup_instructions, source)
select
  '00000000-0000-4000-a000-000000000110',
  (select id from sports where slug = 'basketball' limit 1),
  '0064 E2E Closeout Drill',
  'Defender starts at the rim. Coach passes to a shooter on the perimeter. Defender sprints out and contests without fouling.',
  'Defense',
  '{"8-10","11-13"}',
  10, 2, 12,
  '{"basketballs","cones"}',
  '{"Stay low on the close-out","Chest to the ball-handler","Hands up at the end"}',
  'Players close out on the shooter from the elbow.
Focus on chest-to-the-ball-handler before the hands go up.',
  'seeded'
on conflict (id) do nothing;

-- The active share token. The spec navigates to /drill/<this token>.
insert into drill_shares (id, coach_id, drill_id, share_token, caption, is_active)
values (
  '00000000-0000-4000-a000-000000000111',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000110',
  'test-drill-share-token-e2e-001',
  'Finally got my U10 girls to finish their close-outs.',
  true
)
on conflict (id) do nothing;

-- The cloner coach (the spec signs in as this coach to tap Save). LESSONS
-- #0084 — auth.users row FIRST so the coaches FK resolves.
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-000000000112',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'cloner-0064-e2e@test.com',
  now(), now(), now()
)
on conflict (id) do nothing;

insert into coaches (id, org_id, full_name, email, role, onboarding_complete, preferences)
values (
  '00000000-0000-4000-a000-000000000112',
  '00000000-0000-4000-a000-000000000010',
  'James Stark Jr', 'cloner-0064-e2e@test.com', 'coach', true,
  '{}'::jsonb
)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0062 — mid-week silent-player nudge
-- ────────────────────────────────────────────────────────────────────────
-- Per the ticket's AC: re-stamp the EXISTING observations on Alice (the E2E
-- player on the main team ...020) so Alice's most-recent note is 10+ days
-- old at CI run time, AND ensure the coach still has at least ONE
-- observation in the last 7 days so the cron's "actively capturing" probe
-- passes. We do NOT add new players (LESSONS#0101 — schema wins; the AC
-- says re-stamp existing rows, do not widen the seed).
--
-- Alice's 0050/0051/0052 observations default to now() at seed time. Push
-- them to now() - 10 days so Alice is 10 days silent. Bob's most recent
-- observation is 0F3 (default now() — recent) which keeps him non-silent
-- AND counts as the coach's "in the last 7 days" activity.
update observations
  set created_at = now() - interval '10 days'
  where id in (
    '00000000-0000-4000-a000-000000000050',
    '00000000-0000-4000-a000-000000000051',
    '00000000-0000-4000-a000-000000000052'
  );

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0065 — coach invites their own program director from the
-- 0057 weekly-pulse share sheet
-- ────────────────────────────────────────────────────────────────────────
-- ONE pre-seeded `coach_director_contacts` row for the E2E coach so the
-- pre-fill GET returns a contact on the FIRST sheet open (the spec
-- asserts the masked email + the pre-filled name). The 0057 seed already
-- inserted ONE `weekly_pulse_shares` row owned by the E2E coach (token
-- `test-weekly-pulse-token-e2e-001`), which is the token the share sheet
-- threads into the create POST.
--
-- UUIDs in the 0...0160 family — unused above (the 0064 / 0058 ranges
-- end at 0...0150). Verified via grep before commit per LESSONS#0101.
-- LESSONS#0084 — no new auth.users row is needed for the director:
-- they do NOT have a coach row until they claim, so the FK posture is
-- COACH-only on coach_director_contacts.coach_id (the E2E coach
-- already exists at 0...001).
--
-- COPPA: this table NEVER references a player, parent, session,
-- observation, or any minor-side field. The director is an adult
-- contact volunteered by the coach.
insert into coach_director_contacts (
  id, coach_id, director_first_name, director_email,
  director_email_hash, last_invited_at, invite_count
)
values (
  '00000000-0000-4000-a000-000000000160',
  '00000000-0000-4000-a000-000000000001',
  'Mike',
  'mike+seed@example.test',
  -- sha256('mike+seed@example.test') hex (deterministic; the dedup
  -- query reads this hash, never the raw email — LESSONS#0023 family).
  '8420cc8e7e289eb98bd2c2db07ab1a45b1ec150245ca95058d6f0edf8fd16314',
  now() - interval '7 days',
  1
)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0066 — thin-week parent-report safety net
-- ────────────────────────────────────────────────────────────────────────
-- Seeds the conditions the route's thin-week detector needs to flip true
-- on Bob Carter (...031):
--   * artifactCount = 2 — there is exactly ONE prior parent_report row
--     for Bob (...170), so the route counts 1 prior + 1 new = 2 artifacts.
--   * newObservationCount = 3 — three observations on Bob created within
--     the last 7 days (...171/...172/...173).
--   * daysSinceLastReport = 8 — the prior parent_report is dated
--     now() - interval '8 days'.
--
-- The "previous commitments" the prompt builder will quote are derived
-- from the prior report's existing structure: skill_progress[].skill_name
-- carries the three coach-named focus areas ("finish the closeout",
-- "drive with the left hand", "communicate on switches") so no new
-- persisted shape / migration is required.
--
-- COPPA: the new rows reference only the existing seeded player + coach
-- + team + sport. No DOB, no medical notes, no parent email — the prior
-- report's content_structured is coach-authored narrative only.
--
-- UUIDs in the 0...0170+ family — verified unused above (the 0065
-- range stops at 0...0160).

insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured, created_at)
values (
  '00000000-0000-4000-a000-000000000170',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000031',
  'parent_report',
  'Parent Report - Bob Carter (Week 1)',
  '{}',
  '{
    "player_name": "Bob Carter",
    "greeting": "Bob had a strong first week.",
    "highlights": ["finish the closeout", "drive with the left hand", "communicate on switches"],
    "skill_progress": [
      {"skill_name": "finish the closeout", "level": "Practicing", "narrative": "Closeouts are coming along."},
      {"skill_name": "drive with the left hand", "level": "Practicing", "narrative": "Left hand getting there."},
      {"skill_name": "communicate on switches", "level": "Practicing", "narrative": "Calling switches in scrimmage."}
    ],
    "encouragement": "Keep it up!",
    "coach_note": "Working on closeouts, left hand, and switch communication."
  }'::jsonb,
  now() - interval '8 days'
)
on conflict (id) do nothing;

-- Three thin observations on Bob this week (under the 4-obs thin-week
-- threshold). All within the last 7 days so the route's
-- newObservationCount filter (created_at >= prior_report.created_at)
-- counts them.
insert into observations (id, player_id, team_id, coach_id, session_id, category, sentiment, text, source, ai_parsed, is_highlighted, created_at)
values
  ('00000000-0000-4000-a000-000000000171',
   '00000000-0000-4000-a000-000000000031',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040',
   'Defense', 'positive', 'Made one strong closeout in Saturday scrimmage', 'typed', false, false,
   now() - interval '2 days'),
  ('00000000-0000-4000-a000-000000000172',
   '00000000-0000-4000-a000-000000000031',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040',
   'Defense', 'positive', 'Called out a switch on the wing', 'typed', false, false,
   now() - interval '3 days'),
  ('00000000-0000-4000-a000-000000000173',
   '00000000-0000-4000-a000-000000000031',
   '00000000-0000-4000-a000-000000000020',
   '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000040',
   'Effort', 'positive', 'Stayed engaged in the short scrimmage', 'typed', false, false,
   now() - interval '4 days')
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0068 — season-opener parent intro card
-- ────────────────────────────────────────────────────────────────────────
-- ONE pre-minted season_opener_shares row owned by the E2E coach for the
-- existing E2E team. The token is deterministic ('test-season-opener-token-
-- e2e-001') so the unauthed Playwright spec can navigate to /opener/<token>
-- without minting a row at runtime. The public route resolves the row →
-- the team + sport + coach's first name + the focus line, and the page
-- renders the parent-facing single-screen card.
--
-- UUIDs in the 0...0180 family — verified unused above (the 0066 range
-- stops at 0...0173). LESSONS#0101 — pick a free UUID range before
-- seeding.
--
-- COPPA: this fixture seeds only the team-level focus line + the coach
-- attribution. No player, no observation text, no DOB / parent contact
-- rides on this row.
insert into season_opener_shares (
  id, team_id, coach_id, token, season_label, focus_line, created_at
)
values (
  '00000000-0000-4000-a000-000000000180',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'test-season-opener-token-e2e-001',
  'Spring 2026',
  'closeouts and good sportsmanship — we will have fun',
  now()
)
on conflict (token) do nothing;

-- ── ticket 0069 — game_decompressions seed ───────────────────────────────────
-- A fresh "today" game session (within the 24h decompression window) on the
-- existing E2E team + coach, plus a pre-minted game_decompressions row with a
-- pre-canned recommendation. The Playwright spec asserts that:
--   1) the decompression entry renders on this session detail page;
--   2) when the coach generates a new practice plan, the recommendation
--      surfaces as drill #1 + the banner reads the seeded `why`;
--   3) a second plan generation does NOT re-fire the same row.
--
-- COPPA: the seed mints ONLY a coach-authored transcript + a coach-authored
-- recommendation. NO player FK, NO parent contact, NO DOB. The transcript
-- mentions a first name ("Maya") — the route's positive prompt and the
-- defensive surname strip handle this; the seed proves the column allows it.
--
-- UUID range: `0000000000d0` (game session), `0000000000d1`
-- (decompression row). `0000000000c0`-`c1` are sub-handoff observer tokens,
-- `0000000000d2`+ remain free for sibling seeds. Confirmed via
-- `grep -nE "0000000000d[0-9a-f]" tests/e2e/fixtures/seed.sql` at pickup
-- (LESSONS#0101).
insert into sessions (id, team_id, coach_id, type, date, location, opponent, result, notes)
values (
  '00000000-0000-4000-a000-0000000000d0',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'game', current_date, 'Away Gym', 'Eagles', 'L 4-12',
  'E2E seed RECENT game (decompression window — ticket 0069)'
)
on conflict (id) do nothing;

insert into game_decompressions (
  id, session_id, coach_id, team_id, transcript, duration_seconds,
  recommended_drill_name, recommended_drill_setup, recommended_drill_why,
  consumed_at, consumed_plan_id, created_at
)
values (
  '00000000-0000-4000-a000-0000000000d1',
  '00000000-0000-4000-a000-0000000000d0',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000020',
  'We couldn''t get a single rebound today. They outran us on every transition. Need to work on rebounding and effort.',
  28,
  'Live-ball rebound 2-on-2',
  ARRAY['Pair up at the elbows; one shooter at the wing.','Box out on the shot; first to 5 boards wins the round.','Eight minutes. Switch partners every two.'],
  'Saturday said rebounding and effort. Starting here.',
  null,
  null,
  now()
)
on conflict (session_id, coach_id) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Ticket 0071 — emergent (bottom-up) focus fixture (Organization-tier org)
-- ════════════════════════════════════════════════════════════════════════
-- The emergent-focus card requires THREE distinct teams in the SAME org to
-- have shipped a recent practice plan whose `skills_targeted` array includes
-- the same skill. The existing Organization-tier program org (...110) was
-- seeded with TWO teams (Program U10s ...120, Program U12s ...121) for the
-- 0028 program-pulse fixture. This block extends it with:
--   * ONE more auth.users + coaches row (a third coach), per LESSONS#0084 —
--     coaches.id FK references auth.users(id), so the auth row must exist
--     first.
--   * ONE more teams row (Program U14s) for the third coach, linked via
--     team_coaches (LESSONS#0057 — head-coach ownership lives on
--     team_coaches, not teams.coach_id which does not exist).
--   * THREE plans rows — one per team — with `skills_targeted = '{closeouts}'`
--     and `created_at = now() - interval '2 days'` so the route's 14-day
--     window includes them all and the aggregation surfaces a single
--     converged focus on "closeouts" across all three teams.
--
-- UUID family `00000000-0000-4000-a000-000000000190+` — verified unused
-- above (the 0068 family stops at 0...0180; the 0069 family uses
-- 0...00d0/d1 which is in a DIFFERENT byte slot; no collision per
-- LESSONS#0101 / #0043).
--
-- COPPA: NO new players / observations / parent_* rows. The plans are
-- team-level (no player_id). The route's response carries only skill names
-- + team display names — never a player name.

insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-000000000190',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'coach-third-e2e@test.com', now(), now(), now()
)
on conflict (id) do nothing;

insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values (
  '00000000-0000-4000-a000-000000000190',
  '00000000-0000-4000-a000-000000000110',
  'Coach Third', 'coach-third-e2e@test.com', 'coach', true
)
on conflict (id) do nothing;

insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000191',
  '00000000-0000-4000-a000-000000000110',
  (select id from sports where slug = 'basketball' limit 1),
  'Program U14s', '14-16', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-000000000191',
  '00000000-0000-4000-a000-000000000190',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- The three converging practice plans — one per program team — all
-- targeting "closeouts" within the route's 14-day window. created_at is
-- explicit (now() - interval '2 days') so the seed re-applies idempotently
-- AND every CI run lands inside the window with no clock skew worry.
insert into plans (id, team_id, coach_id, player_id, type, title, content, skills_targeted, content_structured, created_at)
values
  ('00000000-0000-4000-a000-000000000192',
   '00000000-0000-4000-a000-000000000120',
   '00000000-0000-4000-a000-000000000101',
   null, 'practice', 'U10s closeouts session',
   '{}', '{closeouts}', '{"drills":[]}'::jsonb,
   now() - interval '2 days'),
  ('00000000-0000-4000-a000-000000000193',
   '00000000-0000-4000-a000-000000000121',
   '00000000-0000-4000-a000-000000000102',
   null, 'practice', 'U12s closeouts session',
   '{}', '{closeouts}', '{"drills":[]}'::jsonb,
   now() - interval '2 days'),
  ('00000000-0000-4000-a000-000000000194',
   '00000000-0000-4000-a000-000000000191',
   '00000000-0000-4000-a000-000000000190',
   null, 'practice', 'U14s closeouts session',
   '{}', '{closeouts}', '{"drills":[]}'::jsonb,
   now() - interval '2 days')
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Ticket 0072 — dormant-coach reactivation fixture
-- ════════════════════════════════════════════════════════════════════════
-- The reactivation card on the dormant coach's /home renders when a
-- returning parent — recognized by parent_email matching a prior player
-- on a DIFFERENT team — opens a parent portal whose team is NOT the
-- prior team. This block seeds:
--   * ONE more auth.users + coaches row — the SPRING dormant coach
--     ("Sarah Hawkes") whose last_active_at is 45 days ago. (LESSONS#0084
--     — auth.users row first; LESSONS#0096 — the freshness column is
--     `last_active_at`, populated here so isCoachDormant returns true.)
--   * ONE more teams row — the SPRING team Sarah ran ("Spring Hawks").
--   * ONE more team_coaches row marking Sarah head_coach of the spring
--     team (LESSONS#0057 — head-coach ownership lives on team_coaches).
--   * ONE more players row — Liam, the prior-spring-player carrying the
--     parent_email that ties the reactivation edge.
--   * ONE more players row on the EXISTING E2E fall team — a sibling
--     ("Maya") for the same parent_email. The existing parent_shares
--     token (`test-share-token-e2e-001`) already resolves to that
--     fall-team player_id (Alice), so to seed the reactivation we need
--     a SECOND parent_shares token resolving to a NEW fall-team player
--     whose parent_email matches Liam's. (We can't simply share Alice's
--     token — Alice's parent_name is hardcoded in many spec assertions.)
--   * ONE more parent_shares row tied to the new fall player whose
--     parent_email matches Liam's spring row — this is the token the
--     Playwright spec hits as "the parent has come back to a NEW team."
--
-- UUID family `00000000-0000-4000-a000-0000000000d2`+ — verified unused
-- via `grep -nE "0000000000d[0-9a-f]" tests/e2e/fixtures/seed.sql` at
-- pickup; the 0069 family uses d0/d1, so d2+ are free.
--
-- COPPA: parent_email is the load-bearing edge — set on TWO rows in the
-- seed (the spring prior-player and the fall current-player). The
-- production migration stores a SHA-256 hash, never the plaintext; the
-- seed inputs are plaintext only because the route reads parent_email
-- on the players rows (already in the schema, NOT a new collection).
-- NO new column on coaches / players / teams. NO new DOB, NO medical_notes.

insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-0000000000d2',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'coach-spring-dormant-e2e@test.com', now(), now(), now()
)
on conflict (id) do nothing;

insert into coaches (
  id, org_id, full_name, email, role, onboarding_complete, last_active_at
)
values (
  '00000000-0000-4000-a000-0000000000d2',
  '00000000-0000-4000-a000-000000000010',
  'Sarah Hawkes',
  'coach-spring-dormant-e2e@test.com',
  'coach', true,
  now() - interval '45 days'
)
on conflict (id) do nothing;

insert into teams (id, org_id, sport_id, name, age_group, season, is_active)
values (
  '00000000-0000-4000-a000-0000000000d3',
  '00000000-0000-4000-a000-000000000010',
  null,
  'Spring Hawks',
  '8-10',
  'Spring 2026', true
)
on conflict (id) do nothing;

insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-0000000000d3',
  '00000000-0000-4000-a000-0000000000d2',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- The SPRING prior-player ("Liam") with the parent_email edge.
insert into players (
  id, team_id, name, age_group, position, jersey_number,
  parent_name, parent_email, is_active
)
values (
  '00000000-0000-4000-a000-0000000000d4',
  '00000000-0000-4000-a000-0000000000d3',
  'Liam Reactive',
  '8-10', 'PG', 7,
  'Linda', 'returning-parent-e2e@test.com', true
)
on conflict (id) do nothing;

-- The FALL current-player ("Maya") on the existing E2E team, sharing
-- the same parent_email — the parent the Playwright spec impersonates.
insert into players (
  id, team_id, name, age_group, position, jersey_number,
  parent_name, parent_email, is_active
)
values (
  '00000000-0000-4000-a000-0000000000d5',
  '00000000-0000-4000-a000-000000000020',
  'Maya Reactive',
  '8-10', 'SF', 11,
  'Linda', 'returning-parent-e2e@test.com', true
)
on conflict (id) do nothing;

-- The parent_shares row whose token the spec opens. Resolves to Maya
-- on the fall E2E team. share_token = 'test-share-token-e2e-reactive'.
insert into parent_shares (
  id, player_id, team_id, coach_id, share_token,
  include_report_card, include_highlights, include_observations,
  is_active, expires_at
)
values (
  '00000000-0000-4000-a000-0000000000d6',
  '00000000-0000-4000-a000-0000000000d5',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'test-share-token-e2e-reactive',
  true, true, true, true,
  now() + interval '365 days'
)
on conflict (share_token) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Ticket 0073 — coach reputation on league discovery fixture
-- ════════════════════════════════════════════════════════════════════════
-- The reputation line on the 0055 league-discovery section, and the
-- milestone card on /home for the publishing coach. The seed extension:
--   * 12 plan-clone rows tied to the seeded 0055 published plan (...303),
--     spread across 4 distinct CLONING orgs (the load-bearing
--     distinctProgramCount=4 signal). Each clone is a `plans` row with
--     source_plan_id = the seeded published plan id (matching the 0049
--     schema — there is no separate practice_plan_clones table).
--   * Four new cloning coaches (one per distinct cloning org) + auth.users
--     mirrors per LESSONS#0084.
--   * Four new cloning teams (one per cloning coach, in distinct orgs).
--   * Three additional cloning orgs (...d8, ...da, ...dc) — the fourth
--     program is the EXISTING ...010 org the caller belongs to (the
--     route's distinct-program count includes the caller's org if a
--     cloner from that org cloned the plan).
--   * ONE coach_reputation_milestones row for the published coach
--     (...301), kind 'programs_2', notified_at IS NULL — the milestone
--     card on the published coach's /home asserts on this.
--
-- LESSONS#0084 — every coaches row gets a matching auth.users row first.
-- LESSONS#0101 — UUIDs in the d7..df range (verified unused above; d2..d6
-- are 0072 territory).
-- COPPA — no new players, no new parent rows. The seed clones a
-- team-level practice plan; no minor data is introduced.

-- Three additional cloning orgs (the 4th program is the existing ...010
-- the caller belongs to).
insert into organizations (id, name, slug)
values
  ('00000000-0000-4000-a000-0000000000d8', 'Hornets Program', 'hornets-program-0073'),
  ('00000000-0000-4000-a000-0000000000da', 'Falcons Program', 'falcons-program-0073'),
  ('00000000-0000-4000-a000-0000000000dc', 'Owls Program',    'owls-program-0073')
on conflict (id) do nothing;

-- Four cloning auth.users + coaches rows, one per cloning org. The
-- coaches.org_id is what the reputation aggregator reads to derive
-- distinctProgramCount.
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-a000-0000000000d7', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cloner-a-0073@test.com', now(), now(), now()),
  ('00000000-0000-4000-a000-0000000000d9', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cloner-b-0073@test.com', now(), now(), now()),
  ('00000000-0000-4000-a000-0000000000db', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cloner-c-0073@test.com', now(), now(), now()),
  ('00000000-0000-4000-a000-0000000000dd', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cloner-d-0073@test.com', now(), now(), now())
on conflict (id) do nothing;

insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values
  -- Cloner A — uses an org already present (cloning into the same program
  -- as the published coach is one of the four).
  ('00000000-0000-4000-a000-0000000000d7',
   '00000000-0000-4000-a000-000000000010',
   'Cloner A', 'cloner-a-0073@test.com', 'coach', true),
  -- Cloner B — Hornets program.
  ('00000000-0000-4000-a000-0000000000d9',
   '00000000-0000-4000-a000-0000000000d8',
   'Cloner B', 'cloner-b-0073@test.com', 'coach', true),
  -- Cloner C — Falcons program.
  ('00000000-0000-4000-a000-0000000000db',
   '00000000-0000-4000-a000-0000000000da',
   'Cloner C', 'cloner-c-0073@test.com', 'coach', true),
  -- Cloner D — Owls program.
  ('00000000-0000-4000-a000-0000000000dd',
   '00000000-0000-4000-a000-0000000000dc',
   'Cloner D', 'cloner-d-0073@test.com', 'coach', true)
on conflict (id) do nothing;

-- Four cloning teams, one per cloner. Each team's org_id matches its
-- coach's org_id (the route reads the coach's org_id, not the team's,
-- but a team-org alignment keeps the seed semantically consistent with
-- a real org).
insert into teams (id, org_id, sport_id, name, age_group, season, is_active)
select '00000000-0000-4000-a000-0000000000e2',
       '00000000-0000-4000-a000-000000000010',
       (select id from sports where slug = 'basketball' limit 1),
       'Cloner A Team', '11-13', 'Spring 2026', true
on conflict (id) do nothing;

insert into teams (id, org_id, sport_id, name, age_group, season, is_active)
select '00000000-0000-4000-a000-0000000000e3',
       '00000000-0000-4000-a000-0000000000d8',
       (select id from sports where slug = 'basketball' limit 1),
       'Cloner B Team', '11-13', 'Spring 2026', true
on conflict (id) do nothing;

insert into teams (id, org_id, sport_id, name, age_group, season, is_active)
select '00000000-0000-4000-a000-0000000000e4',
       '00000000-0000-4000-a000-0000000000da',
       (select id from sports where slug = 'basketball' limit 1),
       'Cloner C Team', '11-13', 'Spring 2026', true
on conflict (id) do nothing;

insert into teams (id, org_id, sport_id, name, age_group, season, is_active)
select '00000000-0000-4000-a000-0000000000e5',
       '00000000-0000-4000-a000-0000000000dc',
       (select id from sports where slug = 'basketball' limit 1),
       'Cloner D Team', '11-13', 'Spring 2026', true
on conflict (id) do nothing;

-- 12 plan-clone rows, spread 3-3-3-3 across the four cloning coaches.
-- Each row is a `plans` row with source_plan_id = the seeded 0055
-- published plan (...303). The cloning coach's org_id is what the
-- aggregator counts for distinctProgramCount. created_at = now() so
-- every row falls inside the 28-day reputation window.
--
-- The id family `0000000000e6..f1` is unused (d2..d6 + d7..dd + e0..e5
-- are claimed above; e6+ is free).

-- LESSONS#0084 — idempotent DELETE-then-INSERT block. A previous
-- seed run's clone rows are dropped so a re-seeded run doesn't double
-- the counts.
delete from plans where id in (
  '00000000-0000-4000-a000-0000000000e6',
  '00000000-0000-4000-a000-0000000000e7',
  '00000000-0000-4000-a000-0000000000e8',
  '00000000-0000-4000-a000-0000000000e9',
  '00000000-0000-4000-a000-0000000000ea',
  '00000000-0000-4000-a000-0000000000eb',
  '00000000-0000-4000-a000-0000000000ec',
  '00000000-0000-4000-a000-0000000000ed',
  '00000000-0000-4000-a000-0000000000ee',
  '00000000-0000-4000-a000-0000000000ef',
  '00000000-0000-4000-a000-0000000000f0',
  '00000000-0000-4000-a000-0000000000f1'
);

insert into plans (id, team_id, coach_id, player_id, type, title, content, content_structured, source_plan_id)
values
  -- Three from Cloner A (org ...010).
  ('00000000-0000-4000-a000-0000000000e6',
   '00000000-0000-4000-a000-0000000000e2',
   '00000000-0000-4000-a000-0000000000d7',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  ('00000000-0000-4000-a000-0000000000e7',
   '00000000-0000-4000-a000-0000000000e2',
   '00000000-0000-4000-a000-0000000000d7',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  ('00000000-0000-4000-a000-0000000000e8',
   '00000000-0000-4000-a000-0000000000e2',
   '00000000-0000-4000-a000-0000000000d7',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  -- Three from Cloner B (Hornets).
  ('00000000-0000-4000-a000-0000000000e9',
   '00000000-0000-4000-a000-0000000000e3',
   '00000000-0000-4000-a000-0000000000d9',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  ('00000000-0000-4000-a000-0000000000ea',
   '00000000-0000-4000-a000-0000000000e3',
   '00000000-0000-4000-a000-0000000000d9',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  ('00000000-0000-4000-a000-0000000000eb',
   '00000000-0000-4000-a000-0000000000e3',
   '00000000-0000-4000-a000-0000000000d9',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  -- Three from Cloner C (Falcons).
  ('00000000-0000-4000-a000-0000000000ec',
   '00000000-0000-4000-a000-0000000000e4',
   '00000000-0000-4000-a000-0000000000db',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  ('00000000-0000-4000-a000-0000000000ed',
   '00000000-0000-4000-a000-0000000000e4',
   '00000000-0000-4000-a000-0000000000db',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  ('00000000-0000-4000-a000-0000000000ee',
   '00000000-0000-4000-a000-0000000000e4',
   '00000000-0000-4000-a000-0000000000db',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  -- Three from Cloner D (Owls).
  ('00000000-0000-4000-a000-0000000000ef',
   '00000000-0000-4000-a000-0000000000e5',
   '00000000-0000-4000-a000-0000000000dd',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  ('00000000-0000-4000-a000-0000000000f0',
   '00000000-0000-4000-a000-0000000000e5',
   '00000000-0000-4000-a000-0000000000dd',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303'),
  ('00000000-0000-4000-a000-0000000000f1',
   '00000000-0000-4000-a000-0000000000e5',
   '00000000-0000-4000-a000-0000000000dd',
   null, 'practice', 'Tuesday Closeouts Series (cloned)',
   '{}', '{"drills": []}'::jsonb,
   '00000000-0000-4000-a000-000000000303')
on conflict (id) do nothing;

-- ONE coach_reputation_milestones row for the seeded 0055 published
-- coach (...301), kind 'programs_2', notified_at IS NULL. The
-- published coach's /home renders the milestone card on top of this
-- row.
delete from coach_reputation_milestones
  where published_coach_id = '00000000-0000-4000-a000-000000000301'
    and milestone_kind = 'programs_2';

insert into coach_reputation_milestones (
  id, published_coach_id, milestone_kind, crossed_at, notified_at
)
values (
  '00000000-0000-4000-a000-0000000000f2',
  '00000000-0000-4000-a000-000000000301',
  'programs_2',
  now() - interval '1 day',
  null
)
on conflict (published_coach_id, milestone_kind) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0076 — clone-stick signal back to the publishing coach
-- ────────────────────────────────────────────────────────────────────────
-- The 0073 seed pre-mints the published coach (...301) + her published
-- practice plan + 4 cloner coaches (...0d7/...0d9/...0db/...0dd) across
-- 4 cloning orgs. To reuse THAT graph for the drill-level stick signal,
-- the 0076 seed adds:
--
--   * ONE deterministic drill row owned by the published coach (...0301)
--     so the seeded drill_share has a real drill_id to point at. The
--     drill is NOT a player-level entity.
--   * ONE drill_shares row owned by the published coach. Tokens prefixed
--     `test-stick-drill-token-e2e-0076-001` so they don't collide with
--     the existing 0064 drill share token.
--   * ONE drill_share_clones row per cloner-A/B (the cloners from the
--     0073 seed) on this drill_shares row so the stick hook has a real
--     clone to match against.
--   * ONE coach_drill_signals row per cloner-A/B with rating='up' on
--     the seeded drill_id — the structural pre-existing stick signal
--     the route renders.
--   * TWO drill_clone_stick_signals rows (one per cloner-A/B) so the
--     publishing coach's /home renders the stuck_1 milestone after
--     reload. The third cloner (C) is reserved for the forward-path
--     e2e flow (sign in as cloner-C, fire a thumb-up, assert the
--     write-side hook).
--   * ONE coach_reputation_milestones row of kind stuck_1 with
--     notified_at IS NULL for the published coach.
--
-- UUID family: 0...310+ is unused above (verified via grep before
-- commit per LESSONS#0101). The 0064/0073 ranges stop at 0...0f2.
-- LESSONS#0084 — no new auth.users rows needed; the cloner coaches
-- are reused from the 0073 seed (...0d7/...0d9/...0db/...0dd).
-- LESSONS#0085 — no jsonb string values added here, just structured
-- DDL rows.
--
-- COPPA: the new drill is a coach-level resource; nothing references
-- a player, parent, session, or any minor data.

insert into drills (id, sport_id, name, description, category, age_groups,
                    duration_minutes, player_count_min, player_count_max,
                    equipment, teaching_cues, setup_instructions, source)
select
  '00000000-0000-4000-a000-000000000310',
  (select id from sports where slug = 'basketball' limit 1),
  '0076 E2E Maya Closeout Drill',
  'Maya''s closeout drill — the drill that gets cloned and stuck across the league.',
  'Defense',
  '{"8-10","11-13"}',
  10, 2, 12,
  '{"basketballs","cones"}',
  '{"Stay low on the close-out","Chest to the ball-handler","Hands up at the end"}',
  'Players close out on the shooter from the elbow.',
  'seeded'
on conflict (id) do nothing;

-- The active drill_shares row owned by the seeded 0073 published coach.
insert into drill_shares (id, coach_id, drill_id, share_token, caption, is_active)
values (
  '00000000-0000-4000-a000-000000000311',
  '00000000-0000-4000-a000-000000000301',
  '00000000-0000-4000-a000-000000000310',
  'test-stick-drill-token-e2e-0076-001',
  'My closeout drill — worked well on Tuesday with our U13s.',
  true
)
on conflict (id) do nothing;

-- Three drill_share_clones rows tied to cloner-A (...0d7), cloner-B
-- (...0d9), and cloner-C (...0db). cloned_at is in the past so the
-- stick rows below pass the "thumb after clone" gate.
delete from drill_share_clones where id in (
  '00000000-0000-4000-a000-000000000312',
  '00000000-0000-4000-a000-000000000313',
  '00000000-0000-4000-a000-000000000314'
);
insert into drill_share_clones (id, drill_share_id, cloner_coach_id, cloned_at)
values
  ('00000000-0000-4000-a000-000000000312',
   '00000000-0000-4000-a000-000000000311',
   '00000000-0000-4000-a000-0000000000d7',
   now() - interval '20 days'),
  ('00000000-0000-4000-a000-000000000313',
   '00000000-0000-4000-a000-000000000311',
   '00000000-0000-4000-a000-0000000000d9',
   now() - interval '15 days'),
  ('00000000-0000-4000-a000-000000000314',
   '00000000-0000-4000-a000-000000000311',
   '00000000-0000-4000-a000-0000000000db',
   now() - interval '10 days');

-- coach_drill_signals — cloner-A and cloner-B have already thumbed-up
-- the cloned drill (the structural sticks). Cloner-C has not — the
-- e2e flow signs in as cloner-C and fires the thumb-up.
delete from coach_drill_signals
  where drill_id = '00000000-0000-4000-a000-000000000310'
    and coach_id in (
      '00000000-0000-4000-a000-0000000000d7',
      '00000000-0000-4000-a000-0000000000d9'
    );
insert into coach_drill_signals (coach_id, drill_id, rating, run_count, last_rated_at)
values
  ('00000000-0000-4000-a000-0000000000d7',
   '00000000-0000-4000-a000-000000000310',
   'up', 1, now() - interval '5 days'),
  ('00000000-0000-4000-a000-0000000000d9',
   '00000000-0000-4000-a000-000000000310',
   'up', 1, now() - interval '3 days');

-- drill_clone_stick_signals — two rows (cloner-A in Cloner-A's org,
-- cloner-B in Hornets). The third stick row is the one the e2e flow
-- writes when cloner-C fires the thumb-up.
delete from drill_clone_stick_signals where id in (
  '00000000-0000-4000-a000-000000000315',
  '00000000-0000-4000-a000-000000000316'
);
insert into drill_clone_stick_signals (id, drill_share_id, cloner_coach_id, cloner_org_id, stuck_at)
values
  ('00000000-0000-4000-a000-000000000315',
   '00000000-0000-4000-a000-000000000311',
   '00000000-0000-4000-a000-0000000000d7',
   '00000000-0000-4000-a000-000000000010',
   now() - interval '5 days'),
  ('00000000-0000-4000-a000-000000000316',
   '00000000-0000-4000-a000-000000000311',
   '00000000-0000-4000-a000-0000000000d9',
   '00000000-0000-4000-a000-0000000000d8',
   now() - interval '3 days');

-- ONE coach_reputation_milestones row of kind 'stuck_1' with
-- notified_at IS NULL for the published coach. The /home card
-- renders the milestone after the published coach signs in.
delete from coach_reputation_milestones
  where published_coach_id = '00000000-0000-4000-a000-000000000301'
    and milestone_kind = 'stuck_1';
insert into coach_reputation_milestones (
  id, published_coach_id, milestone_kind, crossed_at, notified_at
)
values (
  '00000000-0000-4000-a000-000000000317',
  '00000000-0000-4000-a000-000000000301',
  'stuck_1',
  now() - interval '4 days',
  null
)
on conflict (published_coach_id, milestone_kind) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0077 — director-side cross-program peer pulse
-- ────────────────────────────────────────────────────────────────────────
-- The director-side cross-program pulse line on /admin renders ONLY when
-- TWO+ neighboring programs in the SAME SPORT (basketball, here) match
-- the caller program's TOP skill emphasis in the 14-day window. The
-- existing Organization-tier program (...110) is the caller; this block
-- seeds TWO neighboring basketball programs with admin coaches and 3+
-- plans EACH on `skills_targeted = '{transitions}'`.
--
-- To guarantee the caller program's TOP skill is ALSO transitions
-- (otherwise the cross-program signal is empty), this block also seeds
-- THREE plans on the existing program's teams (...120/...121/...191)
-- with `skills_targeted = '{transitions}'` and a created_at inside the
-- window. The 0071 seed already added "closeouts" plans to those teams —
-- transitions will outweigh closeouts (3 vs 1 per team) so the caller
-- top skill flips to transitions for the 0077 check.
--
-- UUID family `00000000-0000-4000-a000-000000000320`+ — verified unused
-- via grep before commit (the 0076 family stops at 0...0317).
-- LESSONS#0084: every new coaches row carries a matching auth.users row.
-- LESSONS#0085: the plans' `skills_targeted` column is text[] (not jsonb);
-- the SQL literal is `'{transitions}'` per the 0071 seed posture above.
-- LESSONS#0101: UUID range confirmed clean.
--
-- COPPA: this fixture seeds ONLY org-level + coach-level + plan-level
-- rows. No new players, no observations, no parent_*, no DOB, no
-- medical_notes. Plans are team-level (player_id null), so even the
-- existing `players.parent_email` allow-list is untouched.

-- Two new auth.users rows for the two neighboring program directors.
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-a000-000000000320',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'anna-riverside-e2e@test.com', now(), now(), now()),
  ('00000000-0000-4000-a000-000000000321',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'ben-westview-e2e@test.com', now(), now(), now())
on conflict (id) do nothing;

-- Two new organizations — both Organization-tier basketball programs.
-- These ride alongside (NOT inside) the existing E2E Program Org
-- (...110); the pulse comparison is BETWEEN orgs in the same sport.
insert into organizations (id, name, slug, tier)
values
  ('00000000-0000-4000-a000-000000000322',
   'Riverside Basketball', 'riverside-basketball-e2e', 'organization'),
  ('00000000-0000-4000-a000-000000000323',
   'Westview Hoops', 'westview-hoops-e2e', 'organization')
on conflict (id) do nothing;

-- One admin coach per neighbor org (the canonical director identity
-- the cross-program-pulse route reads as the source for
-- director_first_name + director_contact_email).
insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values
  ('00000000-0000-4000-a000-000000000320',
   '00000000-0000-4000-a000-000000000322',
   'Anna Reyes', 'anna-riverside-e2e@test.com', 'admin', true),
  ('00000000-0000-4000-a000-000000000321',
   '00000000-0000-4000-a000-000000000323',
   'Ben Park', 'ben-westview-e2e@test.com', 'admin', true)
on conflict (id) do nothing;

-- One team per neighbor org — basketball. The teams live so the
-- cross-program route can derive the org's sport via teams.sport_id
-- (mirrors the 0075 pattern; the organizations table has no sport_id
-- column).
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000324',
  '00000000-0000-4000-a000-000000000322',
  (select id from sports where slug = 'basketball' limit 1),
  'Riverside U12s', '11-13', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000325',
  '00000000-0000-4000-a000-000000000323',
  (select id from sports where slug = 'basketball' limit 1),
  'Westview U12s', '11-13', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;

-- Wire each director admin onto their own team via team_coaches
-- (LESSONS#0057 — team_coaches is the join, not teams.coach_id).
insert into team_coaches (team_id, coach_id, role)
values
  ('00000000-0000-4000-a000-000000000324',
   '00000000-0000-4000-a000-000000000320',
   'head_coach'),
  ('00000000-0000-4000-a000-000000000325',
   '00000000-0000-4000-a000-000000000321',
   'head_coach')
on conflict (team_id, coach_id) do nothing;

-- The converging practice plans: 3 plans per neighbor team on
-- transitions, AND 3 plans per existing E2E Program Org team on
-- transitions (so the caller program's top skill is also transitions).
-- All created_at inside the 14-day window. text[] literal per the 0071
-- seed posture (LESSONS#0085).
insert into plans (id, team_id, coach_id, player_id, type, title, content, skills_targeted, content_structured, created_at)
values
  -- Riverside (neighbor) — 3 transitions plans.
  ('00000000-0000-4000-a000-000000000326',
   '00000000-0000-4000-a000-000000000324',
   '00000000-0000-4000-a000-000000000320',
   null, 'practice', 'Riverside transitions session 1',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '2 days'),
  ('00000000-0000-4000-a000-000000000327',
   '00000000-0000-4000-a000-000000000324',
   '00000000-0000-4000-a000-000000000320',
   null, 'practice', 'Riverside transitions session 2',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '3 days'),
  ('00000000-0000-4000-a000-000000000328',
   '00000000-0000-4000-a000-000000000324',
   '00000000-0000-4000-a000-000000000320',
   null, 'practice', 'Riverside transitions session 3',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '4 days'),
  -- Westview (neighbor) — 3 transitions plans.
  ('00000000-0000-4000-a000-000000000329',
   '00000000-0000-4000-a000-000000000325',
   '00000000-0000-4000-a000-000000000321',
   null, 'practice', 'Westview transitions session 1',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '2 days'),
  ('00000000-0000-4000-a000-00000000032a',
   '00000000-0000-4000-a000-000000000325',
   '00000000-0000-4000-a000-000000000321',
   null, 'practice', 'Westview transitions session 2',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '3 days'),
  ('00000000-0000-4000-a000-00000000032b',
   '00000000-0000-4000-a000-000000000325',
   '00000000-0000-4000-a000-000000000321',
   null, 'practice', 'Westview transitions session 3',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '4 days'),
  -- E2E Program Org caller — 3 transitions plans across its 3 teams so
  -- the caller's top skill matches the neighbors'.
  ('00000000-0000-4000-a000-00000000032c',
   '00000000-0000-4000-a000-000000000120',
   '00000000-0000-4000-a000-000000000101',
   null, 'practice', 'Caller U10s transitions session',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '1 days'),
  ('00000000-0000-4000-a000-00000000032d',
   '00000000-0000-4000-a000-000000000121',
   '00000000-0000-4000-a000-000000000102',
   null, 'practice', 'Caller U12s transitions session',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '1 days'),
  ('00000000-0000-4000-a000-00000000032e',
   '00000000-0000-4000-a000-000000000191',
   '00000000-0000-4000-a000-000000000190',
   null, 'practice', 'Caller U14s transitions session',
   '{}', '{transitions}', '{"drills":[]}'::jsonb,
   now() - interval '1 days')
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- Ticket 0078 — dormant-publisher reactivation on clone fixture
-- ════════════════════════════════════════════════════════════════════════
-- The 0078 cron branch sends ONE honest email per (dormant publishing
-- coach, fresh 0073 milestone) tuple. This block seeds the fixture
-- needed for an e2e/vitest-cron pass:
--   * REUSES the EXISTING 0072 dormant Sarah Hawkes coach (...0d2)
--     whose last_active_at = 45 days ago — Sarah is the publishing
--     coach who shipped a drill in spring and has not opened the
--     app since.
--   * ONE more drill row owned by Sarah ("Sarah's closeout drill")
--     so the 0078 cron resolves a drill title for the email body.
--   * ONE more drill_shares row owned by Sarah, active, with a
--     deterministic share_token.
--   * ONE more drill_share_clones row pointing at the SEEDED cloning
--     org (the "Hornets" program — ...032f) — a coach in the Hornets
--     program "cloned Sarah's drill this week".
--   * ONE more organizations row for the Hornets program (...032f)
--     so the cron's program-name lookup resolves to "Hornets".
--   * ONE more coach_reputation_milestones row of kind 'clones_3'
--     with notified_at IS NULL — the unconsumed milestone the
--     0078 cron branch reads.
--   * NO coach_clone_reactivation_signals row yet — the cron writes
--     one when it fires; an idempotency re-run is a no-op via the
--     UNIQUE constraint.
--
-- UUID family `00000000-0000-4000-a000-00000000032f`+ — the 0077
-- family stops at 0...032e; 032f+ is unused.
-- LESSONS#0084 — no new auth.users rows needed; Sarah is reused
-- from the 0072 seed (...0d2).
-- LESSONS#0085 — no jsonb string values added here; just structured
-- DDL rows.
-- LESSONS#0101 — UUID range confirmed clean.
--
-- COPPA: the fixture is coach-level + org-level only. NO new
-- player, NO observation, NO parent_*, NO DOB, NO medical_notes.

-- New drill — Sarah's closeout drill.
insert into drills (id, sport_id, name, description, category, age_groups,
                    duration_minutes, player_count_min, player_count_max,
                    equipment, teaching_cues, setup_instructions, source)
select
  '00000000-0000-4000-a000-00000000032f',
  (select id from sports where slug = 'basketball' limit 1),
  '0078 E2E Sarah Closeout Drill',
  'Sarah''s closeout drill — the drill that gets cloned by a coach in another program in the fall.',
  'Defense',
  '{"8-10","11-13"}',
  10, 2, 12,
  '{"basketballs","cones"}',
  '{"Stay low on the close-out","Chest to the ball-handler","Hands up at the end"}',
  'Players close out on the shooter from the elbow.',
  'seeded'
on conflict (id) do nothing;

-- New drill_shares row — Sarah's published drill, active.
insert into drill_shares (id, coach_id, drill_id, share_token, caption, is_active)
values (
  '00000000-0000-4000-a000-000000000330',
  '00000000-0000-4000-a000-0000000000d2',
  '00000000-0000-4000-a000-00000000032f',
  'test-pub-react-drill-token-e2e-0078-001',
  'Live closeout 1-on-1',
  true
)
on conflict (id) do nothing;

-- New cloning organization — the "Hornets" program. NOT the existing
-- E2E org (...010); a SEPARATE program so the publish-graph edge is
-- "cross-program" by construction. Free tier — no entitlement gate
-- on the reactivation pull.
insert into organizations (id, name, slug, tier)
values (
  '00000000-0000-4000-a000-000000000331',
  'Hornets',
  'hornets-e2e-0078',
  'free'
)
on conflict (id) do nothing;

-- New cloner-coach in the Hornets program. Needs an auth.users row
-- first per LESSONS#0084.
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-000000000332',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'hornets-cloner-e2e@test.com', now(), now(), now()
)
on conflict (id) do nothing;

insert into coaches (
  id, org_id, full_name, email, role, onboarding_complete, last_active_at
)
values (
  '00000000-0000-4000-a000-000000000332',
  '00000000-0000-4000-a000-000000000331',
  'Hornets Cloner',
  'hornets-cloner-e2e@test.com',
  'coach', true,
  now() - interval '1 days'
)
on conflict (id) do nothing;

-- The cross-program clone — a coach in the Hornets program cloned
-- Sarah's drill this week. NOTE: drill_share_clones does NOT carry
-- the cloning org id directly (that lives on drill_clone_stick_signals
-- per migration 067). The cron resolves the cloning org through the
-- cloning coach's `coaches.org_id`.
delete from drill_share_clones where id = '00000000-0000-4000-a000-000000000333';
insert into drill_share_clones (id, drill_share_id, cloner_coach_id, cloned_at)
values (
  '00000000-0000-4000-a000-000000000333',
  '00000000-0000-4000-a000-000000000330',
  '00000000-0000-4000-a000-000000000332',
  now() - interval '2 hours'
);

-- The fresh 0073 milestone Sarah crossed when the Hornets clone fired.
-- crossed_at within the 24h window the 0078 cron reads; notified_at
-- IS NULL so the email can still go out.
delete from coach_reputation_milestones
  where published_coach_id = '00000000-0000-4000-a000-0000000000d2'
    and milestone_kind = 'clones_3';
insert into coach_reputation_milestones (
  id, published_coach_id, milestone_kind, crossed_at, notified_at
)
values (
  '00000000-0000-4000-a000-000000000334',
  '00000000-0000-4000-a000-0000000000d2',
  'clones_3',
  now() - interval '2 hours',
  null
)
on conflict (published_coach_id, milestone_kind) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0079 — parent → parent on-team forward
-- ────────────────────────────────────────────────────────────────────────
-- The new ParentForwardOnTeamButton mounts on /share/[token] and lists
-- the OTHER players on the SAME team whose parent_email is set. To
-- exercise the candidate list + the send POST against a real seeded
-- DB we need:
--
--   * Alice (...030) already has parent_email = 'sarah@walker-family.test'
--     (set above for ticket 0056 — line ~1083). She is the SENDER (her
--     parent is reading the report on the existing E2E share token).
--   * Bob Carter (...031) already exists on the same team but with NULL
--     parent_email — set it to a fixture value so the route can resolve
--     a recipient through the same-team contract.
--   * ONE NEW player ("Kai") on the same team with its own
--     parent_email so the candidate list shows TWO entries.
--
-- UUIDs in the 0...0335+ range — verified non-colliding with the
-- existing 0...000* family (LESSONS#0101 / #0043 — a colliding id would
-- silently no-op under `on conflict (id) do nothing`).

-- Set Bob's parent_email so he is a forward-eligible recipient.
update players
  set parent_email = 'liam-parent@e2e.test'
  where id = '00000000-0000-4000-a000-000000000031'
    and (parent_email is null or parent_email = '');

-- New teammate "Kai" — the third roster slot for the candidate list.
insert into players (id, team_id, name, nickname, name_variants, age_group,
                     position, parent_name, parent_email, is_active)
values (
  '00000000-0000-4000-a000-000000000335',
  '00000000-0000-4000-a000-000000000020',
  'Kai Other', null, null, '11-13', 'Forward',
  'Other Family', 'kai-parent@e2e.test', true
)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Ticket 0080 — parent → parent CROSS-TEAM-SAME-PROGRAM forward
-- ────────────────────────────────────────────────────────────────────────
-- The new "In your program" tab on the ParentForwardOnTeamButton lists
-- OTHER players on DIFFERENT teams in the SAME `org_id` whose
-- parent_email is set AND whose team has at least one row in
-- team_coaches. To exercise the candidate list + the cross-team send
-- POST against a real seeded DB we need:
--
--   * A SECOND TEAM ('E2E Program Bears U12') in the SAME org as the
--     default E2E team (...020 — Hawks U10 in 'E2E Test Org' / org
--     ...010). Per LESSONS#0057 the head-coach row lives on
--     `team_coaches`, NEVER `teams.coach_id` — confirmed.
--
--   * A NEW HEAD COACH for the Bears team (auth.users row first per
--     LESSONS#0084 — coaches.id has an FK to auth.users(id)).
--
--   * TWO new players on the Bears team, each carrying a parent_email
--     so the candidate list shows two entries.
--
-- UUIDs in the 0...0340+ range — verified non-colliding with the
-- existing 0...0335 family (LESSONS#0101 / #0043: a colliding id
-- silently no-ops under `on conflict (id) do nothing`).
-- Per LESSONS#0121: the e2e spec asserts on names that ARE seeded
-- ("Bear" + "Cub" below) — grep tests/e2e/fixtures/seed.sql for
-- "Bear " before writing the spec assertion.

-- Head-coach auth.users row for the Bears team — coaches.id FK to
-- auth.users(id) requires this to land FIRST.
insert into auth.users (id, instance_id, aud, role, email,
                        email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-4000-a000-000000000340',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'bears-coach-e2e@test.com',
  now(), now(), now()
)
on conflict (id) do nothing;

-- The Bears coach. Same org as the Hawks coach so the cross-team-
-- same-program forward resolves the program.
insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values (
  '00000000-0000-4000-a000-000000000340',
  '00000000-0000-4000-a000-000000000010',
  'Bears Coach', 'bears-coach-e2e@test.com', 'coach', true
)
on conflict (id) do nothing;

-- The Bears team in the SAME org as the default E2E team.
insert into teams (id, org_id, sport_id, name, age_group, season, season_weeks, current_week, is_active)
select
  '00000000-0000-4000-a000-000000000341',
  '00000000-0000-4000-a000-000000000010',
  (select id from sports where slug = 'basketball' limit 1),
  'E2E Bears U12', '11-13', 'Spring 2026', 10, 3, true
on conflict (id) do nothing;

-- The head-coach row on team_coaches (LESSONS#0057 — team-coach
-- ownership lives on this table, NEVER `teams.coach_id`).
insert into team_coaches (team_id, coach_id, role)
values (
  '00000000-0000-4000-a000-000000000341',
  '00000000-0000-4000-a000-000000000340',
  'head_coach'
)
on conflict (team_id, coach_id) do nothing;

-- Two players on the Bears team with parent_email — both appear in
-- the cross-team candidate list. First names "Bear" and "Cub" are
-- what the e2e spec asserts on (LESSONS#0121 — grep the seed for
-- the names BEFORE writing the assertion).
insert into players (id, team_id, name, nickname, name_variants, age_group,
                     position, parent_name, parent_email, is_active)
values
  ('00000000-0000-4000-a000-000000000342',
   '00000000-0000-4000-a000-000000000341',
   'Bear Family', null, null, '11-13', 'Forward',
   'Bear Mom', 'bear-mom-1@e2e.test', true),
  ('00000000-0000-4000-a000-000000000343',
   '00000000-0000-4000-a000-000000000341',
   'Cub Family', null, null, '11-13', 'Guard',
   'Cub Mom', 'bear-mom-2@e2e.test', true)
on conflict (id) do nothing;

commit;
