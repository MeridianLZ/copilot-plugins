#!/usr/bin/env bash
# PostToolUse[Write|Edit] — format the touched file with the repo's prettier
set -euo pipefail
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | jq -r '(.tool_input.file_path // .tool_input.path // empty)')"
{ [ -z "$FILE" ] || [ ! -f "$FILE" ]; } && exit 0
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md)
    command -v pnpm >/dev/null 2>&1 && pnpm exec prettier --write "$FILE" >/dev/null 2>&1 || true
    ;;
esac
exit 0
