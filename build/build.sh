#!/usr/bin/env bash
# Regenerate every non-canonical target from the Claude Code plugin trees.
#
# Canonical source:  plugins/fintech-{frontend,backend}/  +  shared/guards/
# Generated targets: targets/codex/  targets/cursor/  targets/copilot/
#
# Edit the canonical source, then run this. Never hand-edit targets/ —
# it is overwritten.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v jq >/dev/null 2>&1 || { echo "build: jq required" >&2; exit 1; }

strip_fm_keys() { awk 'BEGIN{fm=0} /^---$/{fm++; print; next} fm==1 && /^(model|tools):/{next} {print}' "$1"; }

echo "==> codex"
for p in fintech-frontend fintech-backend; do
  rm -rf "targets/codex/plugins/$p/skills"
  mkdir -p "targets/codex/plugins/$p/skills" "targets/codex/plugins/$p/scripts"
  for s in plugins/$p/skills/*/; do
    n=$(basename "$s"); mkdir -p "targets/codex/plugins/$p/skills/$n"
    cp "$s/SKILL.md" "targets/codex/plugins/$p/skills/$n/"
  done
  for a in plugins/$p/agents/*.md; do
    n=$(basename "$a" .md); mkdir -p "targets/codex/plugins/$p/skills/$n"
    strip_fm_keys "$a" > "targets/codex/plugins/$p/skills/$n/SKILL.md"
  done
  cp shared/guards/guard-core.sh "targets/codex/plugins/$p/scripts/"
  cp "plugins/$p/.mcp.json" "targets/codex/plugins/$p/.mcp.json"
  chmod +x "targets/codex/plugins/$p/scripts/"*.sh
done
cp plugins/fintech-frontend/scripts/frontend-context.sh targets/codex/plugins/fintech-frontend/scripts/
cp plugins/fintech-backend/scripts/backend-context.sh   targets/codex/plugins/fintech-backend/scripts/
cp plugins/fintech-backend/scripts/audit-log.sh         targets/codex/plugins/fintech-backend/scripts/
chmod +x targets/codex/plugins/*/scripts/*.sh

echo "==> cursor"
cp shared/guards/guard-core.sh targets/cursor/.cursor/hooks/
chmod +x targets/cursor/.cursor/hooks/*.sh

echo "==> copilot"
mkdir -p targets/copilot/.github/agents targets/copilot/scripts
rm -f targets/copilot/.github/agents/*.agent.md
for p in fintech-frontend fintech-backend; do
  for a in plugins/$p/agents/*.md; do
    out="targets/copilot/.github/agents/$(basename "$a" .md).agent.md"
    name=$(grep -m1 '^name:' "$a" | sed 's/^name:[[:space:]]*//')
    desc=$(grep -m1 '^description:' "$a" | sed 's/^description:[[:space:]]*//')
    case "$name" in
      *auditor|*code-reviewer|microservice-architect) TOOLS="read search" ;;
      *) TOOLS="read edit search shell" ;;
    esac
    { echo "---"; echo "name: $name"; echo "description: $desc"; echo "tools:";
      for t in $TOOLS; do echo "  - $t"; done; echo "---"; echo;
      awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2{print}' "$a"; } > "$out"
  done
done
cp shared/guards/guard-core.sh targets/copilot/scripts/
cp shared/guards/guard-core.sh targets/copilot/.github/hooks/scripts/
chmod +x targets/copilot/scripts/guard-core.sh targets/copilot/scripts/pre-commit
chmod +x targets/copilot/.github/hooks/scripts/*.sh targets/copilot/.github/hooks/scripts/*.ps1

echo "==> AGENTS.md fan-out"
for t in codex cursor copilot; do cp targets/copilot/AGENTS.md "targets/$t/AGENTS.md" 2>/dev/null || true; done

echo "==> validate"
fail=0
for f in .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json plugins/*/hooks/hooks.json \
         targets/codex/marketplace.json targets/codex/plugins/*/plugin.json targets/codex/plugins/*/hooks/hooks.json \
         targets/cursor/.cursor/hooks.json targets/copilot/.github/hooks/*.json; do
  jq empty "$f" 2>/dev/null || { echo "  INVALID JSON: $f"; fail=1; }
done
for s in $(find . -name '*.sh' -not -path './.git/*'); do bash -n "$s" || { echo "  SYNTAX: $s"; fail=1; }; done
[ $fail -eq 0 ] && echo "build: OK" || { echo "build: FAILED"; exit 1; }
