#!/bin/bash
# Unloads the three launchd agents and removes the plists. Keeps logs.

set -euo pipefail

AGENTS_DIR="$HOME/Library/LaunchAgents"
DOMAIN="gui/$UID"

for LABEL in com.sportsiq.agent-ship com.sportsiq.agent-groom com.sportsiq.agent-review; do
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$AGENTS_DIR/$LABEL.plist"
done

echo "✓ uninstalled launchd agents (logs preserved at ~/.cache/sportsiq-agent/logs/)"
