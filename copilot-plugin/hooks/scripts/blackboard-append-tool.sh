#!/usr/bin/env bash
# blackboard-append-tool.sh — copilot-home postToolUse / errorOccurred hook.
# Appends an OTel-ready tool-event line to the session blackboard.
# stdin: hook JSON. stdout: {} (no mutation of results).
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bb-lib.sh
. "$SCRIPT_DIR/bb-lib.sh"

Usage() {
  echo "Usage: blackboard-append-tool.sh [-e|--event artifact|error] [-h|--help]  (reads hook JSON on stdin)"
}
EVENT="artifact"
while [ $# -gt 0 ]; do
  case "$1" in
    -e|--event) EVENT="${2:-artifact}"; shift 2;;
    -h|--help) Usage; exit 0;;
    *) shift;;
  esac
done

INPUT="$(cat 2>/dev/null || true)"
SID="$(printf '%s' "$INPUT" | jq -r '.sessionId // .session_id // empty' 2>/dev/null)"
[ -n "$SID" ] || { echo '{}'; exit 0; }

# Compact payload: tool name + args digest only — the native transcript is the
# verbatim authority; the blackboard records coordination metadata, not bulk.
PAYLOAD="$(printf '%s' "$INPUT" | jq -c '{
  tool: (.toolName // .tool_name // "unknown"),
  args_digest: ((.toolArgs // .tool_input // {}) | tostring | .[0:200]),
  error: (.error // null)
}' 2>/dev/null || echo '{"tool":"unparseable"}')"

bb_append "$SID" "copilot-session" "copilot-session" "orchestrator" "$EVENT" "$PAYLOAD"
echo '{}'
exit 0
