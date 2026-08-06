#!/usr/bin/env bash
set -euo pipefail

TARGET_ROOT="${1:-$PWD}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"
corepack enable
pnpm install --no-frozen-lockfile
pnpm build
pnpm hooks:generate -- --target "${TARGET_ROOT}"
printf 'Review: %s/.github/hooks/copilot-otel-bridge.generated.preview\n' "${TARGET_ROOT}"
pnpm hooks:apply -- --target "${TARGET_ROOT}"
printf 'Installed GitHub Copilot CLI telemetry hooks into %s/.github/hooks/copilot-otel-bridge.json\n' "${TARGET_ROOT}"
printf 'Run the stack: docker compose up --build\n'
printf 'Then source scripts/copilot-otel-env.sh before starting copilot.\n'
