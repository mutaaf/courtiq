---
id: 0022
title: Turn the parent-reaction thank-you screen into the moment the parent acts on the app
status: proposed
priority: P2
area: parent-portal
created: 2026-05-22
owner: product-groomer
---

## User story

As a parent who just tapped a heart and sent "way to go!" to the coach from my kid's
report, I want the thank-you screen to give me something to do next — share this with
the other parents, or start my own team if I coach too — so that the most enthusiastic
moment I have with this app isn't a dead end that says "message sent" and stops.

## Why now (four lenses)

### Product Owner
The `ParentReactionForm` (`src/components/share/parent-reaction-form.tsx`) is the portal's
peak-emotion moment: a parent who just chose a reaction and typed a message is the most
engaged visitor we will ever have. Today, on submit, the form swaps to a static success
state — a confetti emoji, "Message sent!", and nothing else. Meanwhile the portal already
carries two outbound paths: the `ParentViralCTA` forward button (0011) and, per ticket 0019,
a direct "start your own team" self-signup link — but both live at the BOTTOM of a long
scrolling report, far from this peak moment. The smallest meaningful unit of value is to put
the same two referral-carrying actions on the reaction success screen itself, where the
parent's hand is already on the button and their enthusiasm is highest. We are relocating
existing CTAs to the highest-intent micro-surface, not inventing new ones.

### Stakeholder
This widens the parent-portal viral loop at its emotional apex. The forward CTA at the page
bottom converts the small fraction of parents who scroll all the way down and still feel like
acting; the reaction success screen converts the parent who just demonstrated peak engagement
by sending a message. Same referral code, same destinations, dramatically better placement.
It compounds 0011 (the forward path) and 0019 (the self-signup path) by giving both a second,
better-timed surface — the moat deepens by reuse, not by a new mechanism.

### User (Saturday morning, parent who just sent the coach a heart)
The parent taps a reaction, types "so proud of her," hits send. The screen confirms "Message
sent — Coach Sarah will see it" and, right below, two quiet options: "Share this with the
other parents" and, for the parent who coaches too, "Start your own team — free." One tap to
spread it, one tap to convert. On a flaky connection the self-signup option is a plain
server-passed `<a href>` (it inherits the referral code already resolved on the portal), so it
works even when JS is shaky; the forward option uses the same `navigator.share` path the
existing CTA uses.

### Growth
This is the conversion-placement ticket: the same loop, fired at the moment of maximum
goodwill. The "show me" is implicit — the parent who just said "way to go" is the one most
likely to say it to the other parents too, and we hand them the button at exactly that
second. Retention/virality compound: every reaction (which we already collect) becomes a
fork point into the referral loop instead of a dead end. No new artifact, no new tracker —
purely placing the existing referral-carrying actions where intent peaks.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] The reaction success state (after `POST /api/parent-reactions` returns 200) renders a
      self-signup link that is a real `<a href>` whose href contains `/signup?ref=` followed by
      the portal's resolved referral code (component test asserts the href by attribute — it must
      be a plain link so it works without JS, mirroring ticket 0019's self-signup CTA).
- [ ] The reaction success state renders a "share with the other parents" forward control that
      reuses the existing forward behavior (the same `navigator.share` / clipboard path as
      `ParentViralCTA`); when no referral code is present it falls back to the bare app URL
      (component test — a missing code never breaks either action, same defensive fallback as
      0011/0019).
- [ ] The referral code reaches the reaction form from the portal server component as a prop —
      the `'use client'` form does NOT call Supabase or resolve the code itself (AGENTS.md rule 3;
      assert the form receives the code as a prop and renders the link from it).
- [ ] Privacy/COPPA: the self-signup href and the forward payload carry ONLY the referral code —
      no player name, no parent name, no message text, no share token is placed in the outbound
      `/signup` URL or share text (component/Playwright asserts the outbound URL contains only
      `ref=<code>` query data).
- [ ] The pre-submit reaction form is unchanged: the reaction buttons, message field, and submit
      behavior all work exactly as today, and a successful submit still records the reaction via
      `POST /api/parent-reactions` (regression — the submit path is untouched; only the success
      view gains the two actions).
- [ ] Playwright: on a seeded `/share/[token]` portal, submitting a reaction shows the success
      state containing BOTH the "share with the other parents" control AND the "start your own
      team" self-signup link whose href contains the seeded coach's referral code.
- [ ] Regression: the bottom-of-page `ParentViralCTA` (0011) and the 0019 self-signup CTA still
      render as before — this ticket ADDS the actions to the success screen; it does not remove
      the page-bottom CTAs.

## Out of scope

- Removing or restyling the page-bottom `ParentViralCTA` (0011) or the 0019 self-signup CTA.
  This ticket adds the actions to the reaction success screen only.
- Building a new referral surface or a new endpoint. The referral code is already resolved on
  the portal (`GET /api/share/[token]`, ticket 0011) and passed to `ParentViralCTA`; thread the
  same value into the reaction form.
- A "share your reaction message" feature that exposes the parent's typed message or the kid's
  name in the outbound link. The outbound link carries only the referral code (COPPA / data
  minimization).
- Changing the reaction submission, validation, or rate-limiting in `POST /api/parent-reactions`.
- A parent-account product. The self-signup link sends the parent to the standard coach
  `/signup` flow (age 13+) — no new parent role, no minor account.
- A new analytics event or tracker. (PostHog already exists; do not add new event types.)
- A new tier gate. The reaction form lives on the already-gated portal; the relocated CTAs inherit
  that visibility with no new `feature_*` key.

## Engineering notes

- `src/components/share/parent-reaction-form.tsx` (`'use client'`) — add an optional
  `referralCode?: string | null` prop. In the `state === 'success'` branch, render two actions
  below the "Message sent!" confirmation: (1) a self-signup `<a href={`/signup?ref=${code}`}>`
  falling back to `/signup` when no code (same primitive as ticket 0019's self-signup CTA — a
  plain link, NOT a JS handler); (2) a forward control reusing the existing share behavior. If a
  shared presentational piece is cleaner, extract the forward button so both this success screen
  and `ParentViralCTA` share it rather than duplicating the `navigator.share` logic — but do NOT
  modify `ParentViralCTA`'s public behavior. Light-mode gray/orange portal aesthetic; banned
  words apply; 44px touch targets.
- `src/app/share/[token]/page.tsx` — the server component already destructures `referralCode`
  from the `GET /api/share/[token]` payload (ticket 0011) and passes it into `ParentViralCTA`.
  Pass the same `referralCode` into `<ParentReactionForm ... referralCode={referralCode} />`. No
  new resolution, no Supabase access added to the client component.
- `src/app/api/share/[token]/route.ts` — already returns the creating coach's referral `code`
  (ticket 0011). No change expected; confirm the field name the portal already uses
  (`referralCode`) and reuse it.
- COPPA / data minimization: the outbound `/signup` href and the forward share text carry ONLY
  `ref=<code>` — never the player name, parent name, message text, or share token.
- `tests/components/parent-reaction-form.test.tsx` (new or extend) — render the form, drive it to
  the success state (mock `fetch` to return 200), and assert: the self-signup link href contains
  `/signup?ref=<code>`; the fallback to `/signup` with no code; the forward control reuses the
  app URL with the code; only `ref=<code>` is in the outbound URL (no PII). Use `.test.tsx`.
- `tests/e2e/share-flow.spec.ts` (extend the 0006-seeded share spec) — submit a reaction on the
  seeded portal and assert both success-screen actions render with the seeded coach's referral
  code in the self-signup href. The portal is a server component, so the referral code in the
  href must come from the seeded coach (the share/team-card flows already seed a deterministic
  `makeReferralCode` coach — reuse it; LESSONS.md 2026-05-21).
- New deps: no. Migration: no. Env vars: no. AI prompt change: no. Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0022-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
