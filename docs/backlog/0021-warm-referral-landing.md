---
id: 0021
title: Name the inviting coach on the referral signup so the invite lands warm, not anonymous
status: groomed
priority: P1
area: growth
created: 2026-05-22
owner: product-groomer
---

## User story

As a coach who taps a link a coaching friend sent me, I want the signup page to tell me
who invited me — "Coach Sarah invited you to SportsIQ" — so that I land knowing a person
I trust is already using this, not staring at a generic form that says "a fellow coach"
and wondering if the link is real.

## Why now (four lenses)

### Product Owner
Every referral surface we've shipped — the team-personality card (0010), the parent
portal's "share with your other coach" (0011), the invite-your-assistant link (0015), the
season-recap card (0017), and the parent-who-is-also-a-coach self-signup (0019) — all
funnel to `/signup?ref=CODE`. And every one of them dead-ends into the same anonymous
banner: "You were invited by a fellow coach!" (`src/app/(auth)/signup/page.tsx`, line ~124).
The code is captured (`referredByCode` → `/api/auth/setup`), but the inviting coach's
identity is never resolved or shown. The smallest meaningful unit of value is to resolve the
referrer's first name from the code at the moment the page loads and put it in the banner:
"Coach Sarah invited you to SportsIQ." One public, code→first-name lookup; one line of copy
that goes from generic to personal. We are not building a new referral surface — we are
making every existing one convert better at once.

### Stakeholder
This is the highest-leverage referral change available because it multiplies the value of
five surfaces we already paid to build, without touching any of them. A referral that names
the referrer is the difference between "spam from a link" and "my friend Sarah vouched for
this" — social proof is the entire reason the coach-to-coach loop exists, and right now we
throw it away at the last step. It deepens the referral moat at its conversion bottleneck:
the click already happened; this is whether the click becomes an account. It also reuses the
exact deterministic `makeReferralCode` algorithm (`src/lib/referral-code.ts`) in reverse —
the moat compounds rather than forks.

### User (the invited coach, tapping a link from the league WhatsApp on the couch)
The coach taps Sarah's link. The signup page loads and the banner reads "Coach Sarah invited
you to SportsIQ — start free." They recognize the name, they trust it, they sign up. If the
code doesn't resolve to anyone (typo, deactivated coach, stale link), the page falls back to
exactly today's generic "You were invited by a fellow coach!" banner — a bad code never
breaks signup, it just degrades to the current behavior. No PII beyond the inviter's first
name is ever shown.

### Growth
This is the conversion-rate multiplier for the entire coach-to-coach acquisition loop. The
"show me" moment is the invited coach seeing a real name they know on the signup page — the
single most persuasive thing you can put in front of someone deciding whether to create an
account. It compounds 0010/0011/0015/0017/0019: each of those got the coach to tap; this is
what turns the tap into a signup. Pure acquisition leverage, no new viral artifact needed —
it makes the artifacts we already have work harder.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/referrals/lookup?code=<CODE>` (new, public, no auth) returns `200 { coachFirstName }`
      when the code resolves to a coach (the first token of the coach's `full_name`); the lookup
      matches the SAME deterministic `makeReferralCode` mapping used everywhere else (vitest:
      seed a coach, compute their code with `makeReferralCode`, assert the lookup returns their
      first name).
- [ ] `GET /api/referrals/lookup` with a code that resolves to no coach returns
      `200 { coachFirstName: null }` (NOT a 404 that would break the page) — an unknown code is a
      graceful null, not an error.
- [ ] The lookup response contains ONLY the referrer's first name: no email, no full name, no
      coach id, no team data, no player data (vitest asserts the response body keys are exactly
      `{ coachFirstName }` and the value is the first name token only — privacy/data-minimization).
- [ ] `GET /api/referrals/lookup` is rate-limited or otherwise hardened against enumeration the
      same way the existing public endpoints are (e.g. it never confirms a code's validity beyond
      returning a first name, and an empty/malformed `code` returns `200 { coachFirstName: null }`
      without a DB scan) — assert a malformed/empty code returns null without throwing.
- [ ] Playwright: visiting `/signup?ref=<valid CODE>` renders a banner naming the inviting coach
      ("Coach <FirstName> invited you" — text matching `/coach \w+ invited/i` for a seeded code),
      replacing the generic "a fellow coach" copy.
- [ ] Playwright: visiting `/signup?ref=<unresolvable CODE>` renders the existing generic
      "invited by a fellow coach" banner (regression: an unresolvable code falls back to today's
      copy and signup still works).
- [ ] Regression: the existing referral capture is unchanged — `/signup?ref=CODE` → `referredByCode`
      → `/api/auth/setup` still writes `preferences.referred_by_code` on the new coach (vitest/
      Playwright: a signup via a referral link is still attributed to the originating coach).
- [ ] Regression: `/signup` with NO `ref` param renders the default headline ("Start coaching
      smarter with SportsIQ") and no referral banner (the warm-landing logic only fires when a
      code is present).

## Out of scope

- Showing the referrer's team card / personality / season recap on the signup page. v1 is the
  name only. A richer "here's what Sarah built" preview is a separate ticket (and would lean on
  0010/0017's existing public artifact surfaces, not signup).
- Resolving or displaying the referrer's full name, photo, email, or any contact info. First name
  only — the inviter is an adult coach, but we still minimize.
- A new referral reward or payout mechanic. This rides the existing `referred_by_code` capture.
- Changing the deterministic `makeReferralCode` algorithm or adding a stored referral-code index
  table. The lookup must reuse the existing code derivation (`src/lib/referral-code.ts`); if a
  reverse lookup needs to scan coaches, scope and bound it — do not introduce a new code format.
- Touching the parent portal, team-card, or season-recap surfaces. Those already construct
  `/signup?ref=CODE` correctly; this ticket only changes what the destination page does with the
  code.
- A new analytics event or tracker. (PostHog already exists; do not add new event types.)
- A new tier gate. The referral landing is an ungated acquisition surface.

## Engineering notes

- `src/app/api/referrals/lookup/route.ts` (new) — public `GET` (no auth), `createServiceSupabase()`.
  Read the `code` query param; if empty/malformed, return `{ coachFirstName: null }` without a
  scan. To resolve code → coach, reuse the EXACT `makeReferralCode` mapping from
  `src/lib/referral-code.ts` (the code is deterministic from the coach UUID; the referral system
  already stores it on `coaches.preferences.referral_code` once generated — see
  `src/app/api/referrals/route.ts`). Prefer matching against the stored
  `preferences.referral_code` (a single indexed-ish lookup) rather than recomputing across all
  coaches; confirm the actual storage path against `src/app/api/referrals/route.ts` and the
  team-card GET (`src/app/api/team-card/[token]/route.ts`) which already resolves a code. Return
  ONLY `{ coachFirstName }` (first token of `full_name`, or `null`).
- Add `/api/referrals/lookup` to `publicPaths` in `src/lib/supabase/middleware.ts` if `/api/*`
  routes are auth-gated by middleware (confirm against how `/api/team-card/` and `/api/share/`
  were added by tickets 0010/0011).
- `src/app/(auth)/signup/page.tsx` — the `SignupForm` already reads `refCode` from
  `useSearchParams()`. When `refCode` is present, fetch `/api/referrals/lookup?code=<refCode>`
  (a small client fetch in an effect, or a `useQuery`) and, if `coachFirstName` resolves, render
  "Coach <FirstName> invited you to SportsIQ" in the `CardDescription` and the emerald referral
  banner instead of the generic copy. When it does not resolve (or the fetch fails), keep today's
  generic "You were invited by a fellow coach!" string byte-for-byte (best-effort warm landing).
  Dark zinc/orange aesthetic; no banned words; no emoji-decorated headings.
- Do NOT change the signup submission path: `referredByCode: refCode` → `/api/auth/setup` stays
  exactly as-is so attribution is unaffected (this ticket only enriches the rendered banner).
- `tests/referrals/lookup.test.ts` (new, `.test.ts` NOT `.spec.ts` — `vitest.config.ts` excludes
  `**/*.spec.ts`; LESSONS.md). Mock `createServiceSupabase` with a seeded coach + stored referral
  code; assert: valid code → `{ coachFirstName }`; unknown code → `{ coachFirstName: null }`;
  empty/malformed code → null with no scan; response body carries ONLY `coachFirstName`.
- `tests/e2e/` — extend the signup/onboarding e2e (e.g. the existing
  `signup-onboarding-capture.spec.ts` / `share-flow.spec.ts` family) so a `/signup?ref=<seeded
  code>` renders the named-coach banner and an unresolvable `ref` renders the generic banner.
  Seed a coach with a deterministic referral code in `tests/e2e/fixtures/seed.sql` (the share/
  team-card flows already seed a coach whose `makeReferralCode` is deterministic — reuse it; the
  signup page reads the lookup endpoint server-side-free but the endpoint is server-backed, so the
  coach + code must be in the seed).
- New deps: no. Migration: no (reuse stored `preferences.referral_code`; do not add a code-index
  table). Env vars: no. AI prompt change: no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0021-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
