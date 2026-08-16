#!/usr/bin/env bash
# Validate mermaid sources (.mmd files + fenced ```mermaid blocks) under a dir.
# Uses mmdc if ALREADY installed on PATH; otherwise a structural lint (awk).
# Never installs anything (disk-constrained machines).
set -euo pipefail

Usage() {
  cat <<EOF
Usage: validate-mermaid.sh [-d|--dir PATH] [-s|--strict] [-h|--help]

Validates every .mmd file and every fenced mermaid block in .md files under
PATH (default: docs/architecture). Exit 0 = all pass, 1 = failures.

  -d, --dir PATH   Directory to scan (default: docs/architecture)
  -s, --strict     Require mmdc; fail if not on PATH (default: lint fallback)
  -h, --help       Show this help
EOF
}

DIR="docs/architecture"
STRICT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dir) DIR="$2"; shift 2 ;;
    -s|--strict) STRICT=1; shift ;;
    -h|--help) Usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; Usage; exit 1 ;;
  esac
done

[[ -d "$DIR" ]] || { echo "No such dir: $DIR" >&2; exit 1; }

FAIL=0
TMPDIR_V="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_V"' EXIT

# Collect sources: each .mmd as-is; extract fenced blocks from .md
i=0
while IFS= read -r -d '' f; do
  cp "$f" "$TMPDIR_V/src_$((i++))__$(basename "$f")"
done < <(find "$DIR" -name '*.mmd' -print0)

while IFS= read -r -d '' f; do
  awk -v out="$TMPDIR_V/md_$(basename "$f")" '
    /^```mermaid/ {inblk=1; n++; file=out "." n ".mmd"; next}
    /^```/ && inblk {inblk=0; next}
    inblk {print > file}
  ' "$f"
done < <(find "$DIR" -name '*.md' -print0)

shopt -s nullglob
SOURCES=("$TMPDIR_V"/*.mmd)
[[ ${#SOURCES[@]} -eq 0 ]] && { echo "No mermaid sources found under $DIR"; exit 0; }

have_mmdc=0
command -v mmdc >/dev/null 2>&1 && have_mmdc=1
if [[ $STRICT -eq 1 && $have_mmdc -eq 0 ]]; then
  echo "STRICT: mmdc not on PATH" >&2; exit 1
fi

lint() { # structural fallback: first-line diagram type, balanced subgraph/end
  local src="$1"
  head -1 "$src" | grep -qE '^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|C4Context|architecture-beta|%%)' \
    || { echo "  first line lacks diagram type"; return 1; }
  local sg ends
  sg=$(grep -cE '^\s*subgraph\b' "$src" || true)
  ends=$(grep -cE '^\s*end\s*$' "$src" || true)
  [[ "$sg" -le "$ends" ]] || { echo "  unbalanced subgraph/end ($sg/$ends)"; return 1; }
  return 0
}

for src in "${SOURCES[@]}"; do
  [[ -s "$src" ]] || continue
  name="${src##*/}"
  if [[ $have_mmdc -eq 1 ]]; then
    if mmdc -i "$src" -o "$TMPDIR_V/out.svg" >/dev/null 2>&1; then
      echo "PASS (mmdc) $name"
    else
      echo "FAIL (mmdc) $name"; FAIL=1
    fi
  else
    if lint "$src"; then echo "PASS (lint) $name"; else echo "FAIL (lint) $name"; FAIL=1; fi
  fi
done

[[ $have_mmdc -eq 0 ]] && echo "note: mmdc absent — structural lint only; render-check via a mermaid MCP validator recommended"
exit $FAIL
