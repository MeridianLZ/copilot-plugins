#!/usr/bin/env bash
# preflight-guard.sh — copilot-home preToolUse hook (inject lane).
# Minimal destructive-command guard; denies are recorded on the blackboard.
# stdin: hook JSON {toolName, toolArgs (object OR JSON-encoded string), sessionId, cwd}.
# stdout on deny: {"permissionDecision":"deny","permissionDecisionReason":"..."}
# Fail-closed semantics: this event denies on non-zero exit; keep it fast
# (timeouts fail OPEN per CLI semantics — the repo-scope lane is the backstop).
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bb-lib.sh
. "$SCRIPT_DIR/bb-lib.sh"

Usage() {
  echo "Usage: preflight-guard.sh [-h|--help]  (reads hook JSON on stdin)"
}
case "${1:-}" in -h|--help) Usage; exit 0;; esac

INPUT="$(cat 2>/dev/null || true)"
SID="$(printf '%s' "$INPUT" | jq -r '.sessionId // .session_id // empty' 2>/dev/null)"
TOOL="$(printf '%s' "$INPUT" | jq -r '.toolName // .tool_name // empty' 2>/dev/null)"
# toolArgs may arrive as an object or a JSON-encoded string — normalize both.
CMD="$(printf '%s' "$INPUT" | jq -r '
  (.toolArgs // .tool_input // {}) |
  (if type == "string" then (try fromjson catch {}) else . end) |
  (.command // .cmd // "")' 2>/dev/null)"

deny() {
  local reason="$1"
  [ -n "$SID" ] && bb_append "$SID" "preflight-guard" "preflight-guard" "orchestrator" "decision" \
    "$(jq -cn --arg r "$reason" --arg c "$CMD" '{verdict:"deny", reason:$r, command:$c}')"
  jq -cn --arg r "$reason" '{permissionDecision:"deny", permissionDecisionReason:$r}'
  exit 0
}

case "$TOOL" in
  bash|powershell|shell)
    case "$CMD" in
      *"push --force"*|*"push -f "*|*"push -f") deny "Force push blocked by copilot-home preflight-guard; use --force-with-lease after a goose-preflight-checklist GO." ;;
      *"rm -rf /"*|*"rm -rf ~"*) deny "Recursive delete of / or ~ blocked by copilot-home preflight-guard." ;;
      *"kubectl delete "*|*"helm uninstall "*|*"helm delete "*) deny "Direct cluster mutation blocked by copilot-home preflight-guard; route through your deployment pipeline." ;;
      *"git reset --hard origin/"*) deny "Discarding local work against remote blocked; stash or branch first." ;;
    esac
    ;;
esac

echo '{}'
exit 0
