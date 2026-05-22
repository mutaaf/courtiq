# agents.config.sh — CourtIQ fleet manifest (plumbing only).
# Semantics (gating checks, branch prefixes, local gate, hard NOs) live in
# AGENTS.md § Agent parameters. After editing, redeploy:
#   bash ../agent-fleet/lib/install.sh /Users/mutaafaziz/Desktop/projects/courtiq

PROJECT_NAME="CourtIQ"
SLUG="courtiq"
NAMESPACE="com.courtiq"          # fixes the legacy com.sportsiq.* namespace
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
