#!/usr/bin/env bash
# Enforce atlas invariants:
#  1. every components/<name>.md has a components/<name>-dataflow.mmd twin
#  2. every dataflow diagram declares a payload classDef and has >=1 payload node
#  3. README.md links every component doc
set -euo pipefail

Usage() {
  cat <<EOF
Usage: checklist.sh [-d|--dir PATH] [-h|--help]

Checks structural invariants of a docs/architecture folder produced by the
codemunch-architecture-atlas skill. Exit 0 = pass, 1 = violations.

  -d, --dir PATH   Architecture docs dir (default: docs/architecture)
  -h, --help       Show this help
EOF
}

DIR="docs/architecture"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dir) DIR="$2"; shift 2 ;;
    -h|--help) Usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; Usage; exit 1 ;;
  esac
done

FAIL=0
COMP="$DIR/components"
[[ -d "$COMP" ]] || { echo "FAIL: $COMP missing"; exit 1; }
[[ -f "$DIR/README.md" ]] || { echo "FAIL: $DIR/README.md missing"; FAIL=1; }
[[ -f "$DIR/system-overview.mmd" ]] || { echo "FAIL: system-overview.mmd missing"; FAIL=1; }

found_any=0
for doc in "$COMP"/*.md; do
  [[ -e "$doc" ]] || continue
  found_any=1
  base="$(basename "$doc" .md)"
  flow="$COMP/$base-dataflow.mmd"
  if [[ ! -f "$flow" ]]; then
    echo "FAIL: $base.md has no dataflow twin ($base-dataflow.mmd)"; FAIL=1; continue
  fi
  grep -q 'classDef payload' "$flow" || { echo "FAIL: $flow lacks 'classDef payload'"; FAIL=1; }
  grep -qE 'class .*payload' "$flow" || { echo "FAIL: $flow has no node assigned payload class"; FAIL=1; }
  grep -qE '_out' "$flow" || { echo "FAIL: $flow has no *_out payload node"; FAIL=1; }
  if [[ -f "$DIR/README.md" ]] && ! grep -q "$base" "$DIR/README.md"; then
    echo "FAIL: README.md does not reference component '$base'"; FAIL=1
  fi
  echo "OK: $base (doc + dataflow + payload nodes)"
done

[[ $found_any -eq 1 ]] || { echo "FAIL: no component docs found in $COMP"; FAIL=1; }
exit $FAIL
