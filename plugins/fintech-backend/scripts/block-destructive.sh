#!/usr/bin/env bash
# PreToolUse[Bash] — deny destructive / production-touching commands (SOX ITGC, SOC 2 CC8)
set -euo pipefail
INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -z "$CMD" ] && exit 0
deny() { jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

echo "$CMD" | grep -Eq '(^|[;&|[:space:]])rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)' \
  && deny "Recursive force delete blocked. Remove files individually with explicit paths."
echo "$CMD" | grep -Eq 'git[[:space:]]+push[[:space:]].*(--force([^-]|$)|[[:space:]]-f([[:space:]]|$))' \
  && deny "Force push blocked — git history is SOX audit evidence. A human can use --force-with-lease if genuinely required."
echo "$CMD" | grep -Eq 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-zA-Z]*f)' \
  && deny "Hard reset / force clean blocked. Stash instead, or ask the operator."
echo "$CMD" | grep -Eq 'kubectl[[:space:]]+(delete|apply|edit|patch|drain|cordon|scale|exec|cp|rollout[[:space:]]+restart)' \
  && deny "Direct cluster mutation blocked. Deploys go through CI with a change-control ticket (see sox-change-control). Validate locally with 'helm template | kubeconform' instead."
echo "$CMD" | grep -Eq 'helm[[:space:]]+(install|upgrade|uninstall|rollback)' \
  && deny "Helm release mutation blocked outside CI. Use 'helm template' / 'helm lint' locally."
echo "$CMD" | grep -Eq 'dotnet[[:space:]]+ef[[:space:]]+database[[:space:]]+update' \
  && deny "Direct migration apply blocked (SOX). Generate the artifact: dotnet ef migrations script --idempotent"
echo "$CMD" | grep -Eqi '(DROP[[:space:]]+(TABLE|DATABASE|SCHEMA)|TRUNCATE[[:space:]]+TABLE)' \
  && deny "Destructive SQL blocked. Schema changes ship as reviewed migration scripts with rollbacks."
echo "$CMD" | grep -Eqi 'UPDATE[[:space:]]+[a-z_.]*ledger|DELETE[[:space:]]+FROM[[:space:]]+[a-z_.]*ledger' \
  && deny "The ledger is append-only. Corrections are new reversal entries, never mutations (see ledger-modeling)."
exit 0
