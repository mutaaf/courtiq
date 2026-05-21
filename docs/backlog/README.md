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
| 0007 | Restore onboarding E2E coverage against the combined /onboarding/setup page | P1 | groomed | infra |
| 0008 | Show free coaches their AI usage so the monthly wall stops being a surprise | P1 | proposed | tier |
| 0009 | Put the Player of the Week / Player of the Match spotlight on the parent portal | P2 | proposed | parent-portal |
| 0010 | Make the Team Personality card a public, coach-to-coach referral surface | P2 | proposed | growth |
| 0001 | Stripe webhook signature verification on the live endpoint | P0 | shipped | billing |
| 0002 | End-to-end checkout flow test — upgrade → pay → tier unlocks features | P0 | shipped | billing |
| 0003 | Cancellation flow test — cancel → webhook → downgrade at period end | P0 | shipped | billing |
| 0004 | Payment-failure handling — failed payment → past_due → warning banner | P0 | shipped | billing |
| 0005 | Resubscription flow — free user re-upgrades after cancellation | P0 | shipped | billing |
| 0006 | Harden e2e-tests for PR-gating (seed Supabase, restore as required check) | P0 | shipped | infra |

## Hand-off discipline

Groomer never edits `src/`, `tests/`, `e2e/`, or `supabase/migrations/`. Dev never invents acceptance criteria the ticket doesn't already have — if the ticket is unclear, the dev pushes back via the ticket's body, not by improvising.
