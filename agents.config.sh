# agents.config.sh — CourtIQ fleet manifest (plumbing only).
# Semantics live in AGENTS.md § Agent parameters. After editing, redeploy:
#   bash ../agent-fleet/lib/install.sh /Users/mutaafaziz/Desktop/projects/courtiq
#
# NOTE: launchd cutover is HELD until two preconditions are met (see MIGRATION.md
# Phase A / the courtiq backlog):
#   1. The 26-PR graveyard is cleared (stale DIRTY/BEHIND feat/ + legacy
#      swarm/agent/ PRs). The kit ship agent heals the lowest-numbered feat/ PR
#      each run — pointing it at conflicting cruft would just churn.
#   2. Standard subagents exist (gtm-innovation, review — added as copies of
#      product-groomer / pr-reviewer).
# Fixing the legacy `com.sportsiq.*` namespace → `com.courtiq.*` happens on the
# first kit install (uninstall the sportsiq jobs first).

PROJECT_NAME="CourtIQ"
SLUG="courtiq"
NAMESPACE="com.courtiq"
REPO_URL="https://github.com/mutaaf/courtiq"
MODEL="claude-opus-4-7"

GIT_AUTHOR_NAME="CourtIQ Agent"
GIT_AUTHOR_EMAIL="noreply@anthropic.com"

SELF_CANCEL="20260621"

SHIP_MINUTE=41
GROOM_HOURS="0 6 12 18"
GROOM_MINUTE=17
REVIEW_INTERVAL=300

ENG_ENABLED=0
