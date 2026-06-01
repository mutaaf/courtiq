# Backlog

The single source of truth for what gets built next. Owned jointly by the **Product Groomer** subagent (writes tickets) and the **Implementation Developer** subagent (ships them).

## How it works

1. **Ideate** — `/ideate` (or `@product-groomer`) generates new tickets and drops them in this directory as `NNNN-kebab-title.md`.
2. **Groom** — `/groom` re-prioritizes existing tickets, rewrites vague ones, prunes the no-longer-worth-doing.
3. **Ship** — `/ship` (or `/ship 0003`) picks the top-priority ticket, opens a branch, writes the test first, ships it through CI, opens a PR.

The PR merges only when the gating CI checks pass (see `AGENTS.md`).

## Ticket conventions

Every ticket lives in its own file named `NNNN-kebab-title.md` where `NNNN` is a zero-padded incrementing id. Use `_template.md` as the starting point — copy it, don't edit it.

**Frontmatter is required:**

```yaml
---
id: 0007
title: Webhook signature verification
status: groomed     # proposed | groomed | in-progress | shipped | rejected | needs-discovery
priority: P0        # P0 (do now) | P1 (next sprint) | P2 (someday-maybe) | P3 (icebox)
area: billing       # billing | ai | tier | capture | timer | plans | parent-portal | onboarding | infra | privacy | growth | analytics
created: 2026-05-20
owner: product-groomer
---
```

**Body must include:**
1. **User story** — the persona + behavior + outcome triple.
2. **Why now (four lenses)** — Product Owner, Stakeholder, User, Growth.
3. **Acceptance criteria** — checkbox list that maps 1:1 to vitest or Playwright test scenarios.
4. **Out of scope** — explicit anti-goals so the dev agent doesn't gold-plate.
5. **Engineering notes** — files to touch, dependencies, hard constraints (migrations, env vars, tier-gate keys, AI prompt locations).
6. **Implementation log** — appended by the dev agent during execution.

## Priorities

- **P0** — ships this week. Either user-visible breakage, a security / privacy / billing issue, or a wedge a sibling ticket depends on.
- **P1** — ships next. The next compounding lever (a real feature, a meaningful UX leap, a moat-deepener).
- **P2** — someday-maybe. Good ideas waiting for context. Most tickets sit here.
- **P3** — icebox. Don't ship without a fresh `/groom` pass first.

## Statuses

- `proposed` — written by Groomer, not yet validated for execution.
- `groomed` — validated; acceptance criteria are test-shaped; ready for dev to pick up.
- `in-progress` — a feature branch + PR is open against it.
- `shipped` — merged on `main`. Keep the file for traceability.
- `rejected` — closed without shipping. Body explains why.
- `needs-discovery` — too vague; needs a `/groom` rewrite or human conversation.

## Areas

Used in frontmatter `area:` field. Keep it short and scoped:

- `billing` — Stripe, subscriptions, checkout, invoicing, webhooks
- `ai` — anything routed through `callAI()` / prompts / contract tests
- `tier` — Free/Coach/Pro/Org limits, `<UpgradeGate>`, server-side gating
- `capture` — Quick Capture, voice input, observation save flow
- `timer` — Practice Timer (countdown, break screen, drill queue)
- `plans` — practice planning, Practice Arc, drill library
- `parent-portal` — `/share/[token]`, parent reports, parent contact, sharing
- `onboarding` — signup, first-team, first-practice activation
- `infra` — CI, deployment, migrations, monitoring, dev ergonomics
- `privacy` — COPPA, data minimization, share-link safety, account deletion
- `growth` — landing page, org/`[slug]` pages, referral surfaces, conversion
- `analytics` — coach-facing analytics, momentum, skill trends, weekly star

## Index (top of the stack, by priority)

> Updated by `/groom`. This table is the truth about ordering; ignore filesystem ordering.
> Sorted by status (in-progress > groomed > proposed > needs-discovery > shipped > rejected), then priority (P0 > P1 > P2 > P3), then id ascending.

| id | title | priority | status | area |
|----|-------|----------|--------|------|
| 0061 | Show the coach who this kid was in Week 1 and who this kid is now, on one screen, after a full season of notes | P1 | in-progress | analytics |
| 0062 | When the coach has been capturing all season but hasn't said a single word about Maya in 8 days, nudge them with her name — not the whole roster | P1 | groomed | capture |
| 0063 | When a coach clones another coach's practice plan, let them follow that coach's next drops in one tap — and tell the published coach | P1 | groomed | plans |
| 0060 | When a parent reads two of their kids' reports on SportsIQ, give them one tap to bring the OTHER kid's coach onto the app with their kid's name attached | P1 | shipped | growth |
| 0059 | When a kid ages up to next year's coach in the same program, hand the new coach what worked for the kid | P1 | shipped | ai |
| 0001 | Stripe webhook signature verification on the live endpoint | P0 | shipped | billing |
| 0002 | End-to-end checkout flow test — upgrade → pay → tier unlocks features | P0 | shipped | billing |
| 0003 | Cancellation flow test — cancel → webhook → downgrade at period end | P0 | shipped | billing |
| 0004 | Payment-failure handling — failed payment → past_due → warning banner | P0 | shipped | billing |
| 0005 | Resubscription flow — free user re-upgrades after cancellation | P0 | shipped | billing |
| 0006 | Harden e2e-tests for PR-gating (seed Supabase, restore as required check) | P0 | shipped | infra |
| 0051 | Let the coach delete a practice that shouldn't be on the team's record | P0 | shipped | capture |
| 0052 | Let the coach start the next season with an edited roster without losing player history | P0 | shipped | onboarding |
| 0053 | Let an org admin delete a team that shouldn't be on the organization's roster | P0 | shipped | tier |
| 0007 | Restore onboarding E2E coverage against the combined /onboarding/setup page | P1 | shipped | infra |
| 0008 | Show free coaches their AI usage so the monthly wall stops being a surprise | P1 | shipped | tier |
| 0011 | Carry the coach's referral code through the parent portal's "share with your other coach" CTA | P1 | shipped | growth |
| 0012 | Make multi-provider AI failover real — when the primary provider errors, callAI() retries a fallback | P1 | shipped | ai |
| 0014 | Show last practice's focus areas at the top of Capture so the coach picks up where they left off | P1 | shipped | capture |
| 0015 | Give the coach a one-tap "invite your assistant coach" link that carries their referral code | P1 | shipped | growth |
| 0016 | Make the parent report a continuity artifact that tells the growth story since the last report | P1 | shipped | ai |
| 0017 | Turn the end-of-season recap into a public card the coach is proud to send | P1 | shipped | growth |
| 0018 | Make the Practice Arc remember itself — surface "what carried forward" at the next practice | P1 | shipped | plans |
| 0020 | Bring the active Practice Arc onto Capture so the coach picks up the arc mid-practice | P1 | shipped | capture |
| 0021 | Name the inviting coach on the referral signup so the invite lands warm, not anonymous | P1 | shipped | growth |
| 0023 | Give the coach a Monday "your week in coaching" digest that pulls them back in | P1 | shipped | analytics |
| 0024 | Let a program director bring their whole coaching staff onto SportsIQ from the org page | P1 | shipped | growth |
| 0026 | Give the coach a public, shareable coaching profile a parent or rival coach can land on | P1 | shipped | growth |
| 0027 | Turn the game recap into a public card the coach drops in the team group chat on the drive home | P1 | shipped | parent-portal |
| 0029 | Turn the helper who used the observer link into a coach with their own free team | P1 | shipped | growth |
| 0033 | Let a cold searcher find a program and claim the team they coach — free | P1 | shipped | growth |
| 0035 | Turn the AI-quota wall into a one-tap upgrade that finishes the exact artifact the coach was making | P1 | shipped | tier |
| 0036 | Catch the coach at the season's end with a wrap-up and a one-tap way to start next season | P1 | shipped | onboarding |
| 0038 | Put every public coach surface in the sitemap so cold searchers can find them | P1 | shipped | growth |
| 0039 | Keep the coach's drill thumbs-up across phones, teams, and seasons | P1 | shipped | plans |
| 0041 | Roll up the week's parent reactions into a Monday "here's what they said" the coach actually opens | P1 | shipped | parent-portal |
| 0042 | Send one honest "still coaching this season?" check-in to a coach who's been quiet 14 days, with a one-tap pause | P1 | shipped | onboarding |
| 0044 | When a coach thumbs-up a drill, suggest the next drill other coaches in the same sport ran after it | P1 | shipped | plans |
| 0045 | Carry the drills the coach didn't get to last practice into next week's plan | P1 | shipped | plans |
| 0046 | Give the coach a one-tap sideline cheat sheet — one line per kid to say to that kid's parent | P1 | shipped | ai |
| 0047 | Show the coach the moment their invited coach signed up, with a one-tap "invite the next one" | P1 | shipped | growth |
| 0048 | Give the coach one short text per kid to paste into Messages after a game — the post-game complement to the sideline cheat sheet | P1 | shipped | ai |
| 0049 | Let a coach publish a great practice plan as a one-tap clone link another coach saves to their team in 10 seconds | P1 | shipped | plans |
| 0054 | Let the coach claim a vanity URL (/coach/sarah-rodriguez) so their profile fits in an email signature | P1 | shipped | growth |
| 0055 | Show a coach the practice plans other coaches in their league have published, before generic AI suggestions | P1 | shipped | plans |
| 0057 | Let the coach drop a one-tap "what my team is working on this week" card into the league group chat | P1 | shipped | growth |
| 0058 | Catch the coach on Sunday night with the half-built plan they left on the kitchen table | P1 | shipped | onboarding |
| 0009 | Put the Player of the Week / Player of the Match spotlight on the parent portal | P2 | shipped | parent-portal |
| 0010 | Make the Team Personality card a public, coach-to-coach referral surface | P2 | shipped | growth |
| 0013 | Give the Player-of-the-Week spotlight its own rich link preview when a parent forwards the portal | P2 | shipped | parent-portal |
| 0019 | Let the parent who is also a coach start their own free team from the report they're reading | P2 | shipped | growth |
| 0022 | Turn the parent-reaction thank-you screen into the moment the parent acts on the app | P2 | shipped | parent-portal |
| 0025 | When the coach starts observing a player, remind them what that player was working on | P2 | shipped | capture |
| 0028 | Give the program director a weekly "program pulse" they actually read instead of a dashboard they don't | P2 | shipped | analytics |
| 0030 | Walk the brand-new coach to their first shareable AI artifact the moment they have enough notes | P2 | shipped | onboarding |
| 0031 | Let a program director set one weekly focus that shows up in every coach's Capture and practice plan | P2 | shipped | plans |
| 0032 | Show the coach where they are in the season so the arc itself pulls them back | P2 | shipped | analytics |
| 0034 | Let the parent report remember a returning player across seasons, not just within one | P2 | shipped | ai |
| 0037 | Make practice plans learn the coach's own style across every team they've run | P2 | shipped | ai |
| 0040 | Turn an opponent scouting profile and this team's last 4 weeks into a one-tap pre-game brief | P2 | shipped | ai |
| 0043 | Turn the season's middle into a one-tap parent newsletter that tells the team's whole arc, not just last week | P2 | shipped | ai |
| 0050 | When a parent loves the report, let them forward it to their program's director with one tap to bring the whole league onto SportsIQ | P2 | shipped | growth |
| 0056 | Let the coach send a one-line thank-you back to a parent who left a reaction, in one tap | P2 | shipped | parent-portal |

## Hand-off discipline

Groomer never edits `src/`, `tests/`, `e2e/`, or `supabase/migrations/`. Dev never invents acceptance criteria the ticket doesn't already have — if the ticket is unclear, the dev pushes back via the ticket's body, not by improvising.
