#!/usr/bin/env bash
# Scaffold docs/architecture/ skeleton from skill templates.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="$SCRIPT_DIR/../assets/templates"

Usage() {
  cat <<EOF
Usage: scaffold-arch-docs.sh [-r|--repo-root PATH] [-f|--force] [-h|--help]

Creates docs/architecture/{README.md,system-overview.mmd,components/} under
the repo root, seeded from the skill's assets/templates. Existing files are
left untouched unless --force.

  -r, --repo-root PATH  Repo root (default: .)
  -f, --force           Overwrite existing scaffold files
  -h, --help            Show this help
EOF
}

ROOT="."
FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -r|--repo-root) ROOT="$2"; shift 2 ;;
    -f|--force) FORCE=1; shift ;;
    -h|--help) Usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; Usage; exit 1 ;;
  esac
done

DEST="$ROOT/docs/architecture"
mkdir -p "$DEST/components"

place() { # src dest
  if [[ -e "$2" && $FORCE -eq 0 ]]; then
    echo "keep    $2"
  else
    cp "$1" "$2"
    echo "created $2"
  fi
}

place "$TEMPLATES/architecture-readme.md.tmpl" "$DEST/README.md"
place "$TEMPLATES/system-overview.mmd.tmpl" "$DEST/system-overview.mmd"
echo "scaffold done: $DEST"
