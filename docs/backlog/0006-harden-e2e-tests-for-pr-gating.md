---
id: 0006
title: Harden e2e-tests for PR-gating (seed a local Supabase, restore as required check)
status: in-progress
priority: P0
area: infra
created: 2026-05-20
owner: product-groomer
---

## User story

As the operator of the autonomous agent loop, I want `e2e-tests` to be a reliable PR-gating check — running against a real local Supabase with seeded test data so the existing `share-flow.spec.ts` / `parent-portal.spec.ts` / etc. specs actually pass — and then re-promoted to branch protection's required-status-checks list, so that no PR can land with a UI regression silently shipped, and the reviewer agent's contract enforcement extends to the rendered surface.

## Why now (four lenses)

### Product Owner
Until E2E is a real gate, every UI feature ships on faith. The reviewer agent can grade prompts and tier logic, but it can't catch a parent portal that renders blank because a query selector changed. The smallest meaningful unit of value: spin up Supabase in CI, seed three rows, let the existing specs pass.

### Stakeholder
This is the seatbelt for the agent loop itself. The agent will ship UI changes regularly; without an E2E gate, regressions land silently and parents see broken share pages mid-season. This ticket converts the agent loop from "ships fast" to "ships fast AND safe."

### User (at 5:45pm on a Tuesday, parent opens a share link)
Indirect: this ticket protects them. A parent opening a share link from a coach should never see a broken page. The E2E gate is what keeps that promise.

### Growth
Trust-as-product. Every broken parent portal share is a permanent referral channel loss. This ticket has the same shape as ticket 0001 (Stripe webhook signature verification) — invisible until something breaks, catastrophic when it does.

## Acceptance criteria

Each box maps 1:1 to a CI / Playwright result or a config assertion.

- [ ] `.github/workflows/ci.yml`'s `e2e-tests` job spins up a local Supabase (via `supabase` CLI or a docker-compose snippet — pick the lighter approach) before `npm start`. The Supabase URL and anon key passed to `npm run build` and `npm start` are the real values of that local instance, not `localhost:54321` + `test-anon-key`.
- [ ] A seed script (new file: `tests/e2e/fixtures/seed.sql` or `tests/e2e/fixtures/seed.ts`) creates the minimum rows needed for the existing E2E specs: at least one org, one team, one player (named "Alice Walker" to match `share-flow.spec.ts:51`), one practice session with a few observations, and one valid `share_tokens` row pointing at that player. Document the seed contents in the spec via comments where the names are referenced.
- [ ] The seed runs after Supabase is up but before `npm start` is launched. Failure to seed fails the job (no `|| true` masking).
- [ ] `npm run test:e2e` runs WITHOUT the `|| true` swallower. Job fails on red Playwright.
- [ ] All existing E2E specs pass on the seeded data. If any spec is testing an obsolete UI surface, mark it `test.skip()` with a one-line comment naming the ticket that should restore it; do NOT delete the spec.
- [ ] Branch protection on `main` is updated to add `e2e-tests` back to `required_status_checks.contexts`:
  ```
  gh api -X POST repos/mutaaf/courtiq/branches/main/protection/required_status_checks/contexts \
    -f 'contexts[]=e2e-tests'
  ```
  Asserted by `gh api repos/mutaaf/courtiq/branches/main/protection --jq '.required_status_checks.contexts'` listing all three: `["lint","unit-tests","e2e-tests"]`.
- [ ] `AGENTS.md`, `docs/LESSONS.md`, and the agent scripts in `scripts/agents/` no longer carry the "informational until 0006 ships" caveat — they describe e2e-tests as a true gate.
- [ ] First agent PR after this ticket lands actually runs E2E for real and either passes or gets `--request-changes` from the reviewer agent.

## Out of scope

- Adding mobile-webkit as a second Playwright project. Chromium-only is fine for v1 PR-gating; mobile is a separate hardening ticket.
- Refactoring the existing E2E specs to mock Supabase at the network layer (almanac's approach). The decision here is to seed real data; rationale: courtiq's pages already render correctly when Supabase responds, so the cost of a real DB in CI is lower than the cost of maintaining a parallel network-mock layer.
- Seed data for billing flows. The Stripe tickets 0001-0005 cover those at the vitest layer; E2E doesn't need to walk Stripe Checkout (it's Stripe's domain).
- Parallelizing Playwright workers beyond the existing `2`.

## Engineering notes

- `.github/workflows/ci.yml` — `e2e-tests` job. Two reasonable approaches:
  1. **Supabase CLI**: `supabase start` in the job (requires Docker on the runner; GitHub-hosted ubuntu-latest has Docker). Provides a full local Supabase including Auth and Storage. Slower setup (~60-90s) but matches local dev.
  2. **Postgres only + supabase-js with a service-role key**: stand up a postgres container, apply `supabase/migrations/*.sql` against it, point `NEXT_PUBLIC_SUPABASE_URL` at it. Lighter (~20s setup) but no Auth/Storage.
  Recommend (1) for fidelity; the e2e suite's setup time is dwarfed by Playwright itself anyway.
- Seed file location: `tests/e2e/fixtures/seed.sql` (raw SQL applied after migrations) OR `tests/e2e/fixtures/seed.ts` (a Node script using the service-role client). SQL is simpler.
- The Stripe env vars in the e2e-tests job can stay dummy — no E2E test should walk a real Stripe checkout (Stripe owns that page).
- `playwright.config.ts` — confirm `retries: 2` is already set (per CI-flakiness convention). If not, add it.
- `package.json` — `npm run test:e2e` should not need changes; it's the underlying playwright config and the surrounding workflow that do.
- New deps: `supabase` CLI is already installable via the workflow (e.g. `npx supabase@latest start`); no `package.json` addition needed if we use npx.
- Migration needed: no (we apply existing migrations to the local DB; that's the point).
- Env vars needed: only at the workflow level (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — emitted by `supabase start`, captured into job env).
- AI prompt change: no.
- Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-20 — Ticket created in response to PR #209's e2e-tests failure. Symptom: `share-flow.spec.ts` expected "Alice Walker" / "E2E Test Team" but CI had no Supabase running. See `docs/LESSONS.md` 2026-05-20 entry.
