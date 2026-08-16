#!/usr/bin/env bash
# postToolUse / errorOccurred — append-only JSONL audit trail (SOC 2 CC7.2, SOX evidence).
# Observational only: cannot block, the action has already run.
set -euo pipefail
EVENT="postToolUse"
[ "${1:-}" = "--event" ] && EVENT="${2:-error}"
INPUT="$(cat)"
LOG_DIR="${COPILOT_FINTECH_AUDIT_DIR:-$HOME/.copilot-fintech-audit}"
mkdir -p "$LOG_DIR"
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$INPUT" | jq -c \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg user "${USER:-unknown}" \
    --arg ev "$EVENT" '{
      ts:$ts, user:$user, event:$ev,
      tool:(.toolName // .tool_name // null),
      cwd:(.cwd // null),
      args_digest:((.toolArgs // .tool_input // {}) | tostring | @base64 | .[0:64])
    }' >> "$LOG_DIR/$(date -u +%Y-%m-%d).jsonl" 2>/dev/null || true
fi
exit 0
