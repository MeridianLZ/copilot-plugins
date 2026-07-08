#!/usr/bin/env bash
# SessionStart — surface the versions that actually determine which APIs are correct
set -euo pipefail
line() { printf '%s\n' "$1"; }
line "[fintech-frontend] React 19 · TS strict · pnpm · RTK Query · dnd-kit next-gen. WCAG 2.1 AA is a release gate."
if [ -f package.json ] && command -v jq >/dev/null 2>&1; then
  REACT="$(jq -r '(.dependencies.react // .devDependencies.react // "n/a")' package.json 2>/dev/null || echo n/a)"
  DND="$(jq -r '(.dependencies["@dnd-kit/react"] // .dependencies["@dnd-kit/core"] // .dependencies["react-beautiful-dnd"] // "none")' package.json 2>/dev/null || echo none)"
  line "Declared: react=$REACT  dnd=$DND"
  case "$DND" in
    none) : ;;
    *) line "Before writing DnD code, confirm the installed dnd-kit API surface (node_modules/@dnd-kit/react) — the next-gen v0.x API differs from the widely-documented v6 API." ;;
  esac
  jq -e '.dependencies["react-beautiful-dnd"] // .dependencies["@hello-pangea/dnd"]' package.json >/dev/null 2>&1 \
    && line "WARNING: an unmaintained drag-and-drop library is installed. Run /migrate-dnd to plan replacement."
fi
[ -f CLAUDE_NOTES.md ] && line "CLAUDE_NOTES.md present — read it before starting work."
exit 0
