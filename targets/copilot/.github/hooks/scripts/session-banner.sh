#!/usr/bin/env bash
# sessionStart — output is informational only; Copilot ignores the return value.
set -euo pipefail
echo "[fintech] PCI-DSS v4.0 · SOX ITGC · SOC 2 Type II · GLBA/FFIEC enforced by preToolUse hook."
echo "[fintech] Blocked: PAN/SSN literals, float money, ledger UPDATE/DELETE, kubectl+helm mutations, Database.Migrate(), secret literals, browser token storage."
if command -v jq >/dev/null 2>&1; then :; else
  echo "[fintech] WARNING: jq not found — preToolUse guard will fail closed and deny every tool call until jq is installed."
fi
exit 0
