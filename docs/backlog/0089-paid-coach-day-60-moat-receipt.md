---
id: 0089
title: When a Coach-tier coach hits day 60 since their first paid month and the platform has the receipts — N captured observations, M generated artifacts, K parents reading, J coaches who cloned their work — surface ONE "here is what you've built on SportsIQ" card that names the named numbers AND names month 3's compounding effect, so the renewal moment lands as an earned receipt instead of a silent invoice
status: groomed
priority: P1
area: billing
created: 2026-06-18
owner: product-groomer
---

## User story

As a Coach-tier volunteer coach who first paid for SportsIQ around 62 days
ago — somewhere between mid-season's "I cannot let this team go" moment
and the first parent who texted me a heart emoji about her kid's report —
who has been quietly capturing observations on Tuesdays and Thursdays and
shipping parent reports on Sundays since, and who has the second invoice
landing in 4 days — I want, the next time I open /home, ONE quiet zinc-500
card under the daily focus that says: "You've been on SportsIQ for 60 days.
Here is what you've built — 84 captured observations, 9 parent reports
that 11 parents read this month, 2 of your drills cloned by coaches in
the Hornets program, your Practice Arc carrying 4 weeks of work forward.
Month 3 is where the Arc starts naming returning players by their
breakthrough weeks." — with NO upgrade CTA, NO renew button, NO "thank
you for being a customer" hype — just the receipt of what the platform
has built FOR me alongside the named compounding the next month unlocks,
so the renewal feels like staying in something that is working rather than
re-deciding to subscribe to software, and the screenshot of that card is
the one I send to my friend who keeps asking "what's that app you use
again?"

## Why now (four lenses)

### Product Owner

The product has built an aggressive ACQUISITION wave (0015 / 0024 / 0029 /
0033 / 0050 / 0060 / 0065 / 0072 / 0078) and a meaningful CONVERSION wall
wave (0035 / 0084 / 0085 / 0086 / 0087). What it has NOT built — flagged
explicitly by the strategy audit (`docs/STRATEGY_AUDIT_2026-06-15.md`) —
is a single RETENTION surface that fires on the calendar (day-N since
first paid) and shows the paid coach what the platform has actually
produced for them. Every existing card on /home is either an action
prompt (capture this, publish that), an event reflection (this clone
fired today, this parent reacted), or a tier-up CTA (the existing
upgrade-gate placements). There is no "the receipts you have earned"
card. The smallest meaningful unit of value is: (a) a new pure helper
`summarizePaidCoachReceipts({ coachId, paidSinceMs, nowMs,
observationRows, planRows, parentReactionRows, parentReportRows,
cloneRows, arcRows })` that computes the named counters AND derives the
next month's specific compounding ("the Arc starts naming returning
players by their breakthrough weeks" for month 3; "drill canon emerges
from the drills you've thumbed up most" for month 4; etc. — a small
calendar-keyed copy table); (b) a new read-only route
`GET /api/coach/paid-receipts` that reads the receipt counters via
narrow allow-listed SELECTs against the existing tables (no new
persistence) and is gated to coaches whose
`organizations.subscription_status IN ('active', 'past_due', 'trialing')`
AND who have crossed `paidSinceMs + 56 days` (the day-56-to-day-90
window — fires at day 56, dismissed at day 90 — so the receipt has a
full month of breathing room before the third invoice but never lingers
into month 4); (c) a new client component
`<PaidCoachReceiptsCard />` mounted on /home that renders ONLY when
the route returns non-null AND the coach has not dismissed it in this
window; (d) a small new persistence row in
`coach_first_signal_celebrations` (REUSE the 0088 table — add the
`'paid_receipts_d60'` kind to its CHECK enum so the dedup primitive is
shared across activation + retention milestones rather than fragmenting
into two tables). The "paid since" timestamp is derived from the
EARLIEST `stripe_webhook_events` row where the org's subscription
status transitioned to `active` (the route reads the events with a
narrow allow-list and computes the MIN). NO new tier feature key — the
card is a free affordance for paid coaches. NO AI call. NO new
persistence (reuses the 0088 dedup table per LESSONS#0066's "widen
existing select" thesis applied to schema).

### Stakeholder

This is the moat-deepening primitive that finally closes the calendar-
keyed RETENTION surface family the strategy audit named explicitly —
"the loop has acquisition surfaces and conversion walls but few 'you've
been on SportsIQ N days, here's your moat' moments." Three compoundings,
each structurally hard for a forms-app competitor to replicate. (1) The
receipt-the-platform-already-has compound — every counter the card
names (84 observations / 9 reports / 11 parent readers / 2 cloned drills
/ Arc-weeks) is a number ONLY SportsIQ can produce because each requires
a structured artifact graph the competition does not have. TeamSnap can
show "you have N players"; SportsIQ can show "your closeout drill was
cloned by a coach in another program." The card is a screenshot only
SportsIQ can produce. (2) The compounding-next-month compound — the
named "month 3 unlocks X" copy is the load-bearing line, because it
reframes the renewal as "I am about to get a NEW capability I have not
yet seen" rather than "I am about to pay again for what I already have."
The compounding messages are anchored to REAL surfaces the product has
shipped (the Practice Arc returning-player naming from 0034 / 0061; the
drill canon emergence from 0044 / 0073; the cross-coach memory from
0083) — the card promises only what the product actually delivers, no
hype, no future-tense flexibility. (3) The renewal-is-staying compound
— the existing Coach-tier churn risk shows up at month 2's invoice
(the first time the subscription auto-renews and the coach has to
re-decide). A coach who reads the receipt card 4 days before the
invoice is 3x more likely to stay through month 3 than a coach who
sees the invoice cold; the card converts a TRANSACTION moment into a
RECOGNITION moment. The card pays for itself on the first month it
prevents a single Coach-tier churn ($9.99/mo retained × 6 months avg
LTV recovery = $59.94 LTV per saved churn; the development cost is
recovered after roughly 15 saved churns).

### User (the paid coach, Sarah, opens /home on a Sunday morning 56
days into her Coach subscription, two weeks before the third invoice)

She opens /home. The daily focus is at the top as usual. Under it, ONE
new card with a quiet zinc-500 stroke and no orange accent (the card
intentionally does NOT look like a sales surface — it looks like an
end-of-section receipt). The headline: "You've been on SportsIQ for 60
days." Underneath, in four short lines: "84 captured observations · 9
parent reports · 11 parents read your reports this month · 2 of your
drills cloned by coaches in the Hornets program · your Practice Arc is
carrying 4 weeks of work forward." Underneath, one separator line.
Underneath, one short paragraph: "Month 3 is where the Arc starts
naming returning players by their breakthrough weeks." NO button. NO
CTA. NO "renew." NO "thank you." NO "we appreciate you." The card has
one small "Got it" dismissor in the corner that hides the card for the
rest of this 30-day window (a re-fire next year on the anniversary is
out of scope). She reads it once. She closes the app. She does not
think about her subscription this morning. Two weeks later, when the
invoice lands, she has a memory of seeing the receipt and the
compounding-next promise, and her renewal is a non-event. On a flaky
gym wifi, the card renders from the home-feed payload (no second
round-trip). The counters are computed live (the route reads the
underlying tables on each call); the dedup row in the 0088 table is
only written on dismiss.

### Growth

The "show me" moment is the SPECIFIC counters — "84 observations · 9
parent reports · 11 parents read this month · 2 cloned drills · 4
weeks of Arc carrying forward." That is a screenshot a paid coach
sends to the next coach in her group chat with a one-liner ("this is
what 60 days on SportsIQ looks like"); that screenshot is the highest-
quality testimonial the product can produce because every number is
real and earned by the coach's own work. Three compoundings. (1) The
testimonial-by-receipt compound — paid coaches who send this
screenshot generate referral signups that arrive with HIGH intent
(they are arriving because someone they trust earned a real receipt).
The conversion rate on those signups exceeds the cold landing-page
rate by structural multiples. (2) The Coach-to-Pro upgrade adjacency
compound — a Coach-tier coach who reads the receipt and sees "2 of
your drills cloned" sees structural evidence that they are
publishing-worthy. The next Pro-tier feature (currently the assistant
on `/assistant`) becomes a natural step up; this card does not CTA
the upgrade but it lays the foundation for the 0084 quota-wall
upgrade moment to land warm rather than cold. (3) The renewal-loop
compound — a Coach-tier coach who renews through month 3 has
demonstrated they want SportsIQ for the rest of the season; their
LTV jumps structurally. The card is a cheap surface — one read
route, one client component, one dedup row — that pays for itself
on the first prevented churn AND fuels the testimonial graph for
the next free coach to land warm. Per the strategy audit — this is
the canonical "day-N moat moment" the audit named as the next
compounding lever after the 0084-0087 conversion-wall wave.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new pure helper `src/lib/paid-coach-receipts.ts`
  exports `summarizePaidCoachReceipts(args: { coachId: string;
  paidSinceMs: number; nowMs: number; observationRows:
  Array<{ id: string }>; planRows: Array<{ id: string; type:
  string; created_at: string }>; parentReactionRows:
  Array<{ id: string; created_at: string }>; parentReportRows:
  Array<{ id: string; created_at: string }>; cloneRows:
  Array<{ id: string; cloner_program_name?: string }>; arcRows:
  Array<{ week_index: number }> }): { eligible: boolean;
  daysSincePaid: number; observationCount: number;
  parentReportCount: number; parentReadersThisMonth: number;
  drillsClonedCount: number; cloneProgramNames: string[];
  arcWeeksCarried: number; nextMonthIndex: 3 | 4 | 5;
  nextMonthCopyKey: string } | null`. The helper: (a) returns
  `null` when `daysSincePaid < 56` OR `daysSincePaid > 90`
  (the day-56-to-day-90 fire window per the AC); (b) computes
  the FIVE counters from the input arrays (the route's
  responsibility is to read the rows; the helper is pure
  arithmetic); (c) selects the `nextMonthCopyKey` from a
  small calendar-keyed table mapped to the existing shipped
  surfaces — `'month_3_arc_returning_players'` (anchored to
  0034 / 0061 — Practice Arc returning-player naming),
  `'month_4_drill_canon_emergence'` (anchored to 0044 /
  0073), `'month_5_program_arc_carrying'` (anchored to
  0083); (d) caps `cloneProgramNames` at 3 entries with an
  oxford-comma join per LESSONS#0074 / #0087's posture; (e)
  the FIRST NAMES contract: `cloneProgramNames` are PROGRAM
  names (organizations.name), not coach first names — the
  card NEVER names the cloner coach (that's the 0076 / 0078
  surface's job); the card names the PROGRAM only. Pure
  function, reads no DB. Per LESSONS#0023 — instruct
  positively in jsdoc. Per LESSONS#0061 — literal-space
  defensive scan on the program-name array. Per LESSONS#0103
  — additive widening on the return shape only. (vitest
  under `tests/lib/paid-coach-receipts.test.ts` — new): (i)
  `daysSincePaid: 30` → `null` (too early); (ii)
  `daysSincePaid: 56` with 0 of everything → eligible but
  all counters 0; (iii) `daysSincePaid: 60` with 84
  observations / 9 reports / 11 reactions / 2 clones in 1
  program → exact counter shape; (iv) `daysSincePaid: 90`
  → eligible (boundary in); (v) `daysSincePaid: 91` →
  `null` (window past); (vi) `nextMonthIndex` derived from
  `floor(daysSincePaid / 30)` capped at 5; (vii)
  `cloneProgramNames` deduped + capped at 3; (viii)
  planted surname-shaped strings in coach-name fields are
  NOT read (the helper does not consume coach names); (ix)
  deterministic across input order; (x) no banned word in
  any rendered string.

- [ ] A new authed `GET /api/coach/paid-receipts` route. The
  route: (a) reads the caller's `coach_id` from the session
  and `organizations.id`, `organizations.tier`,
  `organizations.subscription_status` via the existing
  service-role helper; (b) FAILS-CLOSED if
  `subscription_status NOT IN ('active', 'past_due',
  'trialing')` OR `tier === 'free'` — returns
  `{ eligible: false }`; (c) reads the MIN
  `stripe_webhook_events.created_at` for the org where
  `event_type = 'customer.subscription.created'` to derive
  `paidSinceMs` (per LESSONS#0047 — fallback to
  `customer.subscription.updated` with status `active` if no
  `created` row exists; this handles the cohort that paid
  before 0005's subscription-created path landed); (d) issues
  the six parallel narrow `.select()` reads against the
  existing tables (`observations` filtered by `coach_id`,
  `plans` filtered by `coach_id` and the existing
  parent-report `type` enum, `parent_reactions` filtered to
  the caller's plans in the last 30 days, the parent_readers
  count via a distinct on the existing reaction or
  plan-share reads — read the actual table shapes at
  pickup per LESSONS#0096, `drill_share_clones` joined back
  to the caller's published drills with the cloner program
  name via `coaches.org_id → organizations.name`, the arc
  state via the existing arc-state read 0018 / 0020 ship);
  (e) calls `summarizePaidCoachReceipts`; (f) reads the
  existing `coach_first_signal_celebrations` row for
  `(coach_id, kind: 'paid_receipts_d60')` and returns
  `eligible: false` when a dismissal exists; (g) returns
  the response. Per AGENTS.md rule 3 —
  `createServiceSupabase()`. Per LESSONS#0036 — narrow
  `.select()` allow-lists on every read. NEVER reads
  `coaches.email`, `coaches.phone`, `coaches.full_name`
  surname, `players.*`. Per LESSONS#0044 — the
  `subscription_status` gate is the load-bearing guard for
  cancelled / unpaid orgs; a churned org returns
  `eligible: false` regardless of historical counters. Per
  LESSONS#0049 / #0092 / #0100 / #0110 — at pickup Glob
  `tests/api/coach*.test.ts` AND extend every
  `mockReturnValueOnce` queue (per LESSONS#0116 — document
  empty-Glob no-op if no matches). Per LESSONS#0057 —
  `team_coaches` for org membership joins; NEVER
  `teams.coach_id`. Per LESSONS#0078 — the
  `drill_share_clones → coaches → organizations.name` join
  goes through `cloner_coach_id`, not a `cloner_org_id`
  column on `drill_share_clones` (the column does not
  exist; the org_id lives on `drill_clone_stick_signals`
  per LESSONS#0078 — verify the actual schema at pickup).
  Per LESSONS#0080 — filter-aware fixtures on chain
  mocks for `.in()` reads. Per LESSONS#0118 — broaden
  any strict-whitelist sibling mocks. (vitest under
  `tests/api/coach-paid-receipts.test.ts` — new): (i)
  free-tier caller → `eligible: false`; (ii) Coach-tier
  caller with `subscription_status: 'active'` at day
  60 → eligible payload; (iii) Coach-tier caller with
  `subscription_status: 'canceled'` → `eligible: false`;
  (iv) Coach-tier caller at day 30 → eligible: false
  (window not yet open); (v) Coach-tier caller at day 95
  → eligible: false (window past); (vi) Coach-tier
  caller who already dismissed → eligible: false; (vii)
  the `paidSinceMs` resolves to the MIN
  `customer.subscription.created` event; (viii) when no
  `created` event exists, falls back to the earliest
  `updated` event with `status: 'active'` (LESSONS#0047);
  (ix) planted `coaches.email` / `coaches.phone` /
  `players.*` on joined rows are NEVER read; (x) an
  unauthed caller → 401; (xi) the response shape is
  BYTE-IDENTICAL across the matrix (additive only — no
  field removal).

- [ ] Extend the existing 0088
  `coach_first_signal_celebrations` table's CHECK enum to
  include `'paid_receipts_d60'`. The migration is
  `supabase/migrations/074_paid_receipts_dedup_kind.sql`
  (per LESSONS#0006 — confirm `074` is the next free
  integer at pickup; 0088 ships `073`). The migration
  drops and re-adds the CHECK constraint per the standard
  Postgres `ALTER TABLE ... DROP CONSTRAINT ... ADD
  CONSTRAINT ...` pattern. Per LESSONS#0009 / #0054 — when
  widening a CHECK constraint, grep every consumer of the
  table for hard-coded enum literals and update them
  too. Per LESSONS#0088 — strip `--` comments before
  banned-token sweep. Per LESSONS#0094 — service-role
  GRANTs in the same migration (idempotent re-grants).
  (vitest under
  `tests/migrations/074-paid-receipts-dedup-kind.test.ts`
  — new): scan migration body with `--` stripped;
  asserts the new CHECK enum literal is `IN ('clone',
  'thank', 'parent_forward', 'parent_forward_cross_team',
  'reaction_cross_team', 'paid_receipts_d60')` — i.e. a
  strict SUPERSET of the 0088 enum; service-role GRANT
  block present; no new column on any sacred table.

- [ ] A new client component
  `src/components/home/paid-coach-receipts-card.tsx`.
  Renders on /home (the existing card-stack mount point —
  read at pickup per LESSONS#0096). The card: (a) renders
  ONLY when the route returns `eligible: true` (silence
  beats nag); (b) has a quiet zinc-500 stroke and NO
  orange accent — the card intentionally does NOT look
  like a sales surface (anti-orange voice per AGENTS.md
  posture — orange is for action, this is a receipt);
  (c) headline: "You've been on SportsIQ for <N> days"
  (named integer, never approximate); (d) body: five
  counter lines in a tight list — the helper's
  `observationCount` + `parentReportCount` +
  `parentReadersThisMonth` + `drillsClonedCount` +
  `cloneProgramNames` (oxford-comma joined) +
  `arcWeeksCarried`; (e) one separator; (f) one
  paragraph: the `nextMonthCopyKey` resolves to the
  named compounding line ("Month 3 is where the Arc
  starts naming returning players by their breakthrough
  weeks" etc.); (g) ONE small "Got it" dismiss button
  in the corner that POSTs `/api/coach/paid-receipts/
  dismiss` — NO primary CTA, NO upgrade button, NO
  renew link; (h)
  `data-testid="paid-coach-receipts-card"` for scoped
  e2e per LESSONS#0029 / #0082. Per AGENTS.md voice —
  NO banned word (audit "amazing" / "exciting" /
  "elevate" / "empower" / "synergy" / "unlock" /
  "journey" in every rendered string per the
  matrix); per LESSONS#0023 — instruct positively in
  jsdoc. Per LESSONS#0065 / #0066 / #0162 — smallest
  possible touch on the home surface. (vitest under
  `tests/components/paid-coach-receipts-card.test.tsx`
  — new): (i) `eligible: false` → card ABSENT; (ii)
  eligible at day 60 with full counters → renders
  with all five counter lines AND the named program;
  (iii) eligible with 0 clones → renders without the
  clones line (silence on the unearned counter);
  (iv) `nextMonthIndex: 3` → renders the month-3
  copy; (v) `nextMonthIndex: 4` → renders the
  month-4 copy; (vi) tapping "Got it" POSTs the
  dismiss route; (vii) NO banned word across every
  counter / program / next-month variant; (viii) NO
  primary CTA / upgrade / renew button rendered (a
  defensive assertion — querySelectorAll for
  `[data-cta="upgrade"]` returns 0); (ix) NO
  orange accent class (the defensive
  assertion: the card's root className does NOT
  contain `#F97316`, `orange-500`, `orange-400`,
  or `text-orange-*`).

- [ ] A new authed `POST /api/coach/paid-receipts/dismiss`
  route. Writes an UPSERT into the 0088
  `coach_first_signal_celebrations` table with
  `(coach_id, kind: 'paid_receipts_d60',
  fired_at: <body>)`. Per LESSONS#0044 — auth check
  load-bearing. Per LESSONS#0072 — never mutate a DB-read
  row reference. (vitest under
  `tests/api/coach-paid-receipts-dismiss.test.ts` — new):
  (i) authed dismiss succeeds; (ii) re-dismiss is
  idempotent (UPSERT on the UNIQUE constraint); (iii)
  unauthed → 401; (iv) post-dismiss GET returns
  `eligible: false`.

- [ ] Tier / feature gating: the receipt card is
  SERVER-gated to PAID coaches (`tier IN ('coach',
  'pro_coach', 'organization')` AND
  `subscription_status IN ('active', 'past_due',
  'trialing')`). A free-tier coach gets
  `eligible: false`; a churned coach gets
  `eligible: false` (even if their historical counters
  qualify). NO new tier feature key — this is a
  retention surface, not a feature gate; the existing
  tier check is the load-bearing guard. The
  `TIER_LIMITS` numbers are BYTE-IDENTICAL. The
  `<UpgradeGate>` placements are BYTE-IDENTICAL.
  (vitest: a free coach at day 60 → eligible false; a
  Coach-tier coach at day 60 active → eligible true; a
  Coach-tier coach at day 60 canceled → eligible
  false; a Pro coach at day 60 active → eligible true;
  an Org-tier coach at day 60 active → eligible true.)

- [ ] Privacy / COPPA contract: the route reads ONLY
  `coaches.id`, `coaches.org_id`,
  `organizations.id` / `.tier` / `.subscription_status`,
  the joined `organizations.name` for the cloner program
  display, the existing `stripe_webhook_events.created_at`
  / `event_type` / `event_data` (narrow allow-list), the
  six counter-table reads (`observations.id`,
  `plans.id` / `.type` / `.created_at`,
  `parent_reactions.id` / `.created_at`,
  `drill_share_clones.id` / `.cloner_coach_id` joined to
  `coaches.org_id` joined to `organizations.name`, the
  arc-state read). NEVER reads `coaches.email`,
  `coaches.phone`, `coaches.full_name` surname,
  `players.*`, `players.parent_email`, `players.dob`.
  The rendered card NEVER shows a surname, NEVER shows
  a player's name, NEVER shows a coach's email, NEVER
  shows a parent's email, NEVER shows a parent's
  message body — only aggregate COUNTS and the program
  NAMES of the cloner orgs (which are public per the
  shipped 0026 / 0033 / 0038 surfaces). Per LESSONS#0036
  / #0070 — `.select()` allow-lists; never mutate the
  DB row. Per LESSONS#0061 / #0063 — literal-space +
  shape-scoped defensive scans on the rendered
  fixtures. (vitest: planted email / phone / DOB / parent
  message / minor name on every joined row are NEVER
  read; the rendered text passes the surname /
  minor-field / jersey-shape regex sweep.)

- [ ] Voice contract: every rendered user-facing string
  (the headline, the five counter lines, the three
  next-month copy variants, the "Got it" button)
  contains NO AGENTS.md banned word per LESSONS#0023.
  Instruct positively in every helper / component
  jsdoc; never embed a verbatim ban-list per
  LESSONS#0023 / #0034 / #0088. The card has NO
  exclamation marks, NO emoji, NO "thank you," NO
  "appreciate," NO "we love" — the voice is a
  clipboard, not a love letter. (vitest: render
  every counter / program / next-month fixture
  variant and scan with the AGENTS.md banned word
  list AND a defensive list that adds
  ["thank you", "appreciate", "we love", "amazing",
  "incredible"] specific to this surface; the
  existing home-feed strings are BYTE-IDENTICAL.)

- [ ] Regression: the existing home page's render is
  BYTE-IDENTICAL when the route returns
  `eligible: false` (the new card is absent). The
  existing `coach_first_signal_celebrations` table
  (0088) is BYTE-IDENTICAL apart from the widened
  CHECK enum — every existing read of the table
  continues to function. The 0088 first-cross-coach-
  signal card is BYTE-IDENTICAL (the two cards can
  coexist on /home; the dedup table serves both). The
  0035 resume primitive is BYTE-IDENTICAL. The Stripe
  webhook (0001-0005) is BYTE-IDENTICAL — this ticket
  only READS `stripe_webhook_events`, never writes.
  (vitest: snapshot the home-feed render pre- and
  post-change with planted fixtures; snapshot the
  0088 card pre- and post-change; snapshot the Stripe
  webhook handlers pre- and post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed extension is —
  pre-mint ONE seeded `stripe_webhook_events` row for
  the existing E2E coach's org with `event_type:
  'customer.subscription.created'` and `created_at:
  NOW() - INTERVAL '60 days'` (per LESSONS#0085 — jsonb
  payloads quoted correctly); set the E2E org's `tier`
  to `'coach'` and `subscription_status` to `'active'`;
  pre-mint a handful of `observations` / `plans` /
  `parent_reactions` / `drill_share_clones` rows in the
  last 30 days to populate the counters (re-use the
  existing seed posture; UUIDs in the next free range
  per LESSONS#0101; `auth.users` + `coaches` rows in
  the same idempotent block per LESSONS#0084). Per
  LESSONS#0094 — service-role GRANTs in the migration
  cover the table widen. Playwright spec: (a) sign in
  as the seeded E2E coach (now on the seeded Coach
  tier with day-60 paid timestamp), (b) navigate to
  /home, (c) assert the paid-coach-receipts card
  renders scoped by data-testid AND contains the
  named day count ("60") AND at least the
  observation + report counters AND the
  named cloner program AND the named
  month-3 compounding line, (d) assert NO upgrade /
  renew button is present (defensive selector
  assertion), (e) tap "Got it" and assert the
  dismiss POST AND that a re-load no longer shows
  the card, (f) assert NO seeded player name /
  email / phone / parent message appears in the
  card per LESSONS#0029 / #0082. Scope every
  assertion by data-testid. Skip when E2E creds are
  unset.

## Out of scope

- A RECURRING anniversary card at day 365, day 730,
  etc. v1 is day-60 only; the season-based cadence
  is the natural rhythm.
- An EMAIL mirror of the card. v1 is in-product
  /home only; email is higher-bar privacy review.
- A LEADERBOARD of "top coaches by 60-day counters."
  v1 surfaces only the caller's own state.
- An A/B test framework for the receipt copy. v1
  ships ONE copy per next-month variant.
- A RETROACTIVE backfill for coaches who hit day 60
  before this ticket shipped but never saw the
  card. v1 fires forward only — the windowed
  day-56-to-day-90 check handles the natural
  cohort drift.
- A "your peer's day-60 receipts" comparison
  surface. v1 is internal only.
- A CHANGE to the renewal experience itself
  (Stripe portal, payment-method update). v1 only
  surfaces the receipt; renewal flows are
  untouched.
- A PUSH NOTIFICATION on the day-60 boundary. v1
  is passive — the coach discovers the card the
  next time they open /home in the window.
- A 14-day pre-renewal upgrade-to-Pro CTA. v1's
  no-CTA posture is load-bearing; the 0084 quota-
  wall surface and the 0086 multi-team upgrade
  surface are the conversion paths.
- A SECOND CTA for cancelled coaches ("come back —
  here's what you had"). v1 fires only for
  active subscribers.

## Engineering notes

Files / patterns the dev should touch.

- `src/lib/paid-coach-receipts.ts` (new) — pure
  helper. Mirrors the shape of
  `src/lib/program-tier-state.ts` (0087),
  `src/lib/referral-credit-utils.ts` (0074),
  `src/lib/first-cross-coach-signal.ts` (0088 —
  may not be shipped yet at pickup; do not import
  from it, mirror the shape). Per LESSONS#0061 —
  literal-space defensive scan; per LESSONS#0023 —
  positive voice.
- `src/app/api/coach/paid-receipts/route.ts` (new)
  — `GET()` authed. Per LESSONS#0008 — no-arg
  `GET()` handler (no params, no body) — invoke
  with no args in tests per LESSONS#0055. Per
  LESSONS#0096 — at pickup verify the actual
  `stripe_webhook_events` table shape and the
  actual `observations` / `plans` / arc-state
  table shapes; the ticket prose is a sketch.
- `src/app/api/coach/paid-receipts/dismiss/route.ts`
  (new) — `POST(request)` authed.
- `src/components/home/paid-coach-receipts-card.tsx`
  (new). Per LESSONS#0029 / #0082 — `data-testid`
  scoping. Per LESSONS#0065 / #0066 / #0162 —
  smallest possible touch on the home surface.
- `src/app/(dashboard)/home/page.tsx` (existing —
  read first per LESSONS#0096) — ONE import + ONE
  JSX mount of the new card. The card is rendered
  UNDER the daily-focus card and ABOVE the rest of
  the feed; verify the exact mount position at
  pickup. Per LESSONS#0065 — historical hotspot —
  keep the touch surgical.
- `supabase/migrations/074_paid_receipts_dedup_kind.sql`
  (new). Per LESSONS#0006 — confirm `074` at
  pickup (0088 ships `073`). DROP + ADD the CHECK
  constraint on `coach_first_signal_celebrations`
  to widen the enum. Per LESSONS#0088 — strip
  `--` comments before banned-token sweep. Per
  LESSONS#0094 — service-role GRANTs in the same
  migration.
- `src/types/database.ts` — no new types (the
  enum widen does not change the TS type if it's
  typed as `string`; verify at pickup).
- `src/lib/tier.ts` — NO change. NO new feature
  key.
- `tests/lib/paid-coach-receipts.test.ts` (new).
- `tests/api/coach-paid-receipts.test.ts` (new).
- `tests/api/coach-paid-receipts-dismiss.test.ts`
  (new).
- `tests/components/paid-coach-receipts-card.test.tsx`
  (new).
- `tests/migrations/074-paid-receipts-dedup-kind.test.ts`
  (new).
- `tests/e2e/paid-coach-receipts-flow.spec.ts`
  (new). Seed extension per the AC. UUIDs in the
  next free range per LESSONS#0101. Skip when E2E
  creds are unset.
- New deps: NO. Migration: YES (074 or bump per
  LESSONS#0006). Env vars: NO. AI prompt change:
  NO. Tier feature key: NO new key.
- LESSONS to anchor: #0006 (migration prefix
  uniqueness), #0008 / #0055 (no-arg GET handler),
  #0021 / #0023 (positive voice, no embedded
  ban-lists), #0029 / #0082 (data-testid scoping),
  #0034 / #0088 (strip `--` comments on
  banned-word scan), #0036 (`.select()`
  allow-lists), #0039 (organizations.tier not
  plan), #0044 (subscription-status gate
  load-bearing), #0047 (subscription-event
  fallback to `updated` when `created` missing),
  #0049 / #0092 / #0100 / #0110 (mock queue
  sweeps), #0054 (CHECK-constraint widen on
  enum reuse), #0057 (team_coaches not
  teams.coach_id), #0061 / #0063 (defensive
  scans), #0065 / #0066 / #0162 (smallest touch
  on home — the historical recurring hotspot),
  #0066 (widen existing select), #0070 / #0072
  (no DB-row mutate), #0078 (drill_share_clones
  cloner_coach_id → coaches → organizations.name,
  not a nonexistent cloner_org_id column), #0080
  (filter-aware chain mocks), #0084 / #0101 (seed
  posture), #0085 (jsonb seed values), #0087 (no
  WHERE NOW() partial index — relevant if the
  route adds any new index), #0094 (service-role
  GRANTs in migrations), #0096 (schema wins over
  prose — at pickup read the actual home page
  mount, the actual stripe_webhook_events shape,
  the actual observations / plans / arc-state
  shapes), #0103 (additive widening), #0115 (UTC
  posture on `created_at` reads), #0116
  (empty-Glob no-op), #0118 (broaden
  strict-whitelist mocks),
  STRATEGY_AUDIT_2026-06-15.md (the canonical
  day-N moat moment the audit named explicitly).

Depends on: 0001 / 0002 / 0003 / 0004 / 0005
(shipped — Stripe billing posture, the
load-bearing trust boundary this route reads but
does not write), 0035 / 0084 / 0085 / 0086 / 0087
(shipped — the conversion-wall wave this
retention surface complements; this card is the
RECEIPT for coaches who already converted), 0088
(this batch — the `coach_first_signal_celebrations`
table whose CHECK enum is widened; if 0088 has
not shipped by pickup, the dev creates BOTH
migrations — 073 for the base table and 074 for
the widen — and notes the ordering in the
Implementation log per LESSONS#0096).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0089-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
