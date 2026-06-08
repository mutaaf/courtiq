---
id: 0074
title: When a coach hits 3 successful referrals — converted coaches who shipped real plans — credit one real free month on their next Stripe invoice and tell them by name who earned it
status: shipped
priority: P1
area: billing
created: 2026-06-07
owner: product-groomer
---

## User story

As a paying volunteer coach who has invited my assistant coach (0015),
forwarded a season recap to a friend in the next town's program (0017),
and dropped a coach-card in the league text thread (0010) — and who has
already been told three times via the 0047 celebration card that "Coach
Maya you invited just joined" — I want, the FIRST time three of those
invited coaches have themselves shipped real work (a parent report, a
practice plan, or 5+ observations on a team they actually run, not a
ghost signup), the next Stripe invoice on my Coach tier subscription
to credit me ONE FREE MONTH automatically, with one card on /home that
names the three coaches who earned it for me — "Maya, James, and Lin
each ran a real practice with SportsIQ this month; your Coach
subscription is free for the next 30 days" — so the referral graph I
have been building stops being a social signal that adds nothing to my
bottom line and starts being the only word-of-mouth youth-sports
coaching app where the people who refer most pay the least.

## Why now (four lenses)

### Product Owner

The product has shipped the full social-attribution stack for
referrals: 0011 / 0015 / 0017 / 0021 / 0026 / 0027 / 0029 / 0033 / 0047
/ 0054 / 0060 / 0065 push the link, attribute the converted coach to
the inviter via `coaches.preferences.referred_by_code`, and (0047)
celebrate the conversion in-app to re-fire the next invite. NONE of
them turn a successful referral into MONEY. The 0047 ticket is
explicit that "the data is already attributed" — but no shipped
ticket touches `subscriptions` or `invoices` to convert that
attribution into a real billing event. The smallest meaningful unit of
value is: (a) a new pure helper `countQualifiedReferrals(args)` that
walks every coach whose `coaches.preferences.referred_by_code` equals
the caller's deterministic `makeReferralCode(coachId)` and counts the
ones who meet a QUALIFICATION bar (the converted coach has shipped at
least ONE structured artifact — parent_report / practice_plan /
weekly_pulse / game_recap — OR has logged `>= 5` observations on a
team they head-coach; the bar is the load-bearing anti-abuse contract
— a ghost signup does not earn the inviter a free month); (b) when
the count crosses 3 for the FIRST time for an inviter on a paid tier
(coach / pro_coach), a NEW route `POST /api/billing/apply-referral-
credit` writes a Stripe customer balance credit equal to one month at
the inviter's current tier price and records the credit in a new
`referral_credit_grants` table; (c) ONE in-app card on /home names the
three coaches by FIRST NAME (consent posture: the converted coaches
ARE on the product and they DID sign up via the inviter's link — their
first name on the inviter's celebration card is the same attribution
posture 0047 already ships) and renders the dollar amount of the
credit + the new period-end date pulled from Stripe; (d) the credit
fires ONCE per `(inviter_coach_id, milestone_kind)` — the
milestone_kind enum is `clones_3 / clones_10 / clones_25` so future
milestones do not require a new migration. NO new AI generation, NO
public surface, NO tier-gate change beyond the new credit flow only
firing for paid inviters (a free-tier inviter who hits 3 qualified
referrals gets the SAME card with "your next 30 days of Coach is on
us — upgrade to redeem" — the 0035 inline-upsell shape).

### Stakeholder

This is the moat-deepening primitive that turns the 7+ shipped
referral surfaces into a self-funding acquisition engine and is the
billing-side companion to 0047. Three compoundings, all structurally
hard for a forms-app competitor because they require BOTH a real
attribution graph AND a real Stripe billing rail. (1) The CAC moat —
a coach who has earned a free month from 3 qualified referrals has
a referral CAC of $0 for those three coaches AND has paid the next
referral's CAC out of their own subscription value, which is the
shape every successful word-of-mouth product converges on. (2) The
retention moat — a coach who is credited a free month is structurally
unlikely to cancel during that month (the cancellation moment is
the first paid invoice after the credit runs out, by which point
they have shipped another month of artifacts that re-anchor the
value); the existing 0004 past-due flow continues to handle the
edge case of a credit-exhausted past-due coach. (3) The anti-abuse
moat — the QUALIFICATION bar (real shipped artifact OR 5 logged
observations on a head-coached team) means a coach cannot grind
their own free months by creating ghost accounts; the bar is the
load-bearing contract that the referral graph stays honest. Per
LESSONS#0044 — the Stripe customer balance credit is preserved
across `customer.subscription.deleted` so a coach who pauses and
re-subscribes within 90 days still has their earned credit
available. Distinct from 0047 (the social celebration), 0015 / 0024
(the invite mechanics), 0021 (the warm landing), 0029 (the observer
→ coach conversion), 0060 / 0065 (parent → other-coach / coach →
director). THIS is the first ticket that turns any of those into a
billing line.

### User (the inviting coach, Sarah, Thursday 7:11pm, on the Coach
tier, has invited 5 coaches over 3 weeks)

She opens SportsIQ to look at next week's practice. At the top of
/home: a small card with a quiet orange accent and a real dollar
amount: "Maya, James, and Lin each ran a real practice with
SportsIQ this month — your next month of Coach is on us ($9.99
credited to your next invoice). Period end: July 8." Below, ONE
button: "See my next invoice" (deep-links to the existing Stripe
customer portal). She does NOT need to do anything — the credit is
already applied. She taps the button anyway because she wants to
see it. The Stripe portal opens and the credit line is there:
"-$9.99 SportsIQ referral credit (Maya G., James K., Lin T.)." She
closes it. She goes back to her practice plan. The next morning she
texts a coaching friend in the next town: "btw I just got a free
month on this — invite a couple coaches and you do too." She drops
the existing 0015 invite link. Total elapsed time on her side: 35
seconds; total dollar value earned: one month of Coach. The card
auto-dismisses on view (the next milestone — 10 qualified referrals
— fires the next card, never on every clone).

### User (the converted coach, Maya, who shipped her first parent
report this week)

She does not see anything. The qualification signal — her first
shipped parent_report row — fires on the BACKEND and credits Sarah,
the coach who invited her. Maya's own /home is BYTE-IDENTICAL to
today. The QUALIFICATION bar is invisible to her by design — telling
the converted coach "you are now qualifying your inviter for a
credit" would change her behavior and is a separate consent surface.
Her first name (Maya) appears on Sarah's celebration card because
Sarah ALREADY KNOWS Maya signed up (0047 told her so) — the credit
card just names the three who crossed the bar, not "Maya signed up"
(0047 already did that).

### Growth

The "show me" moment is the CARD on Sarah's /home — "$9.99
credited; Maya, James, and Lin each ran a real practice." That
single card, with a real dollar amount, is the screenshot another
coach in the same league looks at and says "wait, you can earn this
back?" The viral compound is asymmetric in the right way: every
credited coach is BOTH a re-firer of the invite loop AND a now-
zero-CAC subscriber for the inviter's earned month. Compounds three
ways. (1) The CAC compound — every earned month is a marketing
spend that did not happen on a paid channel. (2) The retention
compound — credited months are the months coaches do not cancel
because the rate of decision-to-cancel is heavily front-loaded on
the first paid renewal post-credit, by which time the next set of
referrals can fire. (3) The cross-tier conversion compound — the
free-tier coach who hits 3 qualified referrals sees the same card
with "$9.99 of Coach is on us — upgrade to redeem" which is the
WARMEST upgrade-pull the product can ship (they have already
PROVEN they invite, and the credit is waiting for them). Distinct
from every shipped surface because no shipped surface has touched
Stripe customer balance OR introduced a qualification bar on the
referral graph. The 0042 / 0072 reactivation surfaces handle the
retention-loss edge; this handles the retention-gain edge.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `066_referral_credit_grants.sql` adds the
  table `referral_credit_grants (id UUID PRIMARY KEY DEFAULT
  gen_random_uuid(), inviter_coach_id UUID NOT NULL REFERENCES
  coaches(id) ON DELETE CASCADE, milestone_kind TEXT NOT NULL
  CHECK (milestone_kind IN ('qualified_3', 'qualified_10',
  'qualified_25')), qualified_referral_coach_ids UUID[] NOT
  NULL, credit_amount_cents INT NOT NULL CHECK
  (credit_amount_cents > 0 AND credit_amount_cents <= 10000),
  credit_currency TEXT NOT NULL DEFAULT 'usd',
  stripe_customer_balance_txn_id TEXT NULL, granted_at
  TIMESTAMPTZ NOT NULL DEFAULT NOW(), redeemed_period_end
  TIMESTAMPTZ NULL, notified_at TIMESTAMPTZ NULL, UNIQUE
  (inviter_coach_id, milestone_kind))`. Indexes:
  `(inviter_coach_id, notified_at) WHERE notified_at IS NULL`;
  `(stripe_customer_balance_txn_id) WHERE
  stripe_customer_balance_txn_id IS NOT NULL`. NO column on
  `coaches`, `organizations`, `players`, `teams`, `plans`,
  `observations`. Per LESSONS#0006 — at pickup confirm `066`
  is the next free integer (latest seen: `065` from 0073);
  bump if needed. Per LESSONS#0088 — strip `--` comments
  before banned-token sweep. The `qualified_referral_coach_ids`
  column is an array of coach UUIDs (the three who crossed
  the bar at the moment the milestone fired) — load-bearing
  for the audit trail per LESSONS#0044's billing-immutability
  norm. (vitest under
  `tests/migrations/066-referral-credit-grants.test.ts`:
  scan migration body with `--` stripped; column allow-list;
  CHECK constraints; both indexes; UNIQUE constraint; NO new
  column on any sacred table; the qualified-coach-ids column
  type is UUID[], not text.)

- [ ] A new pure helper `src/lib/referral-credit-utils.ts`.
  Exports `countQualifiedReferrals(args: { inviterCoachId:
  string; convertedCoachRows: Array<{ id: string;
  shipped_artifact_count: number;
  head_coached_observation_count: number }>; nowMs: number }):
  { count: number; qualifiedCoachIds: string[] }`. The helper:
  (a) filters the converted-coach rows whose
  `shipped_artifact_count >= 1` OR
  `head_coached_observation_count >= 5` (the QUALIFICATION
  bar); (b) returns the count + the list of qualified coach
  ids; (c) the cap on the returned list is 100 (defensive).
  Pure function, reads no DB. Per LESSONS#0023 — no banned-
  word scan needed. (vitest under
  `tests/lib/referral-credit-utils.test.ts` — new): (i) no
  converted coaches → count 0; (ii) 3 converted, none past
  the bar → count 0; (iii) 3 converted, all past the bar
  via shipped_artifact_count → count 3 with ids; (iv) 3
  converted, all past the bar via head_coached_observation
  → count 3; (v) 5 converted, mix → only qualified
  returned; (vi) deterministic across input order.

- [ ] A new `GET /api/coach/referral-credit-status` (new,
  authed) returns the caller's referral credit state. The
  route: (a) reads
  `from('coaches').select('id').eq('preferences->>referred_by_code', makeReferralCode(user.id))`
  (the existing referral-graph lookup pattern; read the
  exact JSONB selector at pickup per LESSONS#0096 — the
  0047 ticket's payload posture is the reference); (b) for
  each referred coach, reads their shipped-artifact count
  via `from('plans').select('id, type', { count: 'exact',
  head: true }).eq('coach_id', referredId).in('type',
  QUALIFYING_ARTIFACT_TYPES)` where
  QUALIFYING_ARTIFACT_TYPES is the literal const
  `['parent_report', 'practice_plan', 'weekly_pulse',
  'game_recap']` (named in `src/lib/referral-credit-
  utils.ts` so the QUALIFICATION bar lives in ONE place);
  (c) for each referred coach, reads their head-coached
  observation count via `from('observations').select('id',
  { count: 'exact', head: true }).eq('coach_id',
  referredId)` joined through the head-coach check on
  `team_coaches` per LESSONS#0057; (d) calls
  `countQualifiedReferrals`; (e) returns
  `{ qualifiedCount, qualifiedCoachFirstNames:
  string[], nextMilestoneAt, currentMilestone,
  pendingCreditCents }`. The
  `qualifiedCoachFirstNames` field is the FIRST NAMES
  of the most-recent 3 qualified coaches (the same
  consent posture as 0047 — first name only, no
  surname, no team name, no email). Per LESSONS#0036 —
  `.select()` allow-lists; NEVER reads parent contact,
  DOB, jersey numbers. Per LESSONS#0049 / #0092 /
  #0100 / #0110 — Glob `tests/api/referral*.test.ts`
  AND `tests/api/coach/referral*.test.ts` at pickup
  and extend every queue. Per LESSONS#0061 — defensive
  surname-strip on first-name returns (literal space,
  not `\s+`). (vitest under `tests/api/coach-referral-
  credit-status.test.ts` — new): (i) 0 referrals →
  `{ qualifiedCount: 0, qualifiedCoachFirstNames: [],
  currentMilestone: null }`; (ii) 3 qualified
  referrals → `{ 3, [Maya, James, Lin],
  currentMilestone: 'qualified_3', pendingCreditCents
  > 0 }`; (iii) 12 qualified → currentMilestone is
  `qualified_10`; (iv) the first-name list is capped
  at 3 and surname-stripped; (v) planted DOB /
  parent_phone on the referred coaches' rows are
  NEVER read; (vi) an unauthed caller → 401.

- [ ] A new `POST /api/billing/apply-referral-credit`
  (new, authed) applies the credit for the caller's
  current milestone if not already granted. The route:
  (a) calls the GET shape above to determine the
  current milestone; (b) if `currentMilestone` is null
  or already granted (a row exists in
  `referral_credit_grants` for `(user.id,
  currentMilestone)`), returns `200 { already: true }`;
  (c) reads `organizations.stripe_customer_id` AND
  `organizations.tier` for the caller's org (per the
  existing billing posture); (d) if the caller's tier
  is `free`, the route writes a `referral_credit_grants`
  row with `stripe_customer_balance_txn_id = NULL` and
  `credit_amount_cents` set to the COACH-tier monthly
  price in cents (the "pending — upgrade to redeem"
  shape), and returns `200 { pending: true,
  pendingUntilUpgrade: true }`; (e) if the caller's
  tier is paid AND has a stripe_customer_id, the
  route calls the Stripe customer balance API
  (`stripe.customers.createBalanceTransaction(customerId,
  { amount: -<creditAmountCents>, currency: 'usd',
  description: 'SportsIQ referral credit for
  <milestone_kind>' })` — Stripe's
  createBalanceTransaction with a NEGATIVE amount
  applies a credit per LESSONS#0044's billing
  immutability path) and writes a
  `referral_credit_grants` row with the returned
  transaction id. (f) Per AGENTS.md — Stripe init
  goes through the lazy `getStripe()` factory, never
  `new Stripe()` at module top. (g) Per LESSONS#0014
  — the webhook signature verification posture is
  unchanged (this route is a coach-initiated POST,
  not a webhook). (vitest under
  `tests/api/billing-apply-referral-credit.test.ts`
  — new): (i) a paid-tier coach with 3 qualified
  referrals and no prior grant → Stripe credit
  applied, row written, returns
  `{ creditAmountCents, stripeTxnId, redeemed:
  true }`; (ii) a paid-tier coach with the same
  milestone already granted → `200 { already: true
  }`, no Stripe call; (iii) a free-tier coach with
  3 qualified referrals → `200 { pending: true }`,
  row written with `stripe_customer_balance_txn_id:
  null`; (iv) a coach with 2 qualified referrals →
  `200 { eligible: false }`, no row written; (v)
  a Stripe failure → 500 + NO row written (the
  grant only persists when the Stripe credit
  persists; per LESSONS#0044 billing immutability);
  (vi) an unauthed caller → 401; (vii) the
  `getStripe()` factory is used (lazy, not module-
  top); (viii) the Stripe call uses the negative-
  amount-on-balance pattern.

- [ ] A new `<ReferralCreditCard />` mounted on /home
  (existing — read at pickup per LESSONS#0096). The
  card renders when the GET status route returns
  `qualifiedCount >= 3 AND currentMilestone is
  unconsumed`. Copy variant ONE (paid tier): "<First1>,
  <First2>, and <First3> each ran a real practice with
  SportsIQ this month — your next month of Coach is on
  us ($X.XX credited). Period end: <date>." Copy
  variant TWO (free tier): "<First1>, <First2>, and
  <First3> each ran a real practice with SportsIQ this
  month — your next 30 days of Coach is on us. Upgrade
  to redeem." ONE button: "See my next invoice" (paid,
  links to the existing Stripe customer portal) or
  "Redeem on Coach" (free, links to the existing
  `/settings/upgrade` per the 0035 inline-upsell
  pattern). A tiny "Got it" button stamps
  `notified_at = NOW()` and hides the card. Card
  exposes `data-testid="referral-credit-card"`. Per
  LESSONS#0029 / #0082 — scope every assertion to the
  testid (first names + dollar amounts overlap many
  rendered strings). Per LESSONS#0065 / #0066 / #0162
  — smallest possible touch on /home. (vitest
  component test): (i) paid-tier coach with 3
  qualified + unconsumed → card renders variant ONE;
  (ii) free-tier coach with 3 qualified + unconsumed
  → card renders variant TWO; (iii) qualifiedCount =
  2 → card is ABSENT; (iv) granted+notified → card
  is ABSENT; (v) tapping Got-it fires the consume
  POST and hides the card; (vi) the See-invoice
  href is the existing customer-portal URL; (vii)
  the Redeem-on-Coach href is the existing
  `/settings/upgrade`; (viii) the rendered text
  contains no AGENTS.md banned word for any matrix
  of first-name / dollar-amount / date fixtures.

- [ ] Webhook hardening: the existing
  `customer.subscription.deleted` webhook (the 0003
  cancellation flow) is BYTE-IDENTICAL when the
  caller has a `referral_credit_grants` row — the
  Stripe customer balance is preserved through a
  cancellation (Stripe behavior) so a coach who
  cancels and re-subscribes within Stripe's balance-
  retention window still has their credit. The
  existing `customer.subscription.updated` webhook
  is BYTE-IDENTICAL. The existing past-due flow
  (0004) is BYTE-IDENTICAL — a coach in past-due
  with an outstanding credit applies the credit per
  Stripe's normal invoice-balance reconciliation.
  Per LESSONS#0044 — the tier value is gated on
  `sub.status`, not on credit-balance presence;
  this ticket does not weaken that contract.
  (vitest: assert each existing webhook test
  passes BYTE-IDENTICAL with a planted
  referral_credit_grants row for the org; the
  webhook's tier computation does not change.)

- [ ] Tier / feature gating: the referral-credit
  flow itself is NOT tier-gated (a free-tier coach
  with 3 qualified referrals gets the same
  recognition card and a pending-credit grant; the
  redemption is gated only because Stripe credits
  require a subscription to redeem against — the
  free-tier coach must upgrade to redeem, which
  is the 0035 inline-upsell shape). The
  QUALIFICATION bar — the converted coach must
  have shipped a real artifact OR 5 observations —
  is the load-bearing anti-abuse gate, NOT a tier
  gate. (vitest: a free-tier inviter with 3
  qualified referrals gets the pending grant; a
  paid-tier inviter gets the immediate credit;
  the qualifying-bar logic is the same on both
  paths.)

- [ ] Privacy / COPPA contract: the referral-credit
  status route reads ONLY the converted-coach FIRST
  NAME (split off `coaches.full_name` per the
  existing 0047 / 0021 pattern), NEVER the
  converted coach's email, phone, full name,
  team name. The referral-credit card renders ONLY
  first names. The
  `qualified_referral_coach_ids` column on the
  grant table stores UUIDs (a coach who later
  deletes their account cascades — the
  `references coaches(id) on delete cascade`
  contract on `qualified_referral_coach_ids` is
  enforced via a SECONDARY join-table OR via a
  trigger; the simpler shape is to leave the
  column as a plain UUID[] WITHOUT an FK array
  contract and live with the eventual-orphaning
  on deletion — load-bearing audit trail per
  LESSONS#0044 means we KEEP the original id
  list intact for the billing audit even after
  the coach deletes their account). Per
  LESSONS#0036 — `.select()` allow-lists on every
  read; NEVER `select('*')`. (vitest: a planted
  email / phone / DOB on the referred coach is
  NEVER read by the status route; the card
  renders only first names; the qualified-coach-
  ids column persists the UUIDs across the
  referred-coach's hypothetical account deletion;
  the audit trail is intact.)

- [ ] Voice contract: every new user-facing
  string (the card body for both copy variants,
  the two button labels, the Got-it label, the
  Stripe credit description) contains NO
  AGENTS.md banned word per LESSONS#0023.
  Instruct positively ("ran a real practice",
  "your next month is on us", "see my next
  invoice", "got it") — never the banned ban-
  list. The dollar-amount fixture matrix
  (`$9.99`, `$24.99`, `$49.99`) renders
  cleanly. The first-name list join ("Maya,
  James, and Lin") uses an Oxford comma + "and"
  conjunction (the existing 0047 / 0048 string
  posture; read at pickup). (vitest: render each
  new component and scan rendered text; scan the
  Stripe credit description across the milestone
  matrix; scan both copy variants across the
  tier matrix.)

- [ ] Regression: the existing 0047 referral-
  conversion celebration card is BYTE-IDENTICAL
  — the 0047 card and the new 0074 card are
  DISTINCT cards (0047 fires on EACH conversion;
  0074 fires on EACH milestone). The existing
  `/api/referrals` route is BYTE-IDENTICAL
  (the new status route is an additive surface,
  not a replacement). The existing Stripe
  webhooks (0001 / 0002 / 0003 / 0004 / 0005)
  are BYTE-IDENTICAL. The existing /home
  surface is BYTE-IDENTICAL when the caller has
  zero unconsumed milestones (the new card is
  absent). (vitest: snapshot the named routes /
  components against seeded fixtures pre- and
  post-change.)

- [ ] Seeded e2e on the 0006 fixture: seed
  extension is — pre-mint THREE referred coaches
  whose `coaches.preferences.referred_by_code`
  equals the deterministic referral code for the
  EXISTING E2E coach. Pre-mint ONE shipped
  parent_report plan per referred coach (so all
  three cross the QUALIFICATION bar). Pre-mint ONE
  `referral_credit_grants` row for the E2E coach
  WITHOUT the row written (so the e2e exercises
  the GRANT flow, not the GRANTED state). Per
  LESSONS#0084 — seed in an idempotent DELETE-
  then-INSERT block; every new coaches row
  carries a matching `auth.users` row. Per
  LESSONS#0101 — UUIDs in the next free
  `0000000000<XX>+` range. Per LESSONS#0085 —
  jsonb `preferences` values seeded as quoted
  JSON. Playwright spec: (a) sign in as the
  E2E coach, navigate to /home, assert the
  referral-credit card renders with the three
  seeded first names AND a real dollar amount
  AND a See-my-next-invoice button (the e2e
  MOCKS the Stripe customer balance API per
  LESSONS#0044 — the load-bearing assertion is
  the GRANT row in Supabase + the rendered
  card, NOT a live Stripe call); (b) tap See-
  my-next-invoice, assert the URL is the
  existing Stripe customer-portal URL; (c)
  tap Got-it on a SECOND test fixture, assert
  the card hides; (d) reload, assert the card
  stays hidden. Scope by data-testid per
  LESSONS#0081 / #0082. Skip when E2E creds
  are unset.

## Out of scope

- A REFERRAL-OF-A-REFERRAL chain credit ("the
  coach you invited invited another coach — you
  earn 0.5x"). v1 is single-hop; multi-hop
  attribution is a separate ticket with its own
  anti-gaming posture.
- A POOLED credit ("3 of your referred coaches
  upgraded together this month — bonus credit").
  v1 fires on individual milestone crossings;
  pooled bonuses are a v2 surface.
- A CASH PAYOUT path (Stripe Connect / ACH
  refund). v1 is customer balance credit only —
  the credit must be redeemed against a future
  SportsIQ invoice, never paid out.
- A PRO-tier or ORG-tier specific milestone
  threshold. v1 uses the same thresholds for
  every paid tier; tier-specific tuning is a v2.
- A LEADERBOARD of top referrers. v1 surfaces
  only the caller's OWN credit state; cross-coach
  comparison is a separate ticket.
- A retroactive credit sweep for already-shipped
  qualified referrals at ticket-ship time. v1
  fires on FORWARD milestone crossings only; a
  back-fill cron is a separate ticket with an
  approved budget impact estimate.
- An EMAIL channel for the credit milestone. v1
  is in-app only; an email surface is a separate
  ticket.
- A SHARE-MY-CREDIT surface ("I just earned a
  free month — invite the next one"). v1 is
  invisible to the outside world; sharing the
  credit is a v2 if data shows it accelerates
  the next milestone.
- A "tip out" the credit to the converted
  coaches surface. v1 keeps the credit on the
  inviter; sharing the credit downstream is a
  separate consent surface.

## Engineering notes

Files / patterns the dev should touch.

- `supabase/migrations/066_referral_credit_grants
  .sql` (new). Per LESSONS#0006 — confirm `066`
  at pickup (latest seen `065` for 0073). Per
  LESSONS#0088 — strip `--` comments before
  banned-token sweep.
- `src/types/database.ts` — add
  `ReferralCreditGrant` type. NO field on
  existing types.
- `src/lib/referral-credit-utils.ts` (new) —
  pure helper + QUALIFYING_ARTIFACT_TYPES
  const. Mirror the shape of `src/lib/coach-
  reactivation-utils.ts` (0072) and
  `src/lib/coach-reputation-utils.ts` (0073).
- `src/lib/referral-code.ts` (existing — read
  first per LESSONS#0096) — REUSE the existing
  `makeReferralCode(coachId)` helper.
- `src/lib/stripe.ts` (existing — read first
  per LESSONS#0096) — extend the
  `getStripe()` factory's exported helpers if
  the credit-application requires a new helper
  function; otherwise call
  `getStripe().customers.createBalanceTransaction`
  directly in the route. Per AGENTS.md —
  lazy `getStripe()` factory, never `new
  Stripe()` at module top. Per LESSONS#0040
  — billing tests stub `getPriceId` /
  `tierFromPriceId` deterministically; the
  new credit-application is stubbed
  similarly via `vi.mock('@/lib/stripe', ...)`.
- `src/app/api/coach/referral-credit-status/
  route.ts` (new) — `GET(request)`. Authed
  via `createServerSupabase()` for auth,
  service-role for the cross-coach reads. Per
  LESSONS#0036 — `.select()` allow-lists. Per
  LESSONS#0049 / #0092 / #0100 / #0110 — new
  from() calls; Glob `tests/api/referral*
  .test.ts` AND `tests/api/coach/referral*
  .test.ts` AND `tests/api/billing*.test.ts`
  at pickup and extend every queue.
- `src/app/api/billing/apply-referral-credit/
  route.ts` (new) — `POST(request)`. Authed.
  Per AGENTS.md — Stripe init through
  `getStripe()`. Per LESSONS#0044 — credit-
  balance applied as a NEGATIVE-amount
  `createBalanceTransaction`; the grant row
  ONLY persists if the Stripe call succeeds.
- `src/app/api/coach/referral-credit-status/
  consume/route.ts` (new) — `POST(request)`
  stamps `notified_at = NOW()` after
  ownership check.
- `src/components/home/referral-credit-card
  .tsx` (new). `data-testid="referral-
  credit-card"`.
- `src/app/(dashboard)/home/page.tsx`
  (existing — read first per LESSONS#0096).
  One import + one JSX entry. Per
  LESSONS#0065 / #0066 / #0162 — smallest
  possible touch.
- `src/lib/tier.ts` — NO new feature key.
  (The QUALIFICATION bar lives in the
  per-feature helper, not in tier.ts.)
- `src/components/ui/upgrade-gate.tsx` —
  NO new registration.
- `tests/migrations/066-referral-credit-
  grants.test.ts` (new).
- `tests/lib/referral-credit-utils.test.ts`
  (new) — every helper case.
- `tests/api/coach-referral-credit-status
  .test.ts` (new) — every route case.
- `tests/api/billing-apply-referral-credit
  .test.ts` (new) — every route case
  including the Stripe failure path per
  LESSONS#0044.
- `tests/api/coach-referral-credit-consume
  .test.ts` (new).
- `tests/components/referral-credit-card
  .test.tsx` (new).
- `tests/stripe/webhook-credit-preserve
  .test.ts` (new) — assert the existing
  webhook flows are byte-identical when
  a credit row exists.
- `tests/api/referral*.test.ts` AND
  `tests/api/billing*.test.ts` AND
  `tests/stripe/*.test.ts` (existing —
  Glob at pickup per LESSONS#0110) —
  extend every `mockReturnValueOnce`
  queue if a sibling shares the mocked
  chain. Per LESSONS#0116 — if the Glob
  returns empty for a prefix, document
  the empty sweep and do not invent
  files.
- `tests/e2e/referral-credit-flow.spec
  .ts` (new). Seed extension per the AC.
  UUIDs in the next free range per
  LESSONS#0101. Skip when E2E creds are
  unset.
- New deps: NO (existing `stripe` SDK).
  Migration: YES (066 or bump). Env
  vars: NO new (existing
  `STRIPE_SECRET_KEY` covers the
  customer-balance call). AI prompt
  change: NO. Tier feature key: NO new
  key.
- LESSONS to anchor: #0006 (prefix
  uniqueness), #0020 / #38 (.test.ts),
  #0023 (positive voice on card +
  Stripe description + buttons), #0029
  / #0082 (data-testid scoping — first
  names + dollar amounts overlap),
  #0034 / #0088 (strip `--` comments
  on COPPA sweep), #0036 (best-effort
  reads + `.select()` allow-lists),
  #0039 (organizations.tier column,
  not `plan`), #0040 (stub
  `getPriceId` / `tierFromPriceId` in
  billing tests; don't fight env-load
  order), #0044 (Stripe customer
  balance via createBalanceTransaction
  with negative amount; webhook
  preserves credit through
  cancellation), #0049 / #0092 /
  #0100 / #0110 (mock queue
  spillover — Glob every referral /
  billing test), #0055 (route
  handler call posture), #0057
  (team_coaches not teams.coach_id),
  #0061 (literal space on defensive
  scans), #0062 (thenable chain mock
  when two `.eq()` calls), #0065 /
  #0066 / #0162 (home page hotspot —
  smallest possible touch), #0084 /
  #0101 (seed posture; auth.users +
  coaches in same idempotent block;
  UUID range), #0085 (jsonb seed
  values as quoted JSON), #0096
  (schema wins over prose — at
  pickup read the actual /home
  surface, the actual Stripe lazy
  factory shape, the actual 0047
  /api/referrals payload shape, the
  actual jsonb selector for
  `preferences->>referred_by_code`,
  the actual `organizations.tier`
  + stripe_customer_id shape), #0116
  (Glob sweep that returns empty is
  a no-op).

## Implementation log

- 2026-06-07 [ship/0074] Branched `feat/0074-referral-credit-real-free-month`
  from `origin/main`. Confirmed migration `066_` is the next free prefix (065
  is the latest, the coach-reputation-milestones table). Confirmed
  `src/lib/referral-code.ts` ships the deterministic
  `makeReferralCode(coachId)` helper to reuse for the referral-graph lookup.
  Confirmed the existing `/api/referrals/celebration` route reads the
  `preferences->>referred_by_code` JSONB selector that the new GET route will
  mirror. Confirmed `organizations.tier` + `stripe_customer_id` are the real
  columns (per LESSONS#0039). Confirmed the home page mounts other 0072/0073
  cards near the `<ReferralCelebrationCard />` line — that's where the
  smallest-possible-touch insert goes (LESSONS#0065 / #0066 / #0162).
- 2026-06-07 [ship/0074] Bumped the 0066 migration-count regression pin
  (`tests/migrations/no-new-migration-0066.test.ts`) from 66 → 67 to
  accommodate the new `066_referral_credit_grants.sql`. Documented inline in
  the test's bump comment (per its own protocol: "if a sibling ticket
  legitimately adds a migration, bump this constant and call out the
  deviation in the bumping ticket's Implementation log"). Not weakening —
  the pin's express job is to flag stray migrations; the bump records that
  066 is intentional.
- 2026-06-07 [ship/0074] Local vitest surfaced the documented LESSONS#0036
  TZ-environmental fail in `tests/player-of-match-utils.test.ts:281`
  (`Apr 27` vs `Apr 28`). Confirmed it reproduces identically on pristine
  `origin/main` under the pinned Node 20.19.0 (this machine is `CDT`, the
  test composes a local-time date from a YYYY-MM-DD string). CI runs UTC
  and is green on `main`; pushing and letting CI arbitrate per
  LESSONS#0036.
