---
id: 0029
title: Turn the helper who used the observer link into a coach with their own free team
status: in-progress
priority: P1
area: growth
created: 2026-05-25
owner: product-groomer
---

## User story

As the assistant coach or sports-parent who just spent a practice tapping observations
through a coach's shared observer link, I want a clear "start your own team — free" path the
moment I am done helping, so that the tool I just learned to use in the gym becomes a tool I
run for my own team, instead of a link I close and forget.

## Why now (four lenses)

### Product Owner
We already ship the observer link (`/observe/[token]` + `/api/observe/[token]`): a coach
shares it, and an assistant or a helper-parent captures observations live during a session
with no account and no install. It is a real, working surface where a brand-new person
*learns the exact capture motion the product is built on* — and then hits a dead end. When
they finish, the page just sits on the last observation. There is no "you did this — here is
how to run it for your own team" moment. The smallest meaningful unit of value is a single
conversion footer on the observer page after a helper has saved at least one observation: a
"Start your own team — free" CTA that carries the host coach's referral code to
`/signup?ref=<code>`, plus one honest line ("You logged N observations for Coach {first} —
do this for your own team"). No new capture surface, no model spend — it gives an existing,
already-warm surface the one exit it is missing.

### Stakeholder
This opens an acquisition channel none of the shipped referral surfaces reach. Every shipped
loop sends a *coach* a link they forward (assistant-invite 0015, warm landing 0021, team
card 0010, season recap 0017, coach profile 0026) or puts a card on the *parent* portal
(0009/0016/0022). This is the only surface where a future coach is *already inside the
product, hands-on, mid-session* — the highest-intent, lowest-friction acquisition audience we
have, and one that has self-selected by volunteering to help. It widens the referral-loop
moat by closing the loop on a surface that today leaks every helper it touches, and it does
so with the exact deterministic referral code (`makeReferralCode`) every other loop uses, so
attribution and the existing referral reward (1 free month) compound instead of forking.

### User (Tuesday, 6:30pm, the helper-parent just tapped their last observation)
They have been one-tapping observations for 45 minutes and it felt good — fast, obvious, no
typing. The session winds down. Under the capture controls they see "You logged 7
observations for Coach Maria — want to do this for your own team?" and one orange button:
"Start your own team — free." One tap, no app-store wall, no form to scroll. On a one-bar gym
connection the footer is plain server-rendered markup that is already on the page; it does not
wait on a network call to appear. If they tap nothing, nothing changes — the capture flow is
untouched.

### Growth
This is the warmest acquisition surface in the product and it is currently a leak. A helper
who just felt how fast capture is, and who already trusts the coach who invited them, is the
single most likely person to convert — and they convert carrying the host coach's referral
code, so the host earns their reward and the loop compounds. The "show me" moment already
happened: they *used* it. The CTA just names what they are already feeling ("I could run this
for my own team"). It is distinct from every shipped loop because it converts the
*hands-on helper*, not a coach forwarding a link or a parent reading a report.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/observe/[token]` includes the host coach's deterministic `referralCode` (from `makeReferralCode(coach_id)` in `src/lib/referral-code.ts`) in its JSON payload, alongside the existing `coachName`/`session`/`team`/`players` fields, and exposes NO new coach-private field (no email, no coach id beyond what is already returned, no player-scoped additions) (vitest asserts the GET response includes `referralCode` and that the added field set is exactly `{ referralCode }`).
- [ ] `GET /api/observe/[token]` for an invalid/expired token still returns `401` and leaks no `referralCode` or coach data (vitest — regression on the existing token-validation path).
- [ ] Playwright: after a helper saves at least one observation through `/observe/<token>`, a conversion footer appears with the text naming the saved count and host coach first name, and a "Start your own team — free" CTA whose href contains `/signup?ref=<code>` matching the host coach's code (the seeded observer-flow fixtures).
- [ ] Playwright: before any observation is saved (saved count is 0), the conversion footer is NOT shown — it appears only once the helper has actually captured something, so it reads as a reward, not an upsell wall.
- [ ] Privacy/COPPA: the conversion footer and the GET payload carry NO per-minor data — the saved-count is the helper's own session tally (already tracked client-side), the host reference is the coach first name only, and no player name, jersey, or observation text is added to the payload or the footer (vitest asserts the GET payload's player rows are unchanged and carry no new fields; component/Playwright asserts the footer renders no player name).
- [ ] Regression: the existing observer capture flow (sentiment → template → player → save, the IP rate limit, the 201 on save) is unchanged — the footer is purely additive and the `POST /api/observe/[token]` contract is untouched (vitest on the POST route; Playwright that a save still succeeds).

## Out of scope

- Auto-creating a team or pre-filling a roster for the converting helper from the host coach's
  data. v1 sends them to the standard `/signup?ref=<code>` flow; copying any of the host's
  team/player data into a new account is a COPPA and consent question, explicitly not done here.
- A persistent identity for the anonymous observer (no account, no cookie, no tracker). The
  footer is stateless; the saved-count comes from the existing client-side session tally. Do
  NOT add a new analytics event, a per-observer record, or a view counter.
- Changing the observer token's lifetime, HMAC scheme, or rate limit (`generateObserverToken`
  /`validateObserverToken`/`checkObserverRateLimit` in `src/lib/observer-utils.ts` are
  untouched).
- Putting the conversion footer on the in-app coach `/capture` page. This ticket is about the
  PUBLIC, no-auth `/observe/[token]` surface only — the in-app coach already has an account.
- A new tier gate. The observer link and signup are both ungated; this footer is open by the
  same product decision as the other referral surfaces (0010/0015/0026).
- Emailing or notifying the helper later. v1 is one in-page CTA at the end of the session; a
  delivered follow-up would need an explicit channel-approval line per AGENTS.md.

## Engineering notes

- `src/app/api/observe/[token]/route.ts` (`GET`) — after resolving `session.coach_id`, compute
  `referralCode = makeReferralCode(session.coach_id)` (import from `src/lib/referral-code.ts`,
  the same helper the team-card / season-recap / coach-card GET routes use so the code is
  deterministic and matches existing referral attribution). Add `referralCode` to the existing
  `NextResponse.json({...})` payload. Do NOT add any other field. The route already uses
  `createServiceSupabase()`; no auth change. The `POST` handler is untouched.
- `src/app/observe/[token]/page.tsx` — extend the `ObserveData` interface with
  `referralCode: string` and render a conversion footer ONLY when `savedCount > 0` (the page
  already tracks `savedCount` in component state). Footer copy names the count and
  `coachName.split(' ')[0]` (already derived on the page), with a CTA `<a href={'/signup?ref=' +
  data.referralCode}>` — because this is a real `<a href>` it is assertable directly (unlike the
  `data-share-url` buttons in LESSONS.md 2026-05-21); no need for a data attribute here. Dark
  zinc-950 + #F97316 orange (this is the coach-facing observer surface, already dark themed); no
  emoji-decorated headings; no banned words ("journey"/"amazing"/etc).
- `src/lib/observer-utils.ts` — no change needed unless the dev prefers a small pure helper
  `buildObserverConversionMessage({ savedCount, coachFirstName })` (analogous to the existing
  `formatObserverCount`) so the footer copy is unit-testable without rendering the page; if so,
  add a unit test for it in `tests/observer/` next to the existing observer-utils tests.
- `tests/observe/token.test.ts` (or wherever the existing observer GET test lives — `.test.ts`
  NOT `.spec.ts`; LESSONS.md 2026-05-20): assert the GET payload now includes `referralCode`
  equal to `makeReferralCode(seededCoachId)`, that the invalid-token path still returns 401 with
  no `referralCode`, and that the player rows in the payload carry no new fields. The `GET`
  handler reads `params` (a Promise) and takes a `Request` first arg — invoke it with its real
  signature (LESSONS.md 2026-05-21); run `tsc --noEmit` after the route test. Run under Node
  20.19.0 by prepending the pinned bin to PATH (LESSONS.md 2026-05-21).
- `tests/e2e/observer-flow.spec.ts` (extend the existing observer e2e if present, else new)
  against the 0006-seeded local Supabase. The page fetches the token server data client-side via
  `/api/observe/[token]`, so the seed must provide a session + roster + a host coach whose
  `makeReferralCode` is deterministic (reuse the seeded coach already used by other share specs
  so the code matches without a new seed row — cf. LESSONS.md 2026-05-21 re: reusing the seeded
  coach's deterministic `AAAAAA` code). Assert: no footer before a save; after saving one
  observation, the footer shows the count + coach first name and the `/signup?ref=<code>` CTA.
  Skip when E2E creds are unset, per convention.
- New deps: no. Migration: no. Env vars: no (reuses the existing observer-token secret and
  `/signup` route). AI prompt change: no. Tier feature key: no (ungated growth surface).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-25 — branch `feat/0029-observer-conversion-footer` opened off fresh `main`; ticket flipped to `in-progress`.
- 2026-05-25 — failing tests added first: `tests/observe/token.test.ts` (GET payload
  now carries `referralCode == makeReferralCode(coach_id)`, added field set is exactly
  `{ referralCode }`, invalid-token still 401 with no leak, player rows unchanged; POST
  still 201 + 429 regression), `tests/observer/conversion-message.test.ts` (pure copy
  helper), and `tests/e2e/observer-flow.spec.ts` (no footer before a save; after one save
  the footer shows count + coach first name + `/signup?ref=AAAAAA` CTA; footer has no
  player name). Then implemented: `referralCode` added to the GET payload only (no auth
  change, POST untouched), a pure `buildObserverConversionMessage()` helper, and the
  dark zinc-950 / #F97316 footer rendered only when `savedCount > 0`.
- Filename note: the actual ticket file is `0029-observer-to-coach-conversion.md`; the
  vitest file is `*.test.ts` not `*.spec.ts` (LESSONS.md 2026-05-20). The e2e mints a
  valid HMAC observer token inline with the server's secret-resolution order and skips
  when `SUPABASE_SERVICE_ROLE_KEY` is unset (CI supplies it via `$GITHUB_ENV`); it reuses
  the seeded coach (`AAAAAA`) so the code matches without a new seed row.
- Local gate green under Node 20.19.0: `lint` 0 errors, `tsc --noEmit` clean,
  `check-backlog.mjs` in sync, `vitest` 4480/4481 (the lone fail is the documented
  TZ/jsdom `player-of-match-utils` "Apr 27 vs Apr 28" environmental artifact, LESSONS.md
  2026-05-20 — not a regression, untouched by this change, green on CI's UTC Node 20).
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
