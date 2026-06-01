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

commit;
