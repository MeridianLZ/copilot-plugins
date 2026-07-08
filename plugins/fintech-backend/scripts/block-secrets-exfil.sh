#!/usr/bin/env bash
# PreToolUse[Bash] — block reads of secret material and outbound data pushes (PCI 3.x, GLBA, SOC 2 CC6.7)
set -euo pipefail
INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -z "$CMD" ] && exit 0
deny() { jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

echo "$CMD" | grep -Eq 'kubectl[[:space:]]+get[[:space:]]+secrets?([[:space:]]|$).*(-o|--output)' \
  && deny "Reading Kubernetes secret payloads is blocked. Reference secrets by name; values stay in the cluster."
echo "$CMD" | grep -Eq '(cat|less|more|head|tail|grep|bat|strings)[[:space:]]+[^|;]*\.(env|pfx|pem|key|p12|jks)([[:space:]]|$)' \
  && deny "Reading credential or key files is blocked in this profile."
echo "$CMD" | grep -Eq '(cat|less|grep|bat)[[:space:]]+[^|;]*appsettings\.(Production|Staging)\.json' \
  && deny "Production/staging appsettings are blocked. Use Development settings with K8s Secret references."
echo "$CMD" | grep -Eq '(^|[;&|][[:space:]]*)(printenv|env)([[:space:]]|$)|echo[[:space:]]+\$\{?(OKTA|AUTH0|SB_|CONNECTION|[A-Z_]*SECRET|[A-Z_]*TOKEN|[A-Z_]*KEY)' \
  && deny "Environment dumps that may expose credentials are blocked."
echo "$CMD" | grep -Eq '(curl|wget)[[:space:]].*(-d[[:space:]]|--data|--upload-file|-T[[:space:]])' \
  && deny "Outbound data upload from the shell is blocked (data-exfiltration guard, SOC 2 CC6.7)."
exit 0
