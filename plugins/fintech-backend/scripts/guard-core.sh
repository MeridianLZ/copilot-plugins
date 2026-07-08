#!/usr/bin/env bash
# Portable compliance guard core, shared by every agent ecosystem.
#
# Reads a tool-call payload as JSON on stdin, or --file/--content for
# pre-commit and CI use. Emits a verdict in the caller's dialect.
#
#   --dialect claude   Claude Code PreToolUse hookSpecificOutput  (exit 0)
#   --dialect codex    Codex PreToolUse permissionDecision+block  (exit 2 on deny)
#   --dialect plain    Human-readable text                        (exit 1 on deny)
#
# Exit codes for plain/codex are what pre-commit and CI act on.
set -euo pipefail

DIALECT="claude"; MODE="stdin"; ARG_FILE=""; ARG_CONTENT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dialect) DIALECT="$2"; shift 2 ;;
    --file)    MODE="file"; ARG_FILE="$2"; shift 2 ;;
    --content) MODE="literal"; ARG_CONTENT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

FILE="unknown"; CONTENT=""; CMD=""
case "$MODE" in
  stdin)
    INPUT="$(cat)"
    if command -v jq >/dev/null 2>&1; then
      CONTENT="$(printf '%s' "$INPUT" | jq -r '(.tool_input.content // .tool_input.new_string // .tool_input.new_str // empty)' 2>/dev/null || true)"
      FILE="$(printf '%s' "$INPUT" | jq -r '(.tool_input.file_path // .tool_input.path // "unknown")' 2>/dev/null || echo unknown)"
      CMD="$(printf '%s' "$INPUT" | jq -r '(.tool_input.command // empty)' 2>/dev/null || true)"
    else
      echo "guard-core: jq not found on PATH — enforcement cannot run" >&2
      exit 3   # fail CLOSED: never silently pass
    fi
    ;;
  file)    FILE="$ARG_FILE"; CONTENT="$(cat "$ARG_FILE" 2>/dev/null || true)" ;;
  literal) CONTENT="$ARG_CONTENT" ;;
esac

REASON=""
deny() { REASON="$1"; emit_deny; }

emit_deny() {
  case "$DIALECT" in
    claude)
      if command -v jq >/dev/null 2>&1; then
        jq -n --arg r "$REASON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
      fi
      exit 0 ;;
    codex)
      if command -v jq >/dev/null 2>&1; then
        jq -n --arg r "$REASON" '{permissionDecision:"deny",block:true,hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecisionReason:$r}}'
      fi
      exit 2 ;;
    *)
      echo "BLOCKED: $REASON" >&2
      exit 1 ;;
  esac
}

# ---------- content checks ----------
if [ -n "$CONTENT" ]; then
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
  printf '%s' "$CONTENT" | grep -Eq '\b(double|float)[[:space:]]+[A-Za-z_]*(Amount|Balance|Price|Total|Fee|Interest|Debit|Credit)\b' \
    && deny "Floating-point money type in $FILE. Money is decimal with an explicit ISO 4217 currency."
  printf '%s' "$CONTENT" | grep -Eq '\.Database\.Migrate\(\)' \
    && deny "Database.Migrate() in application startup (SOX). Ship idempotent migration SQL through change control."
  printf '%s' "$CONTENT" | grep -Eq 'Endpoint=sb://[^;]+;SharedAccessKeyName=' \
    && deny "Service Bus connection string with key in $FILE. Inject via External Secrets."
  printf '%s' "$CONTENT" | grep -Eqi '(client_secret|clientsecret|api[_-]?key|password|sas[_-]?key|SharedAccessKey)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9+/_.-]{16,}' \
    && deny "Inline secret literal in $FILE. Reference a Kubernetes Secret / configuration provider."
  printf '%s' "$CONTENT" | grep -Eqi '(localStorage|sessionStorage)\.(set|get)Item\([^)]*(token|jwt|auth|session|pan|card|account)' \
    && deny "Auth/sensitive value in browser storage in $FILE. The BFF owns the session cookie."
  printf '%s' "$CONTENT" | grep -q 'dangerouslySetInnerHTML' \
    && deny "dangerouslySetInnerHTML is banned ($FILE). Sanitize server-side and render as text."
  printf '%s' "$CONTENT" | grep -Eq "from ['\"]react-beautiful-dnd['\"]" \
    && deny "react-beautiful-dnd is unmaintained with no React 19 support ($FILE). Use @dnd-kit/react next-gen."
  printf '%s' "$CONTENT" | grep -Eqi '(VITE_[A-Z_]*(SECRET|PRIVATE|PASSWORD)|client_secret)[[:space:]]*[:=]' \
    && deny "Secret exposed to the client bundle in $FILE. VITE_* ships to the browser."
fi

# ---------- command checks ----------
if [ -n "$CMD" ]; then
  echo "$CMD" | grep -Eq 'kubectl[[:space:]]+(delete|apply|edit|patch|drain|cordon|scale|exec|cp|rollout[[:space:]]+restart)' \
    && deny "Direct cluster mutation blocked. Deploys go through CI with a change-control ticket."
  echo "$CMD" | grep -Eq 'helm[[:space:]]+(install|upgrade|uninstall|rollback)' \
    && deny "Helm release mutation blocked outside CI. Use 'helm template' / 'helm lint'."
  echo "$CMD" | grep -Eq 'dotnet[[:space:]]+ef[[:space:]]+database[[:space:]]+update' \
    && deny "Direct migration apply blocked (SOX). Use: dotnet ef migrations script --idempotent"
  echo "$CMD" | grep -Eqi '(DROP[[:space:]]+(TABLE|DATABASE|SCHEMA)|TRUNCATE[[:space:]]+TABLE)' \
    && deny "Destructive SQL blocked. Schema changes ship as reviewed migration scripts."
  echo "$CMD" | grep -Eqi 'UPDATE[[:space:]]+[a-z_.]*ledger|DELETE[[:space:]]+FROM[[:space:]]+[a-z_.]*ledger' \
    && deny "The ledger is append-only. Corrections are new reversal entries."
  echo "$CMD" | grep -Eq '(^|[;&|[:space:]])rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)' \
    && deny "Recursive force delete blocked."
  echo "$CMD" | grep -Eq 'git[[:space:]]+push[[:space:]].*(--force([^-]|$)|[[:space:]]-f([[:space:]]|$))' \
    && deny "Force push blocked — git history is SOX audit evidence."
  echo "$CMD" | grep -Eq '(cat|less|more|head|tail|grep|bat|strings)[[:space:]]+[^|;]*\.(env|pfx|pem|key|p12|jks)([[:space:]]|$)' \
    && deny "Reading credential or key files is blocked."
  echo "$CMD" | grep -Eq 'kubectl[[:space:]]+get[[:space:]]+secrets?([[:space:]]|$).*(-o|--output)' \
    && deny "Reading Kubernetes secret payloads is blocked."
  echo "$CMD" | grep -Eq '(curl|wget)[[:space:]].*(-d[[:space:]]|--data|--upload-file|-T[[:space:]])' \
    && deny "Outbound data upload from the shell is blocked (exfiltration guard)."
fi

exit 0
