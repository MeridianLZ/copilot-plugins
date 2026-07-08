#!/usr/bin/env bash
# PreToolUse[Write|Edit] — block sensitive data, banned APIs, and dead DnD libraries in frontend source
set -euo pipefail
INPUT="$(cat)"
CONTENT="$(printf '%s' "$INPUT" | jq -r '(.tool_input.content // .tool_input.new_string // .tool_input.new_str // empty)')"
FILE="$(printf '%s' "$INPUT" | jq -r '(.tool_input.file_path // .tool_input.path // "unknown")')"
[ -z "$CONTENT" ] && exit 0

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# Luhn-valid PAN check (PCI-DSS 3.4) — tokenized fixtures like tok_* and 4111-TEST-MASK pass
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

# Browser storage of anything auth/sensitive
printf '%s' "$CONTENT" | grep -Eqi '(localStorage|sessionStorage)\.(set|get)Item\([^)]*(token|jwt|auth|session|pan|card|account)' \
  && deny "Auth/sensitive value in browser storage in $FILE. The BFF owns the session cookie — the SPA never stores tokens (see bff-client-auth skill)."

# Banned APIs
printf '%s' "$CONTENT" | grep -q 'dangerouslySetInnerHTML' \
  && deny "dangerouslySetInnerHTML is banned in this codebase ($FILE). Sanitize server-side and render as text."

# Dead drag-and-drop libraries
printf '%s' "$CONTENT" | grep -Eq "from ['\"]react-beautiful-dnd['\"]" \
  && deny "react-beautiful-dnd is unmaintained with no React 19 support ($FILE). Use @dnd-kit/react next-gen — see the dnd-architecture skill, or run /migrate-dnd."

# Inline secrets / client-exposed env secrets
printf '%s' "$CONTENT" | grep -Eqi '(VITE_[A-Z_]*(SECRET|PRIVATE|PASSWORD)|client_secret)[[:space:]]*[:=]' \
  && deny "Secret exposed to the client bundle in $FILE. Anything VITE_* ships to the browser — move it behind the BFF."

exit 0
