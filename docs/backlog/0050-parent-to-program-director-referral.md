---
id: 0050
title: When a parent loves the report, let them forward it to their program's director with one tap to bring the whole league onto SportsIQ
status: in-progress
priority: P2
area: growth
created: 2026-05-26
owner: product-groomer
---

## User story

As a parent reading my kid's parent report on /share/[token] and thinking "this is the best
update from a coach I have ever gotten — why doesn't every coach in our league do this?", I
want one tap that sends a copy of THIS report to my league's program director with a short
note from me, so that the director sees what a SportsIQ-using coach is delivering to families
and the league I'm part of can start using it before next season — instead of the report
dying in my own text thread with my partner.

## Why now (four lenses)

### Product Owner
The viral surfaces shipped so far ask the parent to act on the SECOND-PARTY level — share the
report to OTHER parents (0011), or start their OWN team if the parent happens to also coach
(0019). What no shipped surface does is ask the parent to escalate UPSTREAM to the
PROGRAM-LEVEL decision-maker — the program director, the league commissioner, the youth-rec
office at the parks-and-rec department — the one person whose adoption decision converts ten
coaches at once. The product already has a public program directory and claim path (0033),
the parent already trusts the artifact they are reading (it's about their kid, in their
coach's voice), and the receiver experience already exists: the program directory landing.
The smallest meaningful unit of value is one new section on the parent portal share page — a
"Share this with our league" button — that opens a small sheet asking for the director's
first name + email + an optional one-line note from the parent, sends ONE email to the
director with a link to the SAME parent-portal report the parent just read and a CTA to
`/programs/claim`, and writes one row to a small `program_referrals` audit table so the
parent who already shared once gets the right confirmation copy on a re-visit. One new
public-facing form, one new email template, one new audit table, one CTA on the existing
share page.

### Stakeholder
This is the UPSTREAM referral channel the product has never asked the parent to walk. Today
the parent's referral act converts ONE other parent or ONE other coach (a 1:1 lift); a
program-director conversion converts 10–40 coaches under that director at once (a 1:N lift
with N typically in the 10–40 range — the average rec-league commissioner runs 8–25 teams).
That changes the unit economics of every parent who reads a report: instead of being a
1-coach acquisition surface, every parent becomes a candidate program-acquisition surface.
It is also the cleanest path to a defensible enterprise / org-tier pipeline the product has:
0033 ships the cold-search path (a director searches for their program and lands), 0024
ships the org-page-staff-invite path (once a director claims, they can sweep their coaches);
this ticket adds the WARM-INTRODUCED path (the director's own constituent — a parent — sent
them the artifact), which is structurally a much higher-conversion door than a cold search.
The COPPA posture is honest: the parent volunteers the director's contact (they already
know the director), the director-side email contains NO minor data (the LINK opens the
existing /share/[token] report under the parent's own choice), and the audit table records
no minor name.

### User (the parent, Wednesday night, just read the second parent report of the season, three glasses of wine in)
At the bottom of the report, below the "share with your other coach" button (0011) and the
"start your own team" button (0019), they see a new small line: "Want SportsIQ for your
whole league?" A button: "Send this to our program director." They tap. A short modal: "Who
runs your league?" with three fields (director first name, director email, optional note).
The placeholder text says "Optional — anything you want to say to <director_first_name>"
once they fill that in. They tap "Send." Confirmation: "Sent to <director_first_name>. They
get a link to this same report." That's the entire flow — under thirty seconds. The
director gets one email: "<Parent first name>, a parent in <program_name>'s flag football
league, asked me to send you this update her coach generated for her son. If you'd like
your other coaches to use this too, you can claim <program_name> here." The director taps
into the same /share/[token] report (no auth — public surface), reads what a coach in their
league is delivering, and the CTA at the bottom of THEIR view (auto-detected: server-side
the route knows the visit came from the program-referral email link via a signed
identifier — see AC) is "Claim <program_name>" linking to the existing 0033 claim path.

### Growth
This is the highest-leverage acquisition surface the product can ship that does not require
inventing a new product surface — every input (the report, the share page, the program
directory, the claim flow) already exists; this ticket is the wire that connects them.
Distinct from every shipped surface: 0017 sells the COACH'S season; 0009 sells the PLAYER'S
moment; 0026 sells the COACH'S persona; 0033 sells the PROGRAM as a landing; THIS sells the
LEAGUE'S whole-staff opportunity through the parent's voice, which is the most credible
voice that exists in youth sports (a parent is never seen as a salesperson by another
parent or by a program director — they are a constituent). Concretely: every parent who
shares once at this surface contributes a director-attempt to the funnel; every fifth or
sixth contributes a director-conversion; every director-conversion contributes ~15 coach
acquisitions on average. The compounding is asymmetric — the surface is built once and
fires forever.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new migration `047_program_referrals.sql` adds the table `program_referrals (id
  UUID PRIMARY KEY DEFAULT gen_random_uuid(), share_token TEXT NOT NULL, parent_first_name
  TEXT NOT NULL, parent_email TEXT NULL, director_first_name TEXT NOT NULL, director_email
  TEXT NOT NULL, director_email_hash TEXT NOT NULL, note TEXT NULL, signed_director_id
  TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), claimed_at TIMESTAMPTZ NULL,
  claimed_org_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL)`. The
  `share_token` is the parent-portal token of the report the parent shared; the
  `director_email_hash` is `sha256(lower(trim(director_email)))` for dedup queries that
  never put a raw email into a WHERE clause; the `signed_director_id` is a short HMAC
  identifier the director-side email link includes (so the director's view of the
  shared report knows to surface the claim CTA — see the next AC). The migration pulls
  the next free prefix AFTER 0049's `046_…` (so `047_…`); verify with `ls
  supabase/migrations/`, LESSONS#0006. (vitest scans the executable DDL — strip `--`
  comments per LESSONS#0088 — and asserts the column allow-list matches exactly; banned
  tokens `player`, `child`, `observation`, `medical` are absent from DDL; `director_email`
  is nullable-allowed for the dedup-only path but in v1 it is recorded for receipts only,
  see Out of Scope.)
- [ ] `POST /api/share/[token]/program-referral` (new public route, like the existing
  /api/share/[token]/parent-contact pattern) accepts `{ parentFirstName, parentEmail?,
  directorFirstName, directorEmail, note? }`. The token's `is_active` must be true →
  404 otherwise. The route generates a `signed_director_id` via
  `crypto.createHmac('sha256', CRON_SECRET).update(...)` so the director-side `/share/<token>?
  pr=<signed_director_id>` link is verifiable (mirrors 0042's pause-token pattern). It
  computes `director_email_hash` via `sha256(lower(trim(directorEmail)))` and inserts one
  row into `program_referrals`. It sends ONE email to `directorEmail` via the existing
  `sendEmail()` helper with the subject `"<parent_first_name> sent you an update from
  her son's coach"` and the body containing the parent's note + a CTA link to
  `<APP_URL>/share/<token>?pr=<signed_director_id>`. Idempotency: a second post with the
  same `(share_token, director_email_hash)` within 30 days does NOT re-send (returns 200
  with `{ alreadySent: true }`); a re-post after 30 days does re-send. The route is
  rate-limited (mirror the existing parent-contact route's rate limit). Service-role only
  for the insert. (vitest: 404 on inactive token; happy path inserts one row and calls
  `sendEmail` once; re-post within 30 days does NOT call `sendEmail`; re-post after 30
  days does; rate limit asserted.)
- [ ] The `/share/[token]` parent-portal page (existing) renders a new "Want SportsIQ for
  your whole league?" section BELOW the existing "share with your other coach" CTA
  (0011). The section contains a small button "Send this to our program director" that
  opens a modal/sheet collecting the three required fields. The modal validates the
  director's email format client-side AND server-side. After a successful POST, the
  modal closes and the section's text changes to "Sent to <director_first_name>. They'll
  get a link to this report." On a re-visit by the SAME parent (no signed identity — the
  re-visit is detected via a small `program_referral_sent` localStorage flag set on
  client) the section either: (a) renders the confirmation copy by default, (b) offers
  "Share with another director" to support multi-director leagues. (Playwright on the
  seeded share page: assert the section renders; tap the button; fill the three fields;
  submit; assert the confirmation copy; assert one row in `program_referrals`. vitest
  component test: the modal validates email format; an invalid email keeps the modal
  open with an error.)
- [ ] The `/share/[token]?pr=<signed_director_id>` view (the director's landing) verifies
  the `pr` parameter server-side via the HMAC helper, looks up the referral row to
  resolve the original parent's first name + the program (if the inviting coach belongs
  to an org with a public slug — read `coach.organizations.slug` server-side), and
  renders a small banner at the TOP of the same parent-portal report: "<parent_first_name>
  in <program_name> sent this to you." Below the existing report's content, a NEW CTA
  block: "If you run <program_name>, claim it here" linking to the existing 0033
  `/programs/<slug>/claim` flow (or `/programs?director=...` if no slug exists yet). The
  banner and CTA appear ONLY when the `pr` verifies; an unverified or absent `pr` keeps
  the page byte-identical to the existing /share/[token] render. (Playwright: visit the
  share page with a seeded `pr` token from a real program_referrals row; assert the
  banner and claim CTA render; visit the same URL without `pr` and assert no banner; visit
  with a tampered `pr` and assert no banner — same posture as 0042's pause-token verify.)
- [ ] When the director taps the claim CTA and the org claim completes (via the existing
  0033 flow), set `claimed_at = now()` and `claimed_org_id = <claimed_org>` on the
  corresponding `program_referrals` row. The claim flow looks up the row via the verified
  `signed_director_id` carried through the redirect chain (or persisted to a server-side
  cookie on the share-page render and consumed on claim). If the director claims a
  different org or chooses not to claim, the row's claimed_at stays NULL — the dedup
  posture is not affected. (vitest: a happy-path claim stamps the row; a no-claim leaves
  the row intact; a forged claim id (re-using a stale `signed_director_id` for a different
  org) is REJECTED — same posture as LESSONS#0039 / 0042.)
- [ ] COPPA / privacy: the director-side email body contains NO minor data — NO player
  first name, NO player position, NO observation excerpt. The body says "an update from
  her son's coach" not "an update about [name]". The director clicks INTO the
  existing /share/[token] report, which is already gated to render only what the parent
  themselves chose to share via the existing per-section `include_*` flags on
  `parent_shares` (the existing surface posture). The new `program_referrals` table has
  NO `player_id` column, NO `coach_id` column (the coach is resolved via the share
  token's foreign keys at read time, never copied into this table). (vitest: scan the
  email body for planted player-name tokens — none should appear; the migration DDL is
  scanned for banned tokens.)
- [ ] Voice contract: every new user-facing string (the section header, the modal's three
  field labels, the modal's submit button, the confirmation copy, the director-side
  banner, the director-side claim CTA, the EMAIL subject + body) contains NO AGENTS.md
  banned word (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`). Per
  LESSONS#0023 the copy is positive ("Send this to our program director" / "Claim
  <program_name> here") and never enumerates the banned tokens verbatim. (vitest: scan
  every new component's rendered text and the email template's rendered HTML for the
  banned tokens.)
- [ ] Tier / privacy: NO new `feature_*` key. The forwarding surface is universal — every
  parent of every coach can use it; gating would invert the loop. The director-side
  claim flow is the existing 0033 path which has its own free-coach landing. The
  inviting coach's tier is unaffected. (vitest: a parent on a /share/[token] of any
  tier's coach can submit the form; the API does not check `canAccess` of any kind.)
- [ ] Rate-limit / abuse posture: the POST is rate-limited to N submissions per
  `share_token` per day (mirror the existing parent-contact rate limit; pick N=3 to allow
  a multi-director league but block bulk abuse). The director-email is validated as a
  syntactic email and the domain is NOT validated against a public allow-list (no
  enterprise-vs-personal heuristic in v1). The HMAC `signed_director_id` is opaque and
  single-use-per-claim (a second claim attempt with a stale id is rejected — same
  posture as 0042's pause-token verify). (vitest: 4th submit in the same day from the
  same share_token returns 429; the HMAC verify rejects a tampered or wrong-secret id.)
- [ ] Regression: every existing /share/[token] render path stays byte-identical when no
  `pr` is in the URL. The 0011 referral-code-on-parent-portal-cta surface is untouched.
  The 0019 parent-self-signup surface is untouched. The 0033 program directory + claim
  flow is touched ONLY to read+stamp the new `program_referrals` row on completion. The
  existing parent-contact route is untouched. (vitest: a snapshot of the existing
  /share/[token] render with no `pr` is byte-identical pre and post this ticket; the
  0033 claim route's existing tests pass unchanged.)

## Out of scope

- A "send to multiple directors" bulk surface. v1 is one director at a time; a multi-
  director batch would invite abuse and require a different rate-limit model. Multi-
  director leagues simply use the surface twice.
- A directory of program directors visible to parents ("here are 12 directors of leagues
  near you"). v1 trusts the parent to know their own director's email; building a
  director directory is a separate ticket and a separate privacy review.
- A reward / credit / billing change for the parent or the director. v1 has no economic
  incentive; the loop's strength is that it is favor-driven, not paid.
- A push notification to the parent when the director claims. v1 records `claimed_at` on
  the row but does not surface it back to the parent. A parent-side "your director
  claimed" notification is a separate ticket and a separate privacy discussion.
- Validation that the director's email actually belongs to the director (corporate-email
  heuristic). v1 trusts the parent; bad sends are rate-limited and the director can
  always ignore.
- An auto-detection of the director's identity from the program directory (looking up
  the org's primary contact email). v1 requires the parent to type the director's email
  because (a) we may not have that email even if the director's org is in the directory;
  (b) the parent typing it is part of the trust signal in the email body.
- Localizing the email body. v1 is English only.
- An admin / org-side dashboard listing who shared what. v1 records the row for audit
  only; surfacing it to a logged-in director after they claim is a future ticket.
- Reading old `parent_shares` rows to fire a backlog of referrals. v1 is forward-only —
  it only acts on a parent's explicit tap on the share page.
- Cross-program referral ("send this to a different program's director than mine"). v1
  is parent-supplied and unconstrained; if a parent sends to the wrong director that is
  a user mistake, not a system constraint.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- New migration `supabase/migrations/047_program_referrals.sql` — creates the
  `program_referrals` table per the AC schema, plus an index on `(share_token,
  director_email_hash, sent_at)` to make the 30-day dedup query fast, and a per-org
  index on `claimed_org_id` for the future claim-attribution reporting. Pick `047_…`
  after verifying with `ls supabase/migrations/` (LESSONS#0006); document in the
  Implementation log. The migration touches NO minor-scoped table.
- `src/types/database.ts` — add the `ProgramReferral` interface.
- `src/lib/program-referral-utils.ts` (new) — pure helpers:
  `signDirectorId({ shareToken, directorEmailHash, secret })`,
  `verifyDirectorId(token, secret): { ok, shareToken, directorEmailHash } | { ok:
  false }`, `hashDirectorEmail(rawEmail)` (lowercase + trim + sha256), `isWithinDedupWindow(sentAt,
  now=Date.now())` returns true if `sentAt > now - 30 days`. The signing secret reuses
  `CRON_SECRET` (already a server-only env, AGENTS.md). NO database access in this file.
- `src/app/api/share/[token]/program-referral/route.ts` (new public route). `POST({
  parentFirstName, parentEmail?, directorFirstName, directorEmail, note? })`. Verify the
  token is active → 404 otherwise. Validate the email format (server-side, no new dep —
  the existing parent-contact route has a regex; reuse it). Compute the email hash via
  the new helper. Dedup query: if an existing row for `(share_token, director_email_hash)`
  has `sent_at > now() - interval '30 days'`, return `200 { alreadySent: true }`. Else
  generate a fresh `signed_director_id` via the new helper and insert the row. Send the
  email via `sendEmail()` to `directorEmail` (mirror the existing parent-contact route's
  email send). Rate-limit: max 3 submits per share_token per day (the existing
  `src/lib/rate-limit.ts` if one exists, otherwise a small in-route Redis-free
  rate-limiter keyed by `share_token` — read `src/app/api/share/[token]/parent-contact/
  route.ts` first to mirror its pattern).
- `src/lib/email.ts` (existing) or a new `src/lib/program-referral-email-utils.ts` —
  add `buildProgramReferralEmail({ parentFirstName, directorFirstName, programName,
  shareUrl, signedDirectorId, note })` returning `{ subject, html, text }`. Voice
  POSITIVE — never enumerate banned tokens (LESSONS#0023).
- `src/components/share/program-referral-form.tsx` (new) — client component, the modal
  with three fields + submit. Validates the email format client-side. POSTs to the new
  route. On success swaps the section copy to the confirmation. Dark/portal aesthetic
  (gray/orange — this is on the parent portal, NOT the dashboard).
- `src/app/share/[token]/page.tsx` (existing — read first) — render the new section
  BELOW the existing "share with your other coach" CTA. Wrap the
  `<ProgramReferralForm />` in a "Want SportsIQ for your whole league?" header.
- The same `src/app/share/[token]/page.tsx` (server component) — read the `?pr=…` query
  parameter. If present, verify via `verifyDirectorId`; on `ok`, look up the
  `program_referrals` row and the source coach's org (via the share_token's
  parent_shares → players → teams → coach → org chain that already runs in the page).
  Render a director-side banner at the top + a claim CTA at the bottom. The unverified-
  `pr` path renders the page byte-identical to today.
- `src/app/programs/[slug]/claim/page.tsx` (existing — read first; if the claim path
  is `/programs?director=...` instead, follow whichever route 0033 actually shipped)
  — on a successful claim, look for a `program_referral_id` on the session / cookie and
  if present stamp the row's `claimed_at` and `claimed_org_id`. Never trust a
  client-supplied id; resolve from the signed verify.
- `src/lib/supabase/middleware.ts` — NO change. The new POST route lives under
  `/api/share/` which is already in `publicPaths`.
- `tests/api/share-program-referral.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38) — 404 on inactive token; invalid email → 400; happy path inserts one
  row and calls `sendEmail` once; dedup re-post within 30 days returns
  `{ alreadySent: true }` without `sendEmail`; 31-day-old re-post DOES re-send; rate
  limit at 4th submit returns 429. Run under Node 20.19.0 (LESSONS#0010). Run `tsc
  --noEmit` without piping to tail (LESSONS#0096).
- `tests/lib/program-referral-utils.test.ts` (new) — the sign/verify HMAC matrix
  (null / tampered / wrong-secret / wrong-share-token / wrong-email-hash). The
  `hashDirectorEmail` lowercases/trims correctly. The 30-day window helper boundary.
- `tests/migrations/program-referrals-coppa.test.ts` (new) — scan the migration's
  executable DDL (strip `--` comments — LESSONS#0088); assert the column allow-list
  matches exactly; banned-token absence (`player`, `child`, `observation`, `medical`);
  no FK references `players` / `observations`.
- `tests/components/program-referral-form.test.tsx` (new) — render the form; submit with
  an invalid email → modal stays open with an error; submit with a valid email → POST
  fired with the right payload; on 200 the confirmation copy renders.
- `tests/e2e/program-referral-flow.spec.ts` (new Playwright spec) against the 0006-seeded
  Supabase. Seed: one /share/[token] row + one organization with a slug (so the
  director-side claim CTA has something to point at). The spec does TWO sub-flows:
  (1) PARENT FLOW — visit /share/<token> unauthed, scroll to the new section, tap the
  button, fill the three fields, submit, assert the confirmation copy renders, assert
  one row in `program_referrals`; (2) DIRECTOR FLOW — extract the `signed_director_id`
  from the new row, visit /share/<token>?pr=<id>, assert the banner renders and the
  claim CTA points at the program's claim route; visit with no `pr` and assert no
  banner. Use `data-testid` scoping (LESSONS#0081). Skip when E2E creds are unset.
- New deps: NO (HMAC via Node `crypto`, sha256 via Node `crypto`). Migration: YES —
  one table-create. Env vars: NO new ones — reuses `CRON_SECRET` for HMAC signing.
  AI prompt change: NO. Tier feature key: NO new key — the surface is universal.
- LESSONS to anchor: #0006/#0009 (migration prefix uniqueness; coordinate with 0048's
  `045_…` + 0049's `046_…`). #0023 (voice positively; the email subject + body never
  enumerate banned tokens; the modal copy is factual). #0038 (the new POST lives under
  `/api/share/` which is already public; no middleware change). #0039 (the route
  never trusts a client-supplied `signed_director_id` or `claimed_org_id`; same
  posture as the drill-signals contract). #0042 (HMAC signing helper pattern — sign
  with `CRON_SECRET`, verify on the share-page server render). #0081 (data-testid
  scoping in Playwright). #0085/#0086 (jsonb seeding caveats — not directly relevant
  here, the table is flat). #0088 (strip `--` comments before scanning migration
  content). #0078 (LESSONS, the contract test family — assert payload keyset on the
  GET via `Object.keys(response).sort()` deep-equality for any new public
  response).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-28 — branch `feat/0050-parent-to-program-director-referral` opened.
- 2026-05-28 — schema reconciliation: the ticket says the migration should be `047_…`, but `047_…` is already taken (047_plans_type_postgame_parent_texts.sql shipped via 0048). Next free prefix is **052** (after 051_coaches_handle.sql from 0054). Using `052_program_referrals.sql`. LESSONS#0006 (verify with `ls supabase/migrations/`).
