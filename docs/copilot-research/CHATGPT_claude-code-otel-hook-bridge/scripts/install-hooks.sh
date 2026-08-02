#!/usr/bin/env bash
set -euo pipefail

TARGET_ROOT="${1:-$PWD}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"
corepack enable
pnpm install --no-frozen-lockfile
pnpm build
pnpm hooks:apply -- --target "${TARGET_ROOT}"

printf 'Installed Claude Code telemetry hooks into %s/.claude/settings.local.json\n' "${TARGET_ROOT}"
printf 'Run: docker compose up --build\n'
