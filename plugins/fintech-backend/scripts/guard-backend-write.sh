#!/usr/bin/env bash
# PreToolUse[Write|Edit] — reject PANs, SSNs, inline secrets, float money, and ledger mutation in written content
set -euo pipefail
INPUT="$(cat)"
CONTENT="$(printf '%s' "$INPUT" | jq -r '(.tool_input.content // .tool_input.new_string // .tool_input.new_str // empty)')"
FILE="$(printf '%s' "$INPUT" | jq -r '(.tool_input.file_path // .tool_input.path // "unknown")')"
[ -z "$CONTENT" ] && exit 0
deny() { jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

# Luhn-valid PAN (PCI-DSS 3.4)
HITS="$(printf '%s' "$CONTENT" | grep -Eo '(^|[^0-9])([3-6][0-9]{3}([ -]?[0-9]{4}){3,4})([^0-9]|$)' | tr -dc '0-9\n' || true)"
if [ -n "$HITS" ]; then
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    len=${#d}; [ "$len" -lt 13 ] && continue
    sum=0; alt=0
    for (( i=len-1; i>=0; i-- )); do
      n=${d:$i:1}
      if [ $alt -eq 1 ]; then n=$((n*2)); [ $n -gt 9 ] && n=$((n-9)); fi
      sum=$((sum+n)); alt=$((1-alt))
    done
    [ $((sum % 10)) -eq 0 ] && deny "Luhn-valid PAN in $FILE — PCI-DSS 3.4. Use tokenized fixtures (tok_test_visa, 4111-TEST-MASK)."
  done <<< "$HITS"
fi

printf '%s' "$CONTENT" | grep -Eq '(^|[^0-9])[0-9]{3}-[0-9]{2}-[0-9]{4}([^0-9]|$)' \
  && deny "SSN-formatted value in $FILE. Use masked fixtures (***-**-6789)."

printf '%s' "$CONTENT" | grep -Eqi '(client_secret|clientsecret|api[_-]?key|password|sas[_-]?key|SharedAccessKey)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9+/_.-]{16,}' \
  && deny "Inline secret literal in $FILE. Reference a Kubernetes Secret / configuration provider instead."

printf '%s' "$CONTENT" | grep -Eq 'Endpoint=sb://[^;]+;SharedAccessKeyName=' \
  && deny "Service Bus connection string with key in $FILE. Inject via External Secrets."

# Float money — the highest-cost silent defect in this domain
printf '%s' "$CONTENT" | grep -Eq '\b(double|float)[[:space:]]+[A-Za-z_]*(Amount|Balance|Price|Total|Fee|Interest|Debit|Credit)\b' \
  && deny "Floating-point money type in $FILE. Money is decimal with an explicit ISO 4217 currency (see backend-conventions)."

# Production migration apply in code
printf '%s' "$CONTENT" | grep -Eq '\.Database\.Migrate\(\)' \
  && deny "Database.Migrate() in application startup is blocked (SOX). Ship idempotent migration SQL through change control — see efcore-migration-safety."

exit 0
