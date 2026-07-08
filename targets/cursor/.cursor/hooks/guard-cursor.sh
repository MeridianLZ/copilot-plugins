#!/usr/bin/env bash
# Cursor hook adapter -> shared guard core.
# Cursor expects {"permission":"allow"|"deny"|"ask", "userMessage":..., "agentMessage":...}
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="$(cat)"
if ! command -v jq >/dev/null 2>&1; then
  echo '{"permission":"ask","userMessage":"jq missing — compliance guard could not run","agentMessage":"Compliance guard unavailable; verify manually."}'
  exit 0
fi
# Normalize Cursor payload into the core's expected shape
NORM="$(printf '%s' "$INPUT" | jq -c '{tool_input:{command:(.command // empty), file_path:(.file_path // .path // empty), content:(.content // empty)}}')"
OUT="$(printf '%s' "$NORM" | "$HERE/guard-core.sh" --dialect plain 2>&1 || true)"
if printf '%s' "$OUT" | grep -q '^BLOCKED: '; then
  REASON="$(printf '%s' "$OUT" | sed 's/^BLOCKED: //')"
  jq -n --arg r "$REASON" '{permission:"deny",userMessage:("Blocked by fintech compliance guard: "+$r),agentMessage:("This action was blocked by the fintech compliance guard. Reason: "+$r+" Do not retry; choose a compliant approach.")}'
  exit 0
fi
echo '{"permission":"allow"}'
