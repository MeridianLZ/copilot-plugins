#!/usr/bin/env bash
# session-blackboard-close.sh — copilot-home sessionEnd hook.
# Appends the terminal entry; notification-only event, stdout ignored.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bb-lib.sh
. "$SCRIPT_DIR/bb-lib.sh"

Usage() {
  echo "Usage: session-blackboard-close.sh [-h|--help]  (reads hook JSON on stdin)"
}
case "${1:-}" in -h|--help) Usage; exit 0;; esac

INPUT="$(cat 2>/dev/null || true)"
SID="$(printf '%s' "$INPUT" | jq -r '.sessionId // .session_id // empty' 2>/dev/null)"
[ -n "$SID" ] || exit 0

bb_append "$SID" "primary-orchestrator" "primary-orchestrator" "orchestrator" "decision" \
  '{"note":"session_end"}'
exit 0
