# Agent Lessons — operational memory for the autonomous loop

This is the self-learning layer. Every autonomous agent (ship, groom, review) **reads this file at the start of every run**, right after `AGENTS.md`, and **appends a new entry whenever it hits a failure or takes a healing action that a future run should know about.**

The goal is compounding: a problem solved once should never cost a full debugging pass again. `AGENTS.md` is the *contract* (what you must / mustn't do); this file is *experience* (what actually went wrong and how it was fixed).

## How to write an entry

- One entry per lesson. Keep it to 1–3 lines.
- Format: `- YYYY-MM-DD [agent/phase] SYMPTOM → CAUSE → FIX`
- Only append a **novel** lesson. Before adding, scan the entries below; if the lesson is already here, do nothing (don't re-log known failures).
- Entries ride on whatever branch you're already working (the feature branch during a ship, the PR branch during a heal, the `chore/gtm-` branch during a groom). Never push to `main` directly just to record a lesson.
- Prune only during a `groom` run, and only to merge exact duplicates. Never delete a lesson that still describes live behavior.

## Gating vs non-gating CI checks (load-bearing — read before judging mergeability)

Branch protection currently gates merges on TWO checks:

- `lint`
- `unit-tests`

`e2e-tests` runs on every PR (no longer main-only) but is **informational** (`npm run test:e2e || true`) because CI has no Supabase instance — data-dependent specs like `share-flow.spec.ts` fail expecting seeded rows. The promotion-to-gating work lives in ticket `docs/backlog/0006`. When that ships, remove `|| true` from `ci.yml` and add `e2e-tests` back to `required_status_checks.contexts` on `main`.

**Every other check is informational and must be ignored when deciding whether a PR can merge** — including `Vercel`, `Vercel Preview Comments`, the nightly `ai-contract-validation` / `full-test-suite` jobs, and (for now) `e2e-tests`. A red Vercel or e2e-tests check never blocks a merge today and is never a reason to "fix" anything except as work scoped under ticket 0006.

## Entries

- 2026-05-11 [legacy-agent] The previous single-agent loop entered a retry loop producing ~20 identical commits titled "feat: push 55 local changes to remote" (batches `1/3`, `2/5`, `2b/5`, ...) within 90 minutes → the agent had nothing new to commit but kept pushing because its loop didn't gate on "is there a diff?" or "is there an open PR for my work?" → ALWAYS check `git diff --quiet HEAD` and `gh pr list --state open --base main --head feat/*` before opening another PR. If a PR is already open for the work, exit cleanly; don't pile on.
- 2026-05-10 [legacy-agent] CONTRIBUTING.md was overwritten with an empty string twice in a day (commits `9a82901` and `2d66833`) → an Edit step shipped an empty replacement → before any Write on `AGENTS.md`, `CONTRIBUTING.md`, `docs/LESSONS.md`, or `docs/backlog/README.md`, Read the file first and confirm the new content is non-empty. Never `> file` or write a blank string to these load-bearing docs.
- 2026-05-13 [legacy-agent] The previous single-agent loop included `git push origin main` in its prompt, which silently failed against branch protection for weeks → branch protection on `main` blocks direct pushes from any non-bypass identity → autonomous agents MUST use `git push -u origin HEAD` to a `feat/<ticket-id>-<slug>` branch and `gh pr create --fill`, never push to main.
- 2026-05-20 [ship] Single-PR-at-a-time gate without a healing phase causes one stuck PR to freeze ALL shipping → if step 1 exits whenever any `feat/` PR is open, a `BEHIND` or red PR no one tends will block the backlog indefinitely → tend the PR FIRST (rebase BEHIND, recover red gating check, wait if healthy) and only ship a new ticket when nothing's stuck.
- 2026-05-20 [ship] A PR with all gating checks green still won't auto-merge and shows `mergeStateStatus: BEHIND` → branch protection requires the branch to be up to date with `main`, and nothing rebases it automatically → run `gh pr update-branch <n>`; CI re-runs on the new merge commit and auto-merge fires when green.
- 2026-05-20 [ship] `Vercel` check reports FAILURE but the PR is otherwise mergeable → Vercel is NOT a branch-protection gating check → ignore its state entirely when deciding mergeability or whether to attempt a fix. Only `lint` and `unit-tests` gate (and `e2e-tests` once 0006 ships).
- 2026-05-20 [infra] First attempt to promote `e2e-tests` to a PR-gating check failed: PR #209 ran the suite without Supabase + without seeded data, and `share-flow.spec.ts` failed expecting "Alice Walker" / "E2E Test Team" rows that don't exist → CI's dummy env vars (`localhost:54321` for Supabase, `dummy` for Stripe) make data-dependent specs structurally unrunnable → reverted to `|| true` informational mode; gating promotion now lives in ticket 0006 (Harden e2e-tests for PR-gating). Do NOT re-promote until that ticket lands.
- 2026-05-20 [ship/heal] ~14 vitest tests "fail" locally (`localStorage.clear is not a function`, jsdom render tests timing out at 5s, `player-of-match` date asserting `Apr 27` vs `Apr 28`) while `main` is green → the local machine runs **Node 25** but CI pins **Node 20** (`.github/workflows/ci.yml`), and the machine TZ isn't UTC — Node 25 + jsdom breaks the native `localStorage`/timers and shifts date formatting → these are NOT regressions. Confirm by running the suspect files on a pure `origin/main` worktree under the same Node; if `main` fails identically, the local gate's vitest signal is environmental — push and let CI (Node 20) arbitrate. Never skip/weaken the tests to make them pass.
- 2026-05-20 [ship/heal] Most open `feat/*` PRs (#40,#46,#49,#50,#52,#53,#54,#56,#57,#58,#60,#65,#109) are ORPHANS of the pre-2026-05-18 history (root `f61614c`) — `git merge-base origin/main <pr>` returns nothing, so they're permanently `DIRTY` and unhealable (already escalated; humans are re-filing them, e.g. #45 merged). The strict "tend the LOWEST-numbered PR" rule would re-escalate one orphan per run forever and starve genuinely-healable PRs → treat orphans as not-tendable (skip, surface in summary) and tend the lowest PR that actually **shares an ancestor** with `main` (verify with `git merge-base`). PR #210 was such a PR: DIRTY only on the slimmed-vs-legacy `CONTRIBUTING.md`, resolved in favor of `main`.
