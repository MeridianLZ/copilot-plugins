#!/usr/bin/env bash
# session-blackboard-init.sh — copilot-home sessionStart hook.
# stdin: hook JSON (sessionId|session_id, source: startup|resume|new).
# stdout: flat {"additionalContext": "..."} (Copilot dialect — no wrapper).
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=bb-lib.sh
. "$SCRIPT_DIR/bb-lib.sh"

Usage() {
  echo "Usage: session-blackboard-init.sh [-h|--help]  (reads hook JSON on stdin)"
}
case "${1:-}" in -h|--help) Usage; exit 0;; esac

INPUT="$(cat 2>/dev/null || true)"
SID="$(printf '%s' "$INPUT" | jq -r '.sessionId // .session_id // empty' 2>/dev/null)"
SRC="$(printf '%s' "$INPUT" | jq -r '.source // "startup"' 2>/dev/null)"
[ -n "$SID" ] || SID="unknown-$(date -u +%s)"

bb_append "$SID" "primary-orchestrator" "primary-orchestrator" "orchestrator" "plan" \
  "$(jq -cn --arg src "$SRC" '{note:"session_start", source:$src}')"

BB_FILE="$(bb_dir)/$SID.jsonl"
TRACE="$(bb_trace_id "$SID")"
jq -cn --arg ctx "copilot-home agent_blackboard active for this session.
Blackboard file: $BB_FILE (append-only JSONL; schema in the blackboard-sync skill).
Session trace_id (W3C, derive spans from it): $TRACE
Agent roster: primary-orchestrator (orchestrator) | csharp-azure-architect, foundry-sdk-implementer, ai-research-engineer (specialists) | chewy, buzz, goose (first-class peers via copilot-mcp persistent sessions).
All first-class agents append their exchanges to the blackboard with full metadata (session_id, agent_id, primary_agent_id, blackboard_id, traceparent)." \
  '{additionalContext:$ctx}'
exit 0
