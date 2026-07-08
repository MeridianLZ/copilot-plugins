#!/usr/bin/env bash
# PostToolUse[Write|Edit] — format touched C# files
set -euo pipefail
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | jq -r '(.tool_input.file_path // .tool_input.path // empty)')"
{ [ -z "$FILE" ] || [ ! -f "$FILE" ]; } && exit 0
case "$FILE" in
  *.cs) command -v dotnet >/dev/null 2>&1 && dotnet format whitespace --include "$FILE" --no-restore >/dev/null 2>&1 || true ;;
esac
exit 0
