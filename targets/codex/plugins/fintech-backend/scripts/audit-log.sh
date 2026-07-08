#!/usr/bin/env bash
# PostToolUse[*] — append-only JSONL audit trail of tool invocations (SOC 2 CC7.2, SOX evidence)
set -euo pipefail
INPUT="$(cat)"
LOG_DIR="${CLAUDE_FINTECH_AUDIT_DIR:-$HOME/.claude-fintech-audit}"
mkdir -p "$LOG_DIR"
printf '%s' "$INPUT" | jq -c \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg user "${USER:-unknown}" '{
    ts: $ts, user: $user,
    session: (.session_id // null),
    tool: (.tool_name // null),
    cwd: (.cwd // null),
    file: (.tool_input.file_path // .tool_input.path // null),
    input_digest: ((.tool_input // {}) | tostring | @base64 | .[0:64]),
    ok: (.tool_response.success // true)
  }' >> "$LOG_DIR/$(date -u +%Y-%m-%d).jsonl" 2>/dev/null || true
exit 0
