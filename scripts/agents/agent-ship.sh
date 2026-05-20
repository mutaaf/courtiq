#!/bin/bash
# Local autonomous "ship" agent. Fired by launchd (every hour at :41 local).
#
# - Pulls the latest main into a persistent working checkout (node_modules
#   persists between runs — `git clean -fdq` leaves gitignored files alone).
# - Asks the local `claude` CLI to (1) HEAL the in-flight PR if one is stuck
#   (rebase BEHIND branches, bounded recovery on red gating checks), and only
#   if there's nothing to heal, (2) run the implementation-dev loop on the top
#   groomed/proposed ticket. A single stuck PR can no longer freeze the loop.
# - Reads docs/LESSONS.md at start and appends novel lessons (self-learning).
# - All work happens via claude's tool use; this script is just the launcher.
#
# Logs land in ~/.cache/sportsiq-agent/logs/ship-<UTC timestamp>.log.

set -euo pipefail

# launchd starts processes with a minimal environment — set PATH ourselves.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="${HOME:-/Users/$(whoami)}"

REPO_URL="https://github.com/mutaaf/courtiq"
WORKDIR="$HOME/.cache/sportsiq-agent/checkout"
LOG_DIR="$HOME/.cache/sportsiq-agent/logs"
mkdir -p "$WORKDIR" "$LOG_DIR"

TS=$(date -u +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/ship-$TS.log"
exec >"$LOG" 2>&1

echo "=== sportsiq-ship firing $(date -u) (local $(date)) ==="
echo "PATH=$PATH"
echo "HOME=$HOME"
echo "claude=$(command -v claude || echo MISSING)"
echo

# Self-cancel after 2026-06-03 UTC. Bound the autonomous spend. Edit and reinstall to extend.
TODAY=$(date -u +%Y%m%d)
if [ "$TODAY" -ge "20260603" ]; then
  cat <<EOF
expired — local launchd agent has reached its 14-day self-cancel date.

To re-arm, edit scripts/agents/agent-ship.sh and bump the cutoff date, then:
  bash scripts/agents/install-agents.sh
EOF
  exit 0
fi

# Fresh-pull each run; depth-50 history is enough for our ops (rebase, log).
if [ ! -d "$WORKDIR/.git" ]; then
  git clone --depth=50 "$REPO_URL" "$WORKDIR"
fi
cd "$WORKDIR"
git fetch origin --prune --quiet
git checkout main --quiet
git reset --hard origin/main --quiet
git clean -fdq

# All branches the agent creates are committed under this identity.
git config user.email "noreply@anthropic.com"
git config user.name "SportsIQ Dev Agent"

# Hand off to the local claude. --print is non-interactive,
# --dangerously-skip-permissions auto-approves every tool call (no human here).
claude --print --dangerously-skip-permissions <<'PROMPT'
You are the autonomous Ship runner for this SportsIQ repo (you are already at
its working dir on main). Your job each run is to keep the pipeline LIVE:
first heal any in-flight PR, and only if there's nothing to heal, ship the
next ticket.

PHASE 0 — Load the contract and the memory.
  Read, in order: AGENTS.md, docs/LESSONS.md, docs/backlog/README.md. LESSONS.md
  is the loop's operational memory — obey it, and append to it when you learn
  something novel (see PHASE 3).

PHASE 1 — Tend the in-flight PR (self-healing). This phase REPLACES any
"any feat/ PR open → exit" gate. A single stuck PR must never freeze the loop.

  Find open agent feature PRs:
    gh pr list --state open --base main --json number,headRefName,mergeStateStatus,statusCheckRollup \
      --jq '[.[] | select(.headRefName | startswith("feat/"))]'
  If the list is EMPTY → go to PHASE 2.
  If non-empty, tend the LOWEST-numbered one (the oldest); call it PR #N on
  branch B. Diagnose it:

  Gating checks are EXACTLY these three (everything else, including Vercel and
  "Vercel Preview Comments", is informational and MUST be ignored):
      "lint", "unit-tests", "e2e-tests"

  Decide and act (do exactly ONE healing action, then exit — never heal AND ship
  in the same run):

  (a) A gating check is FAILURE / ERROR / CANCELLED  → RED-CI RECOVERY:
        - Bound it: COUNT prior heal commits on the branch:
            git log origin/main..origin/B --grep '^heal:' --oneline | wc -l
          If that count is >= 2, post a PR comment that 2 healing attempts are
          exhausted and a human should look, then exit. Do NOT try a third time.
        - Otherwise reproduce locally and fix:
            git checkout -B B origin/B
            npm ci   (only if node_modules is missing or package-lock changed)
            Run the command for the FAILING gating check:
              "lint"        → npm run lint && npx tsc --noEmit
              "unit-tests"  → npx vitest run
              "e2e-tests"   → npx playwright install --with-deps chromium
                              (then) npm run build  (with the dummy env vars
                              from .github/workflows/ci.yml's e2e-tests job)
                              (then) npm start &  and  npm run test:e2e
                              If reproducing E2E locally is impractical (port
                              5432 in use, etc.), read the failing run's
                              playwright-report artifact and infer the root
                              cause from there.
          Read the real failure. Make the MINIMUM fix that addresses the root
          cause. Never weaken/skip a test to make it pass. Re-run the failing
          gate locally until green. Commit as:
            heal: <one-line root cause> (attempt K)
            Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
          Push to the branch (git push origin HEAD:B). Auto-merge stays enabled;
          CI re-runs. Append a LESSONS line if the cause is novel. Exit.

  (b) Else if mergeStateStatus == BEHIND  → the branch is just stale:
        gh pr update-branch N
        (Branch protection requires up-to-date branches; this is a common cause
        of a green PR that won't merge.) Auto-merge fires once CI re-runs green.
        This lesson is already in LESSONS.md, so do NOT re-log it. Exit.

  (c) Else if mergeStateStatus == DIRTY  → merge conflict with main:
        git checkout -B B origin/B
        git merge origin/main      (resolve only OBVIOUS conflicts — e.g. the
                                    backlog README index table or LESSONS.md;
                                    for real source conflicts you can't resolve
                                    safely, post a PR comment for a human and
                                    exit WITHOUT pushing)
        On a clean resolve: re-run the local gate (lint + tsc + vitest), commit
        the merge, push. Exit.

  (d) Else if the gating checks are still PENDING / queued / null  → the PR is
        mid-flight and healthy. Print "PR #N in-flight (checks running) — waiting"
        and exit.

  (e) Else (all three gating checks green, mergeStateStatus CLEAN, not yet
        merged) → make sure auto-merge is actually enabled:
          gh pr merge N --auto --squash
        Print "PR #N healthy, auto-merge armed — waiting" and exit.

PHASE 2 — Ship the next ticket (only reached when there's no feat/ PR to tend).
  Pick efficiently: read the INDEX TABLE in docs/backlog/README.md (do NOT open
  all ticket files). Choose the highest-priority row with status `groomed`
  (tie-break: lower id). If none groomed, choose the highest-priority `proposed`.
  If nothing actionable, print "no actionable tickets" and exit. Then open ONLY
  that one ticket file and read it in full.

  Execute the implementation-dev loop via the Task tool with
  subagent_type="implementation-dev" (.claude/agents/implementation-dev.md).
  Hand it the ticket id and instruct it to run its loop verbatim:

    1.  git checkout -b feat/<ticket-id>-<short-slug>
    2.  Update the ticket frontmatter to status: in-progress; commit as first.
    3.  Write the failing test FIRST. For backend/AI/tier/billing changes: a
        vitest spec under tests/. For UI flows: a Playwright spec under e2e/.
        Every acceptance-criteria checkbox maps to a test or expectation.
        Run it; confirm it fails for the right reason.
    4.  Implement the minimum code to make the test pass.
    5.  Run the full local gate — all MUST pass:
          npm run lint
          npx tsc --noEmit
          npx vitest run
        Plus, if the change touches UI flows: npx playwright test.
    6.  Commit with an editorial message; include the trailer:
          Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    7.  git push -u origin HEAD
    8.  gh pr create --fill --base main
    9.  gh pr merge --auto --squash
   10.  gh pr checks --watch  (wait up to 20 min)
   11.  On green CI: update the ticket frontmatter to status: shipped + append
        to Implementation log; commit and push to the branch.
   12.  On red CI: leave the ticket in-progress and the PR open with a comment
        naming the exact failure. The NEXT ship run's PHASE 1 will recover it.

PHASE 3 — Learn. If during this run you discovered a NOVEL operational lesson
  (a failure mode + its root cause + the fix, or a healing action future runs
  should know about) that is NOT already in docs/LESSONS.md, append one entry
  in the documented format on whatever branch you were working (the feat/
  branch during a ship, the PR branch during a heal). Never push to main just
  to log a lesson. Never re-log a lesson already present.

HARD NOS — these fail the run:
  • Never push to main directly.
  • Never disable, weaken, or skip a passing test (including to "heal" a PR).
  • Never bypass branch protection or attempt to merge with a red GATING check.
  • Never "fix" a non-gating check (Vercel etc.) — ignore it.
  • Never hardcode an AI provider in a route — always callAI() / callAIWithJSON().
  • Never call Supabase directly from a client component for DB reads/writes.
  • Never ship a feature gate as UI-only (must pair <UpgradeGate> with server-
    side canAccess()).
  • Never weaken Stripe webhook signature verification.
  • Never widen what we collect on minors without ticket-level approval.
  • Never introduce a sync backend, an analytics SDK, or a tracker without
    ticket-level approval.
  • Never push an empty diff or loop on the same change. If `git diff --quiet
    HEAD` is true, exit cleanly. (See LESSONS.md re: the "55 local changes"
    retry loop.)
  • Never overwrite AGENTS.md, CONTRIBUTING.md, docs/LESSONS.md, or
    docs/backlog/README.md with empty content. Read first.
  • Never exceed 2 heal attempts on one PR — escalate to a human comment instead.

End with: what you did this run (HEAL #N <action> | SHIP <ticket-id> | WAIT |
NOOP), PR url, CI state, ticket id + final status, any spawned sibling tickets,
and any lesson appended.
PROMPT

EXIT=$?
echo
echo "=== sportsiq-ship complete $(date -u) — exit=$EXIT ==="
exit $EXIT
