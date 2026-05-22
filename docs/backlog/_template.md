---
id: NNNN
title: Short imperative title
status: proposed
priority: P2
area: capture
created: YYYY-MM-DD
owner: product-groomer
---

## User story

As a [persona, e.g. "volunteer YMCA basketball coach mid-season"], I want [specific behavior], so that [user-visible outcome — not engineering, not metrics].

## Why now (four lenses)

### Product Owner
What is the smallest meaningful unit of value? What gets simpler for the user, not just richer? A great PO removes friction faster than they add surface area.

### Stakeholder
How does this widen the moat (multi-provider AI routing / structured coach artifact / tier-aware quota / parent-portal viral loop / Practice Arc memory)? Or — if it doesn't widen the moat — what specific user pain does it cure that justifies the work?

### User (at 5:45pm on a Tuesday, 12 kids on a court)
What does this feel like to use on a phone, between drills, with cold hands? Is the interaction one tap or three? Does it survive a flaky cellular connection? Does it work if the coach is talking to a parent while tapping?

### Growth
Why does this make a coach come back tomorrow AND tell one specific person about it (another coach, a program director, a parent)? What's the "show me" moment — the single screenshot that makes someone say "wait, what is that"? If a feature has neither retention nor a viral artifact, it's a maintenance ticket, not a growth one.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario. The dev agent will write tests against this list before writing code.

- [ ] [Observable behavior 1 — be specific. e.g. "POST /api/stripe/webhook with an invalid signature returns 400 and does not touch the org's tier."]
- [ ] [Observable behavior 2.]
- [ ] [Observable behavior 3.]
- [ ] [Regression check that's relevant. e.g. "Existing tier-downgrade flow on `customer.subscription.deleted` still fires."]
- [ ] [Tier / privacy check: server-side enforcement is asserted, not just `<UpgradeGate>` rendering.]
- [ ] [If AI is involved: contract test covers the prompt under at least Anthropic and one fallback provider.]

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- ...
- ...

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/app/api/...` — what to change here
- `src/lib/...` — utility / helper changes
- `tests/...` — where the vitest spec goes
- `e2e/...` — where the Playwright spec goes
- New deps: yes/no, and which
- Migration needed: yes/no, and at what version
- Env vars needed: yes/no — list, and which environments (dev/preview/prod)
- AI prompt change: yes/no, which prompt in `src/lib/ai/prompts.ts`
- Tier feature key: yes/no, which (`feature_*`) in `src/lib/tier.ts`

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/NNNN-...` opened
- YYYY-MM-DD — failing test added in `tests/...` or `e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
