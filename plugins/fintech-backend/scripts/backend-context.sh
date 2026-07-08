#!/usr/bin/env bash
# SessionStart — inject compliance and repo context
set -euo pipefail
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'not-a-repo')"
DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
echo "[fintech-backend] Regimes active: PCI-DSS v4.0, SOX ITGC, SOC 2 Type II, GLBA/FFIEC."
echo "Branch: $BRANCH | uncommitted: $DIRTY"
echo "Enforced: no PAN/SSN/secret literals; no float money; ledger append-only; cluster and DB mutations are CI-only; every mutating handler idempotent and traced."
if ls contracts/migrations/*.sql >/dev/null 2>&1; then
  echo "Migration artifacts present in contracts/migrations — pending migrations need paired rollback scripts before merge."
fi
if grep -rlEi 'address_?line|AddressLine' --include='*.cs' src 2>/dev/null | head -1 >/dev/null 2>&1; then
  echo "NOTE: unstructured address fields detected. ISO 20022 structured-address rules (Swift Nov 2026) may apply — run /iso20022-check."
fi
[ -f CLAUDE_NOTES.md ] && echo "CLAUDE_NOTES.md present — read it before starting work."
exit 0
