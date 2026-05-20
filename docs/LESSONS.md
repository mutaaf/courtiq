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

Branch protection gates merges on exactly these three checks:

- `lint`
- `unit-tests`
- `e2e-tests` (Playwright chromium)

**Every other check is informational and must be ignored when deciding whether a PR can merge** — including `Vercel`, `Vercel Preview Comments`, and the nightly `ai-contract-validation` / `full-test-suite` jobs. A red Vercel check never blocks a merge and is never a reason to "fix" anything.

**Setup note**: as of 2026-05-20 the `e2e-tests` job is wired to run on PRs (previously main-only) and to fail-block on a red Playwright run (previously `|| true`). Branch protection settings on `main` must list `e2e-tests` as a required status check; if it isn't, the auto-merge will fire on `lint` + `unit-tests` green alone. Verify with: `gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts'`.

## Entries

- 2026-05-11 [legacy-agent] The previous single-agent loop entered a retry loop producing ~20 identical commits titled "feat: push 55 local changes to remote" (batches `1/3`, `2/5`, `2b/5`, ...) within 90 minutes → the agent had nothing new to commit but kept pushing because its loop didn't gate on "is there a diff?" or "is there an open PR for my work?" → ALWAYS check `git diff --quiet HEAD` and `gh pr list --state open --base main --head feat/*` before opening another PR. If a PR is already open for the work, exit cleanly; don't pile on.
- 2026-05-10 [legacy-agent] CONTRIBUTING.md was overwritten with an empty string twice in a day (commits `9a82901` and `2d66833`) → an Edit step shipped an empty replacement → before any Write on `AGENTS.md`, `CONTRIBUTING.md`, `docs/LESSONS.md`, or `docs/backlog/README.md`, Read the file first and confirm the new content is non-empty. Never `> file` or write a blank string to these load-bearing docs.
- 2026-05-13 [legacy-agent] The previous single-agent loop included `git push origin main` in its prompt, which silently failed against branch protection for weeks → branch protection on `main` blocks direct pushes from any non-bypass identity → autonomous agents MUST use `git push -u origin HEAD` to a `feat/<ticket-id>-<slug>` branch and `gh pr create --fill`, never push to main.
- 2026-05-20 [ship] Single-PR-at-a-time gate without a healing phase causes one stuck PR to freeze ALL shipping → if step 1 exits whenever any `feat/` PR is open, a `BEHIND` or red PR no one tends will block the backlog indefinitely → tend the PR FIRST (rebase BEHIND, recover red gating check, wait if healthy) and only ship a new ticket when nothing's stuck.
- 2026-05-20 [ship] A PR with all gating checks green still won't auto-merge and shows `mergeStateStatus: BEHIND` → branch protection requires the branch to be up to date with `main`, and nothing rebases it automatically → run `gh pr update-branch <n>`; CI re-runs on the new merge commit and auto-merge fires when green.
- 2026-05-20 [ship] `Vercel` check reports FAILURE but the PR is otherwise mergeable → Vercel is NOT a branch-protection gating check → ignore its state entirely when deciding mergeability or whether to attempt a fix. Only `lint`, `unit-tests`, and `e2e-tests` gate.
- 2026-05-20 [infra] The `e2e-tests` job was promoted from main-only (with `|| true` swallowing failures) to a PR-gating check that actually fails CI on red Playwright → the job runs with dummy Supabase + Stripe env vars (see `.github/workflows/ci.yml`) and may be flaky until the test setup is hardened → expect early agent PRs to hit red E2E; the ship agent's healing phase should attempt up to 2 recoveries per PR before posting a human-escalation comment.
