---
id: 0043
title: Turn the season's middle into a one-tap parent newsletter that tells the team's whole arc, not just last week
status: groomed
priority: P2
area: ai
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach five or six weeks into a ten-week season, I want one tap on the plans
page to produce a TEAM-wide mid-season newsletter — what the team's been working on, what's
clicking, what's next — that I send to every parent at once, so that I'm telling the whole
arc of the season to the whole team's parents instead of writing twelve individual reports or
nothing at all.

## Why now (four lenses)

### Product Owner
We already ship the per-player parent report (0016/0034 — `parent_report` plan type) which
is the right artifact when a parent asks "how's my kid doing?" — but it's the WRONG artifact
for the broader, team-level moment in the middle of the season when a coach wants to send one
message to every parent at once: "here's where we are, here's what we're focused on, here's
what comes next." Today the coach either writes that by hand (most don't) or it doesn't
happen. The smallest meaningful unit of value is one new `plans.type = 'mid_season_team_newsletter'`
AI artifact, generated from the same structured inputs the per-player report already reads
(observations, sessions, the practice arc 0018, the coaching signature 0037), persisted as a
plans row, and shared via the EXISTING parent-sharing path — no new public token table, no
new tier gate, no new sender. One prompt registry entry, one route, one migration extending
`plans_type_check`, one share page.

### Stakeholder
The structured-coach-artifact moat is the accumulation of plan types only SportsIQ can
produce because only SportsIQ has the structured inputs. A team newsletter that fuses six
weeks of observations + the arc + the coach's voice is exactly that kind of artifact — and
it's the first artifact in the moat that goes to EVERY parent at once rather than one parent.
That changes the viral math: instead of one parent receiving a per-player report and maybe
forwarding it (the existing loop), every parent on the team receives the same shareable
artifact at the same time, and each one is a chance for a parent-who-is-also-a-coach to ask
"wait, who wrote that?" — the 0019 observer-to-coach conversion path scales by per-team
attendance, not per-player. Existing `parent_sharing` tier key already paywalls share
features at Coach+; no new tier surface needed, no new feature key, no contrived gate.

### User (the coach, Wednesday night, the week-6 practice in the books, kid asleep)
They open the plans page. The opponent profile they wrote two weeks ago is there; the per-
player reports they generated last month are there. New button: "Generate mid-season
newsletter." Six to ten seconds later they have four short blocks: a one-line headline, a
two-sentence arc summary ("six weeks in, we've focused on ball movement and we're starting to
see it land"), two strength bullets, two focus-area bullets, and one quoted line from the
coach themselves drawn from observation notes. They tap "Share with all parents" — the
existing share-create flow emails every parent on the team's roster via the existing parent
share path. They put the phone down. Saturday morning at the game, three parents come up to
say "loved the newsletter." On a flaky gym wifi the existing AI failover (0012) and quota-wall
resume (0035) just work.

### Growth
The "show me" moment is the newsletter itself, dropped in the team group chat: four short
blocks in coach voice, specific to this team's six weeks. It outperforms a generic weekly
email because it's about THIS team and it was tapped, not subscribed to. A parent who is also
a coach for another team is the high-leverage reader — 0019's data shows them as the
highest-converting referral path the product has — and the team-wide newsletter is the surface
that puts the artifact in front of them MULTIPLE times per season (every team has 1–2
parent-coaches on average). It also pulls the dormant 0018 / 0034 / 0037 inputs into a
parent-facing surface they don't have one of today.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new `midSeasonTeamNewsletter` entry in the `PROMPT_REGISTRY` of
  `src/lib/ai/prompts.ts` accepts `{ team, observationInsights, arcContext?, coachingSignature? }`
  (the same input types `parentReport` and the 0040 `pregameBrief` already accept). The
  output JSON schema is exactly five keys: `headline` (string, max 80 chars), `arc_summary`
  (string, 2 sentences), `team_strengths` (string[], length 2), `focus_areas` (string[],
  length 2), `coach_voice_quote` (string, 1 line drawn from a real observation). NO
  per-player fields, NO `lineup`, NO `next_action` — that's what makes this artifact
  team-wide. (vitest: the rendered prompt contains the team-level instruction; the schema
  rejects any extra key; arrays enforce their length.)
- [ ] Voice contract: the rendered prompt string contains NO AGENTS.md banned word
  (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`) in either the system
  or user block. Per LESSONS#0023 the prompt instructs voice POSITIVELY ("write like a
  coach's clipboard note to parents, not a marketing newsletter") and NEVER enumerates the
  banned tokens verbatim. (vitest scans `${system}\n${user}` and asserts none of the tokens
  appear.)
- [ ] `POST /api/ai/mid-season-team-newsletter` (new) accepts `{ teamId }`. Auth via
  `createServerSupabase().auth.getUser()` → 401; team belongs to the caller's
  `coaches.org_id` → 404 otherwise; team has fewer than a small threshold of observations in
  the last 6 weeks → `200 { newsletter: null }` (mirrors the 0023 below-threshold
  short-circuit). Otherwise builds inputs via the existing
  `src/lib/ai/context-builder.ts` helpers (last 6 weeks of observations, the arc, the
  signature), calls `callAIWithJSON({ prompt: 'midSeasonTeamNewsletter', schema, orgId,
  interactionType: 'custom' })`, persists the result as a new `plans` row with
  `type='mid_season_team_newsletter'`, `coach_id`, `team_id`, `content_structured` matching
  the schema, and returns `{ planId, content_structured }`. (vitest covers each branch.)
- [ ] Server-side tier gate uses the EXISTING `parent_sharing` feature key — `canAccess(tier,
  'parent_sharing')` returns true for Coach/Pro/Org and false for Free; the route returns
  `402 { upgrade: true, feature: 'parent_sharing' }` on free. The plans-page button is
  wrapped in `<UpgradeGate feature="parent_sharing">` with NO new entry in `FEATURE_CONFIG`
  (the feature key already exists). Per LESSONS#0023 the `feature` prop equals the tier-key
  string verbatim, not a shorthand. (vitest: free → 402; coach → 200. Playwright: free coach
  sees the existing upgrade gate copy; coach sees the button.)
- [ ] The migration `04N_plans_type_mid_season_team_newsletter.sql` extends the
  `plans_type_check` CHECK constraint allow-list by drop-and-recreate (mirror
  `034_plans_type_check_align.sql`'s pattern) to include `'mid_season_team_newsletter'`.
  Pick the NEXT FREE integer prefix AFTER the 0042 migration (so `043_…` — but verify
  with `ls supabase/migrations/`, LESSONS#0006/#0009, and document the chosen prefix in
  the Implementation log; if 0040's `041_*` and 0042's `042_*` haven't both merged when
  this runs, the prefix may shift). The migration only widens the allow-list; no new column,
  no new table. (vitest scans the migration's executable DDL — strip `--` comments first per
  LESSONS#0088 — and asserts only `'mid_season_team_newsletter'` is added.)
- [ ] AI contract test: `midSeasonTeamNewsletter` produces structurally-valid JSON parsing
  against the five-key schema under at least Anthropic AND one fallback provider (mirror
  `tests/ai/provider-failover.test.ts` and `tests/ai/plan-coaching-signature-contract.test.ts`).
  No provider hardcoding. (vitest contract test.)
- [ ] `src/types/database.ts` extends the `Plan.type` union with
  `'mid_season_team_newsletter'`. The data-route allow-list in
  `src/app/api/data/route.ts` already includes `plans` so the new type rides through the
  existing `query()` path for free; assert via vitest that a `query({ table: 'plans', where:
  { type: 'mid_season_team_newsletter' } })` round-trips. (vitest hits the data route with a
  seeded plan and asserts the row comes back.)
- [ ] A new public page `src/app/share/team-newsletter/[token]/page.tsx` renders a saved
  newsletter from a `team_newsletter_shares` row OR — to avoid a new shares table — from a
  pre-existing share token mechanism extended for this type. The CONCRETE choice the dev
  makes: reuse the `team_card_shares` table (migration 035) by adding a `type` column with
  default `'team_card'` and the value `'mid_season_team_newsletter'` for newsletter shares
  — that adds ONE nullable column to an existing table instead of a brand-new shares table.
  The page is added to `publicPaths` in `src/lib/supabase/middleware.ts` so the auth proxy
  doesn't 30x (LESSONS#0038). (Playwright: seed a `team_card_shares` row with the new
  `type='mid_season_team_newsletter'` and a saved plan; visit
  `/share/team-newsletter/<token>`; assert the four rendered blocks; assert hitting the
  same URL without a valid token returns 404.)
- [ ] COPPA / privacy: the prompt's instruction explicitly says the newsletter is about the
  TEAM and never names individual players in `arc_summary` / `team_strengths` /
  `focus_areas` / `coach_voice_quote`; the schema does not include a player-name field.
  (vitest contract test inspects sampled outputs across both providers for planted player
  tokens; the schema-level check is enforced by the zod definition.)
- [ ] The existing parent-sharing emails (the route that fires when a coach taps "Share with
  all parents") accept this new plan type by reading `plans.type` and dispatching the right
  subject + email body template — `'parent_report'` keeps its existing template, the new
  `'mid_season_team_newsletter'` type uses a new subject `"<TeamName> — mid-season
  update"`. (vitest: the dispatcher routes both types correctly; an unknown type still
  falls back to the existing parent-report template — no regression.)
- [ ] Regression: every existing `plans.type` write path stays byte-identical. The
  per-player parent report (0016/0034), the season recap (0017), the game recap (0027), the
  weekly star (0009), and the new 0040 `pregame_brief` continue to work. (vitest: a fixture
  save of each existing plan type still passes after the migration; the
  `mid_season_team_newsletter` write is purely additive.)

## Out of scope

- Auto-generating the newsletter at a schedule. v1 is one-tap on the plans page only; an
  auto-fired version would burn quota without the coach's intent (the "passive AI
  consumption" anti-pattern).
- Sending the newsletter as an EMAIL to every parent automatically. v1 generates the
  artifact + persists it + offers a share link via the existing share-create path; the
  email-blast surface is a separate ticket once we've seen real usage.
- Multi-language localization. v1 is English only.
- A coach-editable template. The AI is the value; a settings form would invert it.
- A different tier gate or pricing experiment. v1 reuses `parent_sharing` exactly; if Pro
  coaches want a premium version, that's a future split.
- Threading the newsletter into the program-pulse digest (0028). The newsletter is a
  coach-individual artifact, not a director-level one.
- Backfilling newsletters for past weeks. v1 is forward-only.
- An OG preview image for the share URL. Sitemap inclusion (0038) is a separate ticket
  and we don't add a new public surface to the sitemap in this ticket — v1 is
  noindex-friendly until the OG / sitemap pass is run as a follow-up.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- `src/lib/ai/prompts.ts` — add `midSeasonTeamNewsletter: (params) => ({ system, user })`.
  Reuses `buildSystemPreamble`. The output JSON schema declared in the prompt is exactly
  the five keys; the prompt explicitly says "do not name individual players". Voice
  instruction is POSITIVE — never enumerate banned tokens (LESSONS#0023).
- `src/lib/ai/schemas.ts` — add `midSeasonTeamNewsletterSchema` (zod): `headline: z.string()
  .max(80)`, `arc_summary: z.string()`, `team_strengths: z.array(z.string()).length(2)`,
  `focus_areas: z.array(z.string()).length(2)`, `coach_voice_quote: z.string()`.
- `src/app/api/ai/mid-season-team-newsletter/route.ts` (new) — `POST({ teamId })`. Auth →
  401; team-belongs-to-org → 404; below-threshold (< 6 observations across the last 6
  weeks, mirror 0023's threshold philosophy) → `{ newsletter: null }` no AI call; happy
  path goes through `callAIWithJSON` with the 5-key schema, then writes a `plans` row.
  Service-role only; never a direct client write.
- `src/lib/tier.ts` — NO change. `parent_sharing` already exists on Coach / Pro / Org and
  does not on Free. Confirm in vitest.
- `src/components/ui/upgrade-gate.tsx` — NO change to `FEATURE_CONFIG`. The existing
  `parent_sharing` benefit copy is reused.
- `src/app/(dashboard)/plans/page.tsx` — on the plans page header (next to the existing
  artifact buttons), add a "Generate mid-season newsletter" button wrapped in
  `<UpgradeGate feature="parent_sharing">`. POSTs to `/api/ai/mid-season-team-newsletter`
  via `mutate()` (AGENTS.md rule 3). On success, render the four-block artifact inline
  and offer a "Share with parents" CTA that POSTs to the existing share-create path with
  the new plan id + the new `type='mid_season_team_newsletter'`.
- New migration `supabase/migrations/04N_plans_type_mid_season_team_newsletter.sql` — drop
  and recreate `plans_type_check` to include `'mid_season_team_newsletter'`. Pick the next
  free prefix AFTER the 0042 migration (so `043_…` if 0042 lands first). Per LESSONS#0006
  document the prefix decision in the Implementation log. The migration also adds `type
  TEXT NULL` to `team_card_shares` (default `'team_card'` so existing rows keep their
  meaning) so the newsletter share can ride on the existing table.
- `src/app/share/team-newsletter/[token]/page.tsx` (new, server component) — reads the
  share token from `params`, queries `team_card_shares` by `eq('share_token', token).eq(
  'type', 'mid_season_team_newsletter').eq('is_active', true)`, loads the linked plan, and
  renders the four blocks in the existing parent-portal gray/orange aesthetic (NOT the
  dark zinc dashboard aesthetic). 404 on missing / inactive / wrong-type. NO minor PII
  collection on the page (no reaction form is added — that's a future ticket).
- `src/lib/supabase/middleware.ts` — add `/share/team-newsletter` to the `publicPaths`
  array so the auth proxy doesn't 30x. LESSONS#0038 family.
- `src/types/database.ts` — extend `Plan.type` union with `'mid_season_team_newsletter'`.
  Add the optional `type` column to `TeamCardShare`.
- `src/app/api/data/route.ts` — the `plans` allow-list already includes the table; assert
  in a vitest that the new type round-trips.
- The existing parent-sharing email dispatcher (read `src/app/api/share/create/route.ts` /
  `src/lib/email.ts` / wherever the parent-report share dispatches) — extend it to
  route a `mid_season_team_newsletter` plan type to a new email template named
  `buildMidSeasonNewsletterEmailHtml({ teamName, coachName, planContent, shareUrl })`.
  Existing `parent_report` template stays byte-identical.
- `tests/ai/mid-season-team-newsletter.test.ts` (new, `.test.ts`) — route auth / team
  ownership / below-threshold / happy path / 402-on-free. Mock `@/lib/supabase/server`
  chainably and `@/lib/ai/client`'s `callAIWithJSON`. Run under Node 20.19.0 (LESSONS#0010).
- `tests/ai/mid-season-team-newsletter-contract.test.ts` (new) — multi-provider contract
  test; assert JSON parses against the schema under Anthropic + one fallback; assert no
  banned-word tokens in the rendered prompt; assert no player-name tokens in sampled
  outputs.
- `tests/migrations/plans-type-mid-season-newsletter.test.ts` (new) — scans the migration
  executable DDL (strip `--` comments, LESSONS#0088); asserts only the documented
  allow-list extension and the `team_card_shares.type` column are added.
- `tests/e2e/mid-season-newsletter-flow.spec.ts` (new Playwright spec) against the
  0006-seeded Supabase. Seed: a Coach-tier coach + a team + 6+ observations spread across
  6 weeks + a `team_card_shares` row with `type='mid_season_team_newsletter'` and a
  pre-saved `plans` row of that type (raw SQL; jsonb wrapping per LESSONS#0085/#0086). The
  spec hits the `/share/team-newsletter/<token>` page and asserts the four rendered
  blocks; a separate authed sub-spec on the dashboard taps the button and waits for the
  inline render. Skip when E2E creds are unset (convention). Use a `data-testid` on the
  newsletter container to scope strict-mode locators (LESSONS#0081).
- New deps: NO. Migration: YES — one constraint-extension + one column-add. Env vars: NO.
  AI prompt change: YES — `midSeasonTeamNewsletter` in `PROMPT_REGISTRY`. Tier feature
  key: NO new key — reuses `parent_sharing`.
- LESSONS to anchor: #0023 (voice positively, `feature` prop equals the tier key), #0038
  (add the share path to `publicPaths`), #0006/#0009 (migration prefix uniqueness;
  CHECK-constraint widening across a fresh-DB seed), #0085/#0086 (jsonb seeding in raw
  SQL), #0088 (strip `--` comments before scanning migration content).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0043-…` opened
- YYYY-MM-DD — failing test added in `tests/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
