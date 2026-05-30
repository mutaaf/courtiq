---
id: 0058
title: Catch the coach on Sunday night with the half-built plan they left on the kitchen table
status: groomed
priority: P1
area: onboarding
created: 2026-05-30
owner: product-groomer
---

## User story

As a volunteer coach who started building Tuesday's practice plan in 4-minute bursts on
Wednesday and Friday but ran out of time before bedtime both nights, I want one short
email on Sunday at 7pm — the moment I actually sit down to plan the week — that names the
team, names the gap ("you have a warmup but no closeout drill"), and gives me one tap to
finish it in 12 minutes, so that the plan I half-built doesn't get scrapped at Tuesday
4:30pm into "I'll just run last week's again," and the product owns the Sunday-night
planning ritual the same way the Monday digest owns Monday morning.

## Why now (four lenses)

### Product Owner
0023 ships the Monday "your week in coaching" digest — claims Monday morning. 0041 ships
the Monday parent-reactions rollup — also Monday. 0042 ships the polite 14-day-quiet
"still coaching?" pause — claims dropped coaches. NOTHING in the shipped backlog owns the
single highest-leverage cadence moment in a youth-coach's week: Sunday 6-9pm, when the
coach actually sits down with the family-shared Google Calendar and figures out what
Tuesday's practice will be. A coach with an unfinished `plans` row in draft state on
Sunday night either (a) finishes it (we win) or (b) gives up and re-runs last week (we
lose). The smallest meaningful unit of value is a Sunday-evening email that fires ONLY
when (i) the coach has at least one team with an upcoming session in the next 7 days
AND (ii) there is a `plans` row in draft state for that team that is < 7 days old AND
(iii) the coach has not opted out. The email subject names the team and the gap
("Your Tuesday plan for the Hawks — 2 drills left"); the body shows the drill list as
it stands and one big CTA "Finish in 12 minutes" that deep-links to the plans page
with the draft expanded. No AI on the cron path (the email is structured from the
draft's current state — same posture as the 0042 quiet check-in which generates no
new AI content per send). New cron route, new email template, reuses the existing
preferences-opt-out + already-sent-bookmark pattern from 0023 / 0041 / practice-
reminder cron.

### Stakeholder
This is the SINGLE retention surface the loop has the most to gain from. The shipped
coach engagement surfaces are mostly REWARDS (parent reports, weekly stars, recaps) or
REPORT-OUTS (digest, parent rollup, program pulse). They don't intervene at the
DECISION POINT where the coach is choosing between using the product and not using the
product. Sunday 7pm is that decision point. Three moat compoundings: (1) every Sunday
finish-prompt that fires keeps the coach's `plans` row from being abandoned, which
keeps the next-Tuesday capture session connected to a plan, which makes EVERY
downstream artifact (recap, parent report, sideline cheat sheet, postgame texts)
materially better. (2) the prompt is a SAVED-DRAFT recovery channel competitors with
no structured plan model cannot replicate — a forms-app's "plan" is just a text field
that nobody half-fills. (3) it deepens the Practice Arc memory layer (0018): the
sooner the coach finishes a plan, the sooner the arc-continuity threading kicks in
for the next session.

### User (Sunday 7:14pm, on the couch, scrolling email between kids' bath time)
She opens the email. Subject: "Your Tuesday plan for the Hawks — 2 drills left." The
body is short and plain: the team name, the current draft's title ("Closeout & spacing"),
the 4 drills she's already added with their durations, a one-line "what's missing"
("you have a 10-min warmup, 2 drills, and a scrimmage — no closeout drill yet"), and
ONE button: "Finish in 12 minutes." She taps. Deep-link opens /plan with the draft
already expanded, the AI-suggest panel pre-loaded with one closeout drill matched to
her team's age group + the program focus (0031) if set. She picks one, taps Save, the
plan flips from draft to active. Two minutes total, on the couch. If she ignores the
email, no nag — there is at most ONE Sunday-night prompt per draft per week. If the
draft is already complete (the existing `plans` schema's `is_draft` field, or
equivalent — read first) the email never sends. If she has paused (0042) the email
never sends. If her preferences say `disable_planning_prompts: true` the email never
sends.

### Growth
The "show me" moment is the EMAIL itself in the coach's inbox — short, specific, no
hype, named for HER team. That's the screenshot the coach forwards to her sister
who coaches her own kid's team saying "I get these on Sunday and they actually save
my week." Compounds three ways: (1) the recurring cadence locks in the Sunday-night
ritual — by week 3 the coach EXPECTS the email and opens it without reading the
subject. (2) the deep-link drops the coach into the highest-conversion surface (the
plans page mid-edit), where the AI-suggest panel is already showing the right drill;
this becomes a recurring entry point for the AI quota usage that converts free coaches
to paid (Free's 5 AI calls/month is the binding constraint here — the finish-prompt
triggers exactly the kind of mid-month AI call that pushes a free coach into the
0035 "finish-this-exact-artifact" upgrade gate). (3) the email's footer carries the
publisher's "share SportsIQ with another coach" link (0021 pattern) — coaches who
finish their plan are the coaches most likely to recommend the product.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] No migration to the `plans` schema. The cron reads existing columns
  (`type='practice'` OR whatever the real value is — read `src/types/database.ts`
  for the actual `PlanType` enum per LESSONS#0009 / #0096; the ticket prose says
  `type='practice'` based on the 0049 reconciliation), `is_draft` if present in
  the schema (read first — if the schema has no `is_draft`, read the existing
  draft-detection logic the /plans page uses today and reuse it; the cron MUST
  use the same predicate as the UI's draft chip so they never disagree). Per-coach
  opt-out and per-week sent-bookmark live in the existing `coaches.preferences`
  jsonb — same posture as 0023 / 0041 / practice-reminder, no new column. (vitest
  scans the migration directory; assert NO new migration is added by this ticket;
  the draft-detection predicate the cron uses is the SAME helper the plans page
  uses — both import from the same source-of-truth `src/lib/plan-draft-utils.ts`.)
- [ ] `POST /api/cron/sunday-plan-prompt` (new) protected by the existing
  `CRON_SECRET` env var (LESSONS — mirror practice-reminder cron's auth header
  pattern). Vercel Cron schedule: Sundays 19:00 LOCAL → resolved via the
  coach's `coaches.timezone` if present, else UTC 23:00 (rough proxy for North
  American evening). Mirror the practice-reminder cron's batched pagination
  (`BATCH_SIZE = 50`). For each candidate coach: (a) the coach is not paused
  (`coaches.paused_until > now()` from 0042), (b) `coaches.preferences.disable_
  planning_prompts !== true`, (c) the coach has at least one ACTIVE team with
  an upcoming session in the next 7 days, (d) the team has a DRAFT plan
  (`is_draft = true` OR the source-of-truth draft predicate) for the upcoming
  session that is < 7 days old, (e) the `coaches.preferences.sunday_plan_
  prompt_<ISO-week>` bookmark is not set. On send, set the bookmark. Reports
  `{ sent, skipped, errors }` in the response body (same shape as other crons).
  (vitest: 401 on missing CRON_SECRET; paused coach is SKIPPED; opted-out coach
  is SKIPPED; coach with no draft is SKIPPED; coach with already-finished plan
  is SKIPPED; happy path sends ONE email and writes the bookmark; second invocation
  the same week SKIPS the same coach.)
- [ ] The email subject names the team AND the gap. Format:
  `'Your <day-of-next-session> plan for the <Team Name> — <N> drills left'`
  where `N` is the number of remaining slots inferred from the draft's current
  shape (e.g. a draft with no closeout / cooldown / scrimmage has higher N).
  If N is 0 (everything filled but the coach hasn't flipped is_draft=false yet)
  the subject reads `'Your <day> plan for the <Team Name> — last 1 minute'`.
  Plain text fallback included. Voice contract: NO AGENTS.md banned word in the
  subject OR body (LESSONS#0023 — instruct positively). (vitest: `buildSundayPlan
  PromptEmail({ teamName, dayOfNextSession, gapCount, draftSnapshot }): { subject,
  html, text }` for each fixture — gap=0, gap=2, gap=4, missing-team-name fallback;
  banned-word scan on every output.)
- [ ] The email body has FIVE elements ONLY (no marketing hero, no testimonials,
  no "why SportsIQ"): the team-and-day header, the draft's current title, the
  drill list as it stands (drill name + duration), a one-line "what's missing"
  computed from the draft shape, ONE CTA button "Finish in 12 minutes" deep-
  linking to `/plan?draftId=<id>` (the existing plans page reads `?draftId=...`
  and expands the draft; if it doesn't yet, the dev adds that one-line URL-
  param handler in the same PR). The email footer carries the publisher's
  referral link (0021 pattern — `makeReferralCode(coach.id)`) and the existing
  one-tap unsubscribe link from `src/lib/email/layout.ts`. (vitest: the
  rendered HTML contains exactly the named elements; the CTA href contains the
  draftId; the footer contains the coach's referral code and the unsubscribe
  link.)
- [ ] Deep-link landing: `/plan?draftId=<id>` (or whichever query-param shape
  the plans page already uses — read first) opens the plans page with the
  named draft expanded and the AI-suggest panel pre-loaded with one suggestion
  whose category matches the draft's gap (closeout if no closeout, scrimmage
  if no scrimmage, etc.) AND the program focus (0031) if set. The AI call goes
  through `callAI()` — same `practicePlan` prompt the existing plans page
  uses (no new prompt), with the `focusSkills` array narrowed to the detected
  gap. The free-coach quota wall (0035's `<UpgradeGate>` is the existing
  pattern) still applies on this AI call; a quota-blocked free coach sees the
  upgrade gate AT the drill suggestion slot, NOT at the email or the page
  open — they can still finish the plan manually. (vitest: `?draftId=<id>` on
  /plan expands the draft; the AI suggest panel calls `callAI()` with the
  narrowed focusSkills; a quota-blocked free coach sees the upgrade gate at
  the suggestion slot only.)
- [ ] Tier / feature gating: the EMAIL itself is universal (free + paid). The
  draft-detection + send is universal. The post-tap AI suggestion at the
  plans-page slot uses the existing AI quota path (LESSONS#0023's
  `feature_*` naming convention applies); the new ticket adds NO new tier
  feature key. Free coaches in their last AI call of the month get the
  existing 0035 upgrade gate at the suggestion slot. (vitest: a free-tier
  coach sees the email; a paid-tier coach sees the email; both can tap the
  CTA; the AI suggestion respects the existing quota wall and shows the
  existing upgrade gate, not a new gate.)
- [ ] Per-coach opt-out: a new key `disable_planning_prompts: boolean` on
  `coaches.preferences` (NO migration — the existing jsonb absorbs the key).
  Coaches can flip it from the existing `/account` settings page — add ONE
  toggle row to that page in this PR. Mirror the existing "disable practice
  reminders" toggle row (read first). The cron reads the key and skips on
  `=== true`. (vitest: the cron skips a coach with the key set; the
  settings-page render shows the toggle; tapping the toggle POSTs to the
  existing preferences-update endpoint with the new key.)
- [ ] Privacy / COPPA: the email body contains NO player names, NO observation
  text, NO parent data. It contains only: the team name (coach-owned), the
  draft's title (coach-authored), the drill names + durations (coach-authored
  or AI-generated drill metadata, never per-player). The cron query selects ONLY
  the columns named above; assert the column allow-list in the test. (vitest:
  planted player names / observation text in the seeded draft do NOT appear in
  the rendered email; the cron's `.select()` calls list exactly the documented
  columns.)
- [ ] Voice contract: every user-facing string the dev adds (the email subject,
  the email body header / gap line / CTA / footer text, the new settings toggle
  label) contains NO AGENTS.md banned word. Per LESSONS#0023 instruct the
  email copy POSITIVELY ("Finish in 12 minutes" / "2 drills left"); never
  enumerate the banned tokens. (vitest: scan `buildSundayPlanPromptEmail`
  output for the banned list; scan the new settings-toggle component's rendered
  text.)
- [ ] Rate-limit: at most ONE email per `(coach_id, iso_week)` enforced by the
  `sunday_plan_prompt_<ISO-week>` bookmark. The cron is idempotent — a second
  invocation the same Sunday is a no-op for already-bookmarked coaches. There
  is at most ONE Sunday-night prompt per draft per week even if the coach has
  multiple draft plans (the cron picks the draft for the SOONEST upcoming
  session). (vitest: a coach with two drafts gets ONE email naming the
  earliest-upcoming session's draft; a second invocation the same Sunday
  sends zero new emails.)
- [ ] Failure handling: a send failure (SMTP error, missing email address)
  does NOT set the bookmark, so the next invocation retries that coach (per
  practice-reminder cron's posture). A coach with no email on file is skipped
  + counted in `skipped`, not `errors`. (vitest: a thrown sendEmail error
  leaves the bookmark unset; a coach without an email is counted as skipped.)
- [ ] Regression: the existing `/api/cron/practice-reminder`, `/api/cron/
  weekly-digest`, `/api/cron/weekly-parent-rollup`, `/api/cron/coach-quiet-
  check-in` are byte-identical. The existing `coaches.preferences` jsonb
  consumers do NOT break on the new key. The existing /plan page rendering
  for a coach who does NOT click a deep-link is byte-identical. (vitest:
  snapshot each existing cron's response shape against a fixture coach; assert
  no diff. /plan page render WITHOUT `?draftId` is byte-identical to today's
  rendering.)
- [ ] Seeded e2e on the 0006 fixture: seed extension is ONE additional draft
  `plans` row tied to the existing E2E coach + E2E team, with at least one
  upcoming session in the next 7 days. The session date is computed as
  `now() + interval '2 days'` in the seed SQL — per LESSONS#0085 / #0086,
  wrap jsonb literals correctly. UUIDs in the `0000000000b0+` range
  (LESSONS#0101). The Playwright spec invokes the cron endpoint with the test
  `CRON_SECRET`, asserts a send is logged + the bookmark is set, then visits
  `/plan?draftId=<seeded-id>` as the signed-in E2E coach, asserts the draft
  expands. Scope assertions with `data-testid` (LESSONS#0081). Skip when E2E
  creds are unset.

## Out of scope

- A second weekly nudge (e.g. Tuesday morning "your plan starts in 6 hours") —
  practice-reminder cron already covers practice-day reminders. v1 is one
  Sunday-evening prompt per coach per week.
- Auto-FINISHING the plan (AI generates the missing drill without the coach's
  tap). v1 requires the coach to tap the CTA and pick the suggestion. Auto-
  finish would destroy the voice authenticity and the AI quota economics.
- SMS / push notifications. v1 is email-only. SMS / push need their own
  AGENTS.md approval line.
- Per-team prompt (the cron sends one prompt per coach naming the soonest-
  upcoming session's team). A future ticket could fan out to per-team prompts
  for multi-team coaches.
- A "plan now" inline-edit inside the email. v1 deep-links to /plan; we do
  not embed an interactive plan editor in the email body.
- A coach-facing dashboard of "drafts you abandoned." v1 fires once per week
  via email; the dashboard surface is the existing /plan page.
- Custom prompt time per coach. v1 fires Sunday 7pm local (or 23:00 UTC for
  coaches without a timezone). A future ticket can let coaches pick.
- A separate sender/domain for the prompt email. v1 uses the existing
  `sendEmail` helper + the existing email layout / footer.
- Cross-team aggregation ("you have 3 drafts open across all your teams"). v1
  is one team, one draft, one CTA.

## Engineering notes

Files / patterns the dev should touch.

- NO migration. Reuse `coaches.preferences` for the opt-out key + the per-week
  bookmark. Per LESSONS#0009 a `plans.type` extension is NOT needed here
  (the cron reads existing drafts; the CHECK constraint is irrelevant). Assert
  the no-new-migration in the test (`fs.readdirSync('supabase/migrations')`
  count is unchanged by this ticket's PR).
- `src/lib/plan-draft-utils.ts` (new — or extend an existing module if one
  already houses the draft predicate; read first via `grep -rn "is_draft\|isDraft"
  src/lib/`) — pure `isPlanDraft(plan: Plan): boolean` and
  `summarizeDraftGap(plan: Plan): { gapCount: number; missingSegment: string |
  null }`. NO DB access. The plans page UI imports the SAME helpers so cron +
  UI never disagree on what "draft" means.
- `src/lib/sunday-plan-prompt-utils.ts` (new) — `buildSundayPlanPromptEmail({
  teamName, dayOfNextSession, gapCount, draftSnapshot, referralCode, unsubscribeUrl,
  appUrl }): { subject, html, text }` rendered via `src/lib/email/layout.ts`.
  Voice POSITIVELY per LESSONS#0023.
- `src/app/api/cron/sunday-plan-prompt/route.ts` (new) — `POST(request)`. Mirror
  `src/app/api/cron/practice-reminder/route.ts` for auth header, batched
  pagination, error counting, and the bookmark pattern. Vercel cron schedule
  configured in `vercel.json` (read first; LESSONS#0006-ish — verify the
  existing cron schedule block to coordinate).
- `vercel.json` — add the new cron entry under the existing crons array.
  Schedule: `'0 23 * * 0'` (Sunday 23:00 UTC ≈ 7pm Eastern), or per-coach
  timezone resolution if the dev decides to thread `coaches.timezone` into
  the cron's filter (preferred but not required for v1).
- `src/app/(dashboard)/account/page.tsx` (existing — read first) — add ONE
  toggle row "Sunday planning prompt" mirroring the existing practice-reminder
  toggle. POST to the existing preferences-update endpoint with key
  `disable_planning_prompts`. NO new endpoint required.
- `src/app/(dashboard)/plan/page.tsx` (existing — read first) — read
  `?draftId=<id>` from the URL search params; if present, expand the named
  draft on first render and pre-load the AI-suggest panel with the
  detected gap as the `focusSkills` input. If the draft doesn't exist or
  doesn't belong to the caller, the page falls back to the default empty
  state (no error toast; LESSONS#0036's quiet-state pattern).
- `src/lib/supabase/middleware.ts` — NO change (the cron + plan page are
  already covered by existing patterns; the cron is `/api/cron/*` which is
  auth-protected via the CRON_SECRET header, not the Supabase auth proxy).
- `tests/lib/plan-draft-utils.test.ts` (new) — `isPlanDraft` for shipped + draft
  fixtures; `summarizeDraftGap` for each gap shape.
- `tests/lib/sunday-plan-prompt-utils.test.ts` (new) — `buildSundayPlanPrompt
  Email` for fixture coaches; subject naming; banned-token scan on every output.
- `tests/api/cron-sunday-plan-prompt.test.ts` (new, `.test.ts` per LESSONS#0020
  /#38) — 401 missing secret; paused coach skipped; opted-out coach skipped;
  no-draft skipped; happy path sends + bookmarks; idempotent second invocation.
  Run under Node 20.19.0 (LESSONS#0010); run `tsc --noEmit` without piping
  (LESSONS#0095/#0096). Mock `sendEmail`. Per LESSONS#0092 / #0100, if extending
  any from-chain that has hand-rolled mock queues elsewhere, drain
  `mockReturnValueOnce` queues in `beforeEach` to avoid the LESSONS#0049 queue
  spillover.
- `tests/components/account-preferences.test.tsx` (existing — read first if a
  component test already exists for the account page; if so, extend; else
  create a thin new test) — assert the new toggle row renders + dispatches
  the preferences-update mutate.
- `tests/e2e/sunday-plan-prompt-flow.spec.ts` (new Playwright spec) against the
  0006-seeded Supabase. Seed extension: ONE draft `plans` row + ONE upcoming
  session in the next 7 days. Per LESSONS#0084 — confirm any new auth.users
  rows are seeded first (none expected, but verify). UUIDs in `0000000000b0+`
  range (LESSONS#0101). Spec: POST to the cron endpoint with the test
  CRON_SECRET, assert the response shows `sent: 1`; sign in as the E2E coach;
  navigate to `/plan?draftId=<seeded>`; assert the draft expands. Skip when
  E2E creds are unset.
- New deps: NO. Migration: NO. Env vars: NO new (the existing `CRON_SECRET`
  authorizes the cron). AI prompt change: NO (the deep-link uses the existing
  `practicePlan` prompt). Tier feature key: NO new key.
- LESSONS to anchor: #0006 / #0096 (schema wins over prose — read actual
  `PlanType` enum and `is_draft` shape at pickup), #0010 (Node 20.19.0 pin),
  #0023 (instruct positively; voice contract), #0049 / #0092 / #0100 (when
  extending a route shared with hand-rolled test mocks, update every
  `mockReturnValueOnce` queue), #0081 (data-testid scoping), #0084 / #0085 /
  #0086 (seed posture for new rows + jsonb literals + auth.users rows), #0101
  (UUID range collisions in seed.sql), #0102 (anchor faker fixtures), #0042
  (paused-coach filter via `coach-pause-utils.isCoachPaused` — reuse).
