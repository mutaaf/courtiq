<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — contributor guide for autonomous agents

This file is the contract for any AI agent (Claude, GPT, etc.) or human contributor working on SportsIQ / courtiq. Read it before you change a single line.

## The non-negotiables

These are not opinions, they're the product:

1. **No regressions allowed.** Every change passes `npm run lint`, `npx tsc --noEmit`, and `npx vitest run` locally before commit. Branch protection on `main` enforces three gating checks: `lint`, `unit-tests`, and `e2e-tests`. `e2e-tests` runs the Playwright suite against a real local Supabase seeded by `tests/e2e/fixtures/seed.sql` — a red Playwright run blocks the merge. Never bypass branch protection.
2. **Children's data is the contract, not a feature.** SportsIQ is COPPA-compliant by construction. Signups require age 13+, the privacy page lives at `/privacy`, and we collect the minimum data needed to coach a youth team. No "let's also capture X for analytics" — if you find yourself adding a tracking field on a player record, stop.
3. **Service-role on the server, helper-functions on the client.** API routes use `createServiceSupabase()` (which bypasses RLS). Client code uses `query()` / `mutate()` from `src/lib/api.ts` — never `createClient()` for DB reads. The only sanctioned client-Supabase call is `supabase.auth.signOut()`.
4. **Every AI call goes through `callAI()` / `callAIWithJSON()`.** Multi-provider abstraction in `src/lib/ai/client.ts` resolves Anthropic / OpenAI / Gemini per-org. Every call is logged to `ai_interactions` for quota enforcement. Never `import Anthropic from '@anthropic-ai/sdk'` directly in a route — that breaks tier limits and provider failover.
5. **Tier gating is server-AND-client.** Use `<UpgradeGate>` on the surface AND verify the tier in the API route (`canAccess()` from `src/lib/tier.ts`). UI-only gates can be bypassed by anyone who reads the source.
6. **Test first, then code.** For Stripe / auth / tier / RLS / AI-quota changes, add or update a vitest spec before implementation. For UI flows, add a Playwright E2E spec. The spec is the proof the feature works and the proof it doesn't regress.
7. **Voice is "youth coach assistant," not "AI for everything."** UI copy and AI prompts speak like a clipboard, not a consumer SaaS landing page. Banned words: "journey", "amazing", "exciting", "elevate", "empower", "synergy", "unlock your potential". Emoji-decorated headings are out. Mobile-first, 44px touch targets, dark theme (zinc-950) + orange accent (#F97316).

## Three agents, one backlog

SportsIQ is built by three specialized subagents working through a single backlog:

| Agent | Role | Lives at | Touches |
|---|---|---|---|
| **Product Groomer** | PO + stakeholder + volunteer-coach user + growth lead in one voice. Generates and grooms feature tickets. | `.claude/agents/product-groomer.md` | `docs/backlog/` only — **never** `src/`, `tests/`, `e2e/`, or `supabase/migrations/` |
| **Implementation Developer** | Test-first executor. Picks the top ticket, writes the failing test, implements, ships through CI on a feature branch as a PR with auto-merge enabled. | `.claude/agents/implementation-dev.md` | Everything — but always via a feature branch + PR, never direct to `main` |
| **PR Reviewer** | Grades the PR against AGENTS.md + the ticket's acceptance criteria. Posts an approve-comment (auto-merge proceeds) or request-changes (auto-merge blocked) with line-anchored notes. | `.claude/agents/pr-reviewer.md` | Read-only on the diff. Only writes via `gh pr review`. |

The backlog at `docs/backlog/` is the single source of truth for what gets built next. Each ticket is a self-contained markdown file (`NNNN-kebab-title.md`) with frontmatter (id, status, priority, area, owner) and a body that includes user story, four-lens "Why now" (PO / Stakeholder / User / Growth), acceptance criteria mapped to test scenarios, out-of-scope, and engineering notes. See `docs/backlog/README.md` for the full conventions.

**The full autonomous loop:**

```
Groomer ──► Dev ──► Reviewer ──► auto-merge ──► auto-deploy
(launchd     (launchd  (launchd polls    (GitHub when    (Vercel on
 every 6h)    every 1h) every 5 min)      CI green +      push to main)
                                          no blocking
                                          review)
```

All three agents run **locally** via your `claude` CLI, so they run against your Claude subscription (no separate API charges for the prompt work — only the model usage your CLI is already authed for).

Each handoff is gated:
- **Dev → Reviewer**: Dev opens the PR with `gh pr merge --auto --squash`. GitHub holds the merge.
- **Reviewer → merge**: branch protection requires `lint`, `unit-tests`, and `e2e-tests` green. The local reviewer agent posts a `--comment` sign-off (informational) or a `--request-changes` review which **blocks** the auto-merge. Because the reviewer runs as the repo owner (same identity as the PR author), GitHub forbids self-approval — we use the request-changes path as the blocker instead of approval as the unblocker.
- **merge → deploy**: Vercel watches the GitHub repo; every push to `main` triggers a production deploy automatically.

**Gating vs non-gating checks.** Exactly three checks gate a merge: `lint`, `unit-tests`, and `e2e-tests`. Every other status — including `Vercel`, `Vercel Preview Comments`, and the nightly AI-contract job — is informational. A red Vercel check never blocks a merge and is never a reason to "fix" a PR. (See `docs/LESSONS.md`.)

**Self-healing.** A PR can pass every gating check and still refuse to merge because its branch fell `BEHIND` `main` (branch protection requires up-to-date branches). The ship agent's first phase *tends* the in-flight PR before considering new work: it rebases a `BEHIND` branch via `gh pr update-branch`, attempts a bounded recovery on a genuinely red gating check, and only stands down when the PR is healthy and simply mid-flight. A single stuck PR can no longer freeze the loop.

**Self-learning.** `docs/LESSONS.md` is the loop's append-only operational memory. Every agent reads it at the start of a run and appends a one-line lesson whenever it hits a novel failure or takes a healing action. Over time the loop stops re-paying for the same debugging passes.

**Slash commands** (manual, interactive — you drive):
- `/ideate [focus area]` — fires the Groomer agent to add new tickets. Optional `$ARGUMENTS` like "growth", "moat", "parent-portal", "billing".
- `/groom` — fires the Groomer to re-prioritize and prune existing tickets without adding new ones.
- `/ship [ticket-id]` — fires the Dev agent to execute the top-priority groomed ticket (or a specific id if you pass one).
- `/backlog` — read-only summary of the current backlog state.
- `/review <PR#>` — manual reviewer pass on a specific PR.

**Autonomous local schedule** (launchd jobs, no human required — see `scripts/agents/README.md`):
- `agent-ship.sh` — fires every hour at :41 local. **First tends the in-flight PR (rebase if BEHIND, bounded recovery if a gating check is red, otherwise wait)**; only when there's no `feat/` PR to tend does it pick the top groomed/proposed ticket and run the full Dev loop, opening a PR with auto-merge enabled. Single-PR-at-a-time gated.
- `agent-groom.sh` — fires every 6 hours at :17 local. Closes superseded `chore/gtm-` PRs, runs the Groomer to re-prioritize + add 2-4 fresh tickets focused on acquisition / retention / moat. Self-gates when there are already 3+ groomed P0/P1 tickets.
- `agent-review.sh` — polls every 5 minutes for open agent PRs with no review yet. Posts a `--comment` sign-off if clean, `--request-changes` if blocking. Self-gates silently when there's nothing to review.
- All three read `docs/LESSONS.md` at start and append novel lessons; the ship agent's healing keeps the pipeline live without a human.
- Install: `bash scripts/agents/install-agents.sh` once on a Mac. Uninstall: `bash scripts/agents/uninstall-agents.sh`. Logs at `~/.cache/sportsiq-agent/logs/`.
- All three have a self-cancel date baked in (2026-06-03) to bound autonomous spend; edit the scripts to extend.

**The handoff discipline:**
- Groomer writes specs. Dev writes code. Reviewer grades. Nobody does the other's job.
- If a spec is ambiguous, the Dev pushes back through the ticket body, not by improvising.
- If a feature would violate this contract (`AGENTS.md`), the Groomer finds a different solution rather than weakening the contract.
- Every ticket is shippable on its own. No "phase 1 / phase 2" multi-ticket plans.

## Architecture, in one paragraph

SportsIQ is a **Next.js 14 App Router** app on **Supabase** (Postgres + Auth + Storage + RLS), deployed on **Vercel**, billed via **Stripe**. Coaches sign in, observe players during practice (voice capture via Web Speech API or uploaded audio transcribed by Gemini), and the platform generates AI artifacts (debriefs, parent reports, practice plans, weekly stars) via a **multi-provider AI client** that routes per-org to Anthropic, OpenAI, or Gemini and logs every call to `ai_interactions` for quota enforcement. Four tiers (Free / Coach $9.99 / Pro $24.99 / Org $49.99) gate features via `src/lib/tier.ts` + `<UpgradeGate>` on the surface and `canAccess()` on the API. Mobile-first dark UI (zinc-950 + #F97316 orange), with a light-themed parent portal at `/share/[token]`. COPPA-compliant: age 13+ signup, minimum data, `/privacy` page.

## Directory map

```
courtiq/
├── AGENTS.md                ← you are here
├── README.md                ← user-facing setup, architecture, tier system
├── CLAUDE.md                ← Claude-Code-specific notes (architecture cheatsheet)
├── CONTRIBUTING.md          ← human-contributor standards (slimmed; backlog lives elsewhere)
├── .claude/
│   ├── agents/
│   │   ├── product-groomer.md       ← the PO + growth subagent
│   │   ├── implementation-dev.md    ← the test-first dev subagent
│   │   └── pr-reviewer.md           ← the contract-enforcing reviewer subagent
│   └── commands/
│       ├── ideate.md        ← /ideate — Groomer adds tickets
│       ├── groom.md         ← /groom — Groomer re-prioritizes
│       ├── ship.md          ← /ship — Dev executes top ticket
│       ├── backlog.md       ← /backlog — read-only summary
│       └── review.md        ← /review — manual Reviewer pass
├── docs/
│   ├── LESSONS.md           ← agent-writable operational memory (read at run start)
│   ├── CHANGELOG.md         ← archive of shipped work prior to the ticket system
│   ├── OPS.md               ← deploy / env / operational runbook
│   ├── PROGRESS.md          ← historical progress notes
│   └── backlog/
│       ├── README.md        ← backlog conventions + index
│       ├── _template.md     ← copy this when writing a new ticket
│       └── NNNN-*.md        ← one file per ticket
├── scripts/
│   ├── agents/              ← autonomous agent launchers (this loop's runtime)
│   │   ├── agent-ship.sh
│   │   ├── agent-groom.sh
│   │   ├── agent-review.sh
│   │   ├── install-agents.sh
│   │   ├── uninstall-agents.sh
│   │   └── README.md
│   ├── stripe-go-live.js    ← existing operational scripts (untouched)
│   ├── stripe-smoke.js
│   └── check-coverage.js
├── package.json
├── playwright.config.ts     ← E2E config (chromium)
├── vercel.json              ← deploy config + ignored-branches list
├── tsconfig.json
├── next.config.ts
├── src/
│   ├── app/                 ← Next.js App Router pages + /api routes
│   ├── components/          ← React components, organized by surface
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── client.ts    ← callAI() / callAIWithJSON() — multi-provider entry point
│   │   │   └── prompts.ts   ← all AI prompt templates (provider-agnostic)
│   │   ├── api.ts           ← client query()/mutate() — DO NOT bypass on client
│   │   ├── tier.ts          ← Free/Coach/Pro/Org limits + canAccess()
│   │   ├── config/resolver.ts ← System→Org→Team config cascade
│   │   └── supabase/        ← service-role + middleware
│   ├── hooks/               ← useTier, useActiveTeam, etc.
│   └── types/               ← database.ts (generated) + domain types
├── supabase/migrations/     ← numbered SQL migrations
├── tests/                   ← vitest unit + AI contract tests
└── e2e/                     ← Playwright specs
```

## How to add a feature (the canonical loop)

**If you're a human** — pick a ticket from `docs/backlog/`, branch, and follow the loop below. Or invoke `/ship <ticket-id>` to delegate to the Implementation Developer subagent.

**If you're the Implementation Developer subagent** — your full execution loop is in `.claude/agents/implementation-dev.md`. The condensed version:

1. **Pick the ticket.** Top-priority `groomed` (or `proposed` if none groomed). Read it in full.
2. **Branch.** `git checkout -b feat/<ticket-id>-<slug>`.
3. **Mark in-progress.** Update the ticket's frontmatter + commit.
4. **Write the failing test FIRST.** For backend/AI/tier changes: a vitest spec. For UI flows: a Playwright E2E. Map every acceptance-criteria checkbox to a test or expectation.
5. **Run the test locally.** Confirm it fails for the right reason.
6. **Write the minimum code to pass the test.** Match the surrounding code's style.
7. **Run the full local gate** — all must pass:
   ```
   npm run lint
   npx tsc --noEmit
   npx vitest run
   ```
   And, if the change touches UI flows, `npx playwright test`.
8. **Commit.** Message names the user-facing behavior. Trailer:
   ```
   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```
9. **Push the branch + open a PR.** `git push -u origin HEAD && gh pr create --fill`.
10. **Watch CI.** `gh pr checks --watch`. Green = update ticket to `shipped`, push the status update. Red = fix, push, repeat.

Never push to `main` directly. Never bypass branch protection. Never disable a passing test to ship.

## Where things live

| Task | File |
|---|---|
| Add an AI feature | `src/lib/ai/prompts.ts` (add the prompt), then a route under `src/app/api/ai/<name>/route.ts` that calls `callAI()` / `callAIWithJSON()`. Always pass `orgId` so quota + provider routing work. Add a vitest contract test under `tests/ai/`. |
| Change tier limits | `src/lib/tier.ts` — bump the constant. Add a vitest test that asserts the new limit is honored server-side. Verify `<UpgradeGate>` surfaces the right gate. |
| Add a feature gate | `src/components/ui/upgrade-gate.tsx` — add the feature key + benefit copy. Also gate it server-side in the API route via `canAccess(orgId, 'feature_key')`. |
| Add a new DB table | New numbered migration under `supabase/migrations/`. Add types to `src/types/database.ts`. Add the table name to the allow-list in `src/app/api/data/route.ts` and `src/app/api/data/mutate/route.ts`. |
| Add a route (page) | New file under `src/app/<route>/page.tsx`. If it should be reachable without auth (parent portal, terms, privacy, org landing pages), add it to `publicPaths` in `src/lib/supabase/middleware.ts`. |
| Touch Stripe | `src/app/api/stripe/*/route.ts`. NEVER instantiate `new Stripe()` at module top — use the lazy `getStripe()` factory. Webhook signature verification is non-negotiable. Add a vitest spec for the new flow. |
| Add an env var | Add a default to `.env.example`. Document it in `docs/OPS.md`. Set it in Vercel for preview + production. Never commit the actual secret. |

## Test infrastructure

- **Unit / contract**: `vitest` under `tests/`. Run with `npx vitest run`. Includes the AI contract suite under `tests/ai/` (validates prompts produce structurally-correct output across providers — nightly).
- **E2E**: `@playwright/test` under `tests/e2e/`. Run with `npx playwright test`. Chromium-only on the PR gate; mobile-chrome is a separate hardening ticket. In CI the suite runs against a real local Supabase (`supabase start`) seeded by `tests/e2e/fixtures/seed.sql` — the seed is applied with `psql ON_ERROR_STOP=1` so a seed failure fails the job, and the build/server get the real local Supabase URL + keys (not dummy values).
- **CI**: see `.github/workflows/ci.yml`. Three jobs: `lint` (lint + tsc), `unit-tests` (vitest), `e2e-tests` (Supabase + seed + Next.js build + Playwright). All three gate PRs to `main`. Branch protection lists the required checks on the server; the workflow file alone doesn't enforce gating.
- **Auto-merge**: see `.github/workflows/auto-merge.yml`. Flips drafts to ready and arms squash auto-merge. Auto-merge waits on the three gating checks; a request-changes review from the Reviewer agent blocks it.

## Running locally

```bash
npm install                  # one-time
npm run dev                  # http://localhost:3000
npm run lint                 # ESLint
npx tsc --noEmit             # TypeScript
npx vitest run               # unit + AI contract
npm run test:e2e             # Playwright (needs the dev server already running on :3000)
npm run build                # production build (used by Vercel)
```

## Hard NOs

- **Don't push directly to `main`.** Branch protection rejects it. Always a feature branch + PR.
- **Don't disable a passing test** to make your PR green. Fix the bug instead. If the test was wrong, document why in the PR and update the test in the same PR.
- **Don't bypass branch protection.** If CI is red, fix the underlying issue.
- **Don't hardcode an AI provider.** Always go through `callAI()` / `callAIWithJSON()`. No `new Anthropic()` / `new OpenAI()` in routes.
- **Don't call Supabase directly from client components** for DB reads/writes. Use `query()` / `mutate()` from `src/lib/api.ts`. RLS will block direct client calls anyway; bypassing it is a security regression waiting to happen.
- **Don't gate features only on the client.** Always pair `<UpgradeGate>` with a server-side `canAccess()` check in the API route.
- **Don't widen what we collect on minors.** Adding a new field on `players` is a discussion, not a unilateral change.
- **Don't introduce a sync backend, an analytics SDK, or a tracker** without an explicit ticket-level approval line. The privacy page makes specific promises.
- **Don't ship "AI-generic" UI.** No emoji-decorated headings, no purple gradients, no "AI for everything" copy. Match the dark-theme + orange-accent aesthetic; the parent portal is the only light-mode surface and uses gray/orange.
- **Don't `git push origin main`** from an agent prompt. (Hard NO from the historical loop — the prior single-agent prompt did this and silently failed against branch protection for weeks.)
- **Don't loop on the same change.** If `git status` shows nothing to commit, don't push an empty commit; exit cleanly. (See LESSONS.md re: the "55 local changes" retry loop.)
- **Don't overwrite `CONTRIBUTING.md` or `AGENTS.md` with empty content.** If you intend to edit them, read first. (See LESSONS.md re: the empty-string overwrite incident.)
- **Don't weaken Stripe webhook signature verification.** It's the entire trust boundary for billing state changes.

## Known issues

(none right now — keep this section as a parking spot for partial fixes and
documented quirks. The living version is `docs/LESSONS.md`.)

## When things go wrong

> The living version of this list is `docs/LESSONS.md`, which the autonomous
> agents read and extend on every run. Add new operational lessons there, not
> here.

## Agent parameters

> Read by the shared `agent-fleet` runners at runtime. The one place the generic
> ship/groom/review prompts look for CourtIQ's specifics.

- **Gating checks** — EXACTLY these three GitHub check names gate a merge.
  Everything else (`Vercel`, preview comments, the nightly AI-contract job) is
  informational and MUST be ignored when deciding mergeability or what to "fix":
  - `lint`
  - `unit-tests`
  - `e2e-tests`
- **Agent branch prefixes**: `feat/` (features, ship), `chore/gtm-` (backlog
  refresh, groom).
- **Local gate command** (heal/dev runs this before pushing; all must pass):
  `npm run lint && npx tsc --noEmit && npx vitest run`
- **Subagents** (`.claude/agents/`): `implementation-dev`, `gtm-innovation`,
  `review` (the latter two are the fleet-standard names; `product-groomer` /
  `pr-reviewer` remain as aliases for the slash commands).
- **Backlog areas**: billing | ai | tier | capture | timer | plans | parent-portal | onboarding | infra | privacy | growth | analytics
- **Backlog validator**: `node scripts/check-backlog.mjs`, wired into the `lint`
  gating job — keeps ticket files and the README index in sync.

## License

Private. For me, and for whoever I hand a copy to. AI agents may contribute, but credit yourself in the commit trailer.
