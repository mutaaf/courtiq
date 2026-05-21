# scripts/agents/ — local autonomous agents

Three launchd jobs that run the Groomer, Implementation-Dev, and PR Reviewer agents against this repo on a schedule, using your local `claude` CLI. No remote routines, no extra subscription charge — just your Claude usage when the agents actually run.

## What's here

| File | Role |
|---|---|
| `agent-ship.sh` | Fired hourly at :41 local. **First heals the in-flight PR** — rebases a `BEHIND` branch (`gh pr update-branch`), runs a bounded recovery on a red *gating* check, or just waits on a healthy mid-flight PR. Only when there's nothing to heal does it pick the top groomed/proposed ticket, invoke the `implementation-dev` subagent, and open a PR with auto-merge enabled. A single stuck PR can no longer freeze the loop. |
| `agent-groom.sh` | Fired every 6 hours at :17 local. Closes superseded `chore/gtm-` PRs, then invokes the `product-groomer` subagent to re-prioritize the backlog and add 2-4 new tickets. Self-gates when there are already 3+ groomed P0/P1 tickets. |
| `agent-review.sh` | Polls every 5 minutes for open agent PRs lacking a review from the repo owner. For each: invokes the `pr-reviewer` subagent which grades against AGENTS.md + the ticket and posts `--comment` (sign-off) or `--request-changes` (blocking). Ignores non-gating checks (Vercel). Self-gates silently when nothing to review. |
| `install-agents.sh` | Generates `~/Library/LaunchAgents/com.sportsiq.agent-{ship,groom,review}.plist` and loads them into launchd. Idempotent. |
| `uninstall-agents.sh` | Unloads all three jobs and removes the plists. Keeps logs. |

All three read `docs/LESSONS.md` at the start of a run and append novel lessons — the loop's self-learning memory. Gating checks are exactly `lint`, `unit-tests`, `e2e-tests`; everything else (Vercel) is informational.

## Quickstart

```bash
# from the repo root
bash scripts/agents/install-agents.sh
```

You must have `claude`, `git`, and `gh` available in your PATH and authenticated. `claude` should be your Claude Code CLI; `gh` should have repo write permissions on `mutaaf/courtiq`.

## Running one now (don't wait for the cron)

```bash
launchctl kickstart -k gui/$UID/com.sportsiq.agent-ship
launchctl kickstart -k gui/$UID/com.sportsiq.agent-groom
launchctl kickstart -k gui/$UID/com.sportsiq.agent-review
```

## Watching them

```bash
# tail every run's per-script log
ls -lt ~/.cache/sportsiq-agent/logs/ | head -10
tail -f ~/.cache/sportsiq-agent/logs/$(ls -t ~/.cache/sportsiq-agent/logs/ | head -1)

# launchd's own stdio (one file per job, overwritten each run)
tail -f ~/.cache/sportsiq-agent/logs/launchd-ship.out
tail -f ~/.cache/sportsiq-agent/logs/launchd-ship.err
```

## Status checks

```bash
launchctl print gui/$UID/com.sportsiq.agent-ship | head -30
launchctl print gui/$UID/com.sportsiq.agent-groom | head -30

# disable temporarily (re-enable with `enable`)
launchctl disable gui/$UID/com.sportsiq.agent-ship
launchctl enable  gui/$UID/com.sportsiq.agent-ship
```

## Updating

Edit `agent-ship.sh`, `agent-groom.sh`, or `agent-review.sh` in this repo. Then:

```bash
bash scripts/agents/install-agents.sh
```

The installer re-bootstraps the plists, which re-reads the script paths.

## Uninstalling

```bash
bash scripts/agents/uninstall-agents.sh
```

## What runs on each tick

Each script:

1. Sets PATH (launchd starts processes with a minimal env).
2. Checks the **self-cancel date** (2026-06-03 UTC). Past that, prints a re-arm hint and exits. Bound the autonomous spend.
3. Pulls the repo into `~/.cache/sportsiq-agent/checkout/` (clones first time, resets to `origin/main` thereafter).
4. Configures git as a non-human committer (`SportsIQ Dev Agent` / `SportsIQ Groomer Agent`).
5. Hands the agent prompt to `claude --print --dangerously-skip-permissions`. The CLI does the rest via tool use — branching, writing tests, running `npm run lint / tsc / vitest`, pushing, opening the PR, watching CI.

## Caveats and gotchas

- **Mac must be awake.** launchd queues at most one missed run per `StartCalendarInterval` entry. If you close the lid at 22:00 local and open it at 09:00, you get one queued ship run, not eleven.
- **`--dangerously-skip-permissions`** auto-approves every tool call. We're running it because there's no human to approve. Make sure the prompt itself is conservative — it is (HARD NOs section in `AGENTS.md` and in each script).
- **Token usage** bills directly to whatever your local `claude` CLI is authed to. Watch your usage at https://console.anthropic.com.
- **Don't run two ships in parallel.** The single-PR-at-a-time gate in the prompt prevents most issues, but if you `launchctl kickstart` twice rapidly you can race. The cron's :41 spread + single-PR gate handle the normal case. The ship agent heals OR ships in a run, never both, so a kickstart while a PR is mid-heal is safe.
- **First run is slow.** First clone is ~200 MB. Subsequent runs are pulls of a few KB.
- **Branch protection on `main`** must require all three gating checks (`lint`, `unit-tests`, `e2e-tests`). Without `e2e-tests` listed, auto-merge fires on the other two going green — defeating the safety net the reviewer agent's request-changes was supposed to enforce. Verify with `gh api repos/mutaaf/courtiq/branches/main/protection --jq '.required_status_checks.contexts'`.

## Why local and not remote routines / GitHub Actions

- **Remote routines** bill per session against your Claude plan. With hourly ship + 6-hourly groom + 5-min review polling that's ~300+ sessions a day, most of them no-ops. Local just bills Anthropic API tokens for the work actually done.
- **GitHub Actions** also works (free CI minutes on a public repo + API token usage). Trade-off: GHA runs even when your Mac is asleep, but means hosting the API key as a repo secret. Easy to switch later by porting these scripts to a workflow.
- **Local launchd** is the simplest answer when your Mac is on most of the time and you already have `claude`, `git`, and `gh` authenticated.

## One-time setup before first install

Before running `install-agents.sh`, make sure:

1. `gh auth status` shows you authenticated with repo write on `mutaaf/courtiq`.
2. `claude --version` works (Claude Code CLI installed and signed in).
3. `git config --global user.email` is set (the scripts set their own local identity but a global fallback prevents launchd surprises).
4. Branch protection on `main` lists `lint`, `unit-tests`, and `e2e-tests` as required status checks. Without this, the ship agent can ship work that bypasses the E2E gate.
