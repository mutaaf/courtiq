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
insert into coaches (id, org_id, full_name, email, role, onboarding_complete)
values (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000010',
  'E2E Test Coach', 'e2e@test.com', 'admin', true
)
on conflict (id) do nothing;

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
insert into parent_shares (id, player_id, team_id, coach_id, share_token, include_highlights, include_observations, is_active, expires_at)
values (
  '00000000-0000-4000-a000-000000000060',
  '00000000-0000-4000-a000-000000000030',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  'test-share-token-e2e-001',
  true, true, true,
  now() + interval '365 days'
)
on conflict (share_token) do nothing;

commit;
