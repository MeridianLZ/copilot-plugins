# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin marketplace containing two enterprise fintech/banking plugins (`fintech-frontend`, `fintech-backend`), plus generated ports of the same content to three other coding agents (Codex, Cursor, Copilot CLI). There is no application code — the deliverables are plugin manifests (JSON), agents/skills/commands (Markdown), and enforcement hook scripts (bash).

## Canonical vs. generated — the most important rule

- **Canonical (edit here):** `plugins/fintech-{frontend,backend}/` and `shared/guards/`
- **Generated (never hand-edit):** everything under `targets/` (`codex/`, `cursor/`, `copilot/`) — overwritten by the build

After editing canonical sources, regenerate:

```bash
bash build/build.sh
```

This copies/transforms content into `targets/` (Claude agents → Codex skills with `model:`/`tools:` frontmatter stripped; Claude agents → Copilot `.agent.md` with tool tiers assigned by agent name; guard-core fanned out to every target), then validates **all** JSON with `jq empty` and **all** shell scripts with `bash -n`. It is the build, lint, and test gate in one; it requires `jq` on PATH and exits nonzero on any failure.

Validate a single file the same way the build does:

```bash
jq empty path/to/file.json
bash -n path/to/script.sh
```

## Testing the guard

`shared/guards/guard-core.sh` is the single portable enforcement implementation. It reads a tool-call JSON payload on stdin (or `--file`/`--content`) and emits a verdict in a per-ecosystem dialect: `--dialect claude` (JSON `permissionDecision:"deny"`, exit 0), `codex` (exit 2 on deny), `plain` (human text, exit 1 on deny — used by pre-commit and CI). Exercise a rule directly:

```bash
echo '{"tool_input":{"command":"kubectl delete pod x"}}' | bash shared/guards/guard-core.sh --dialect plain
echo '{"tool_input":{"file_path":"a.cs","content":"double Amount;"}}' | bash shared/guards/guard-core.sh --dialect plain
```

Expect `BLOCKED: <reason>` and exit 1. The guard **fails closed**: missing `jq` is exit 3, never a silent pass.

To test the plugins in Claude Code itself: `/plugin marketplace add <absolute-path-to-this-repo>` then `/plugin install fintech-backend@fintech-marketplace`. Changes to anything other than a `SKILL.md` require `/reload-plugins` or a restart — hooks, `.mcp.json`, `.lsp.json`, and agents are not hot-reloaded.

## Architecture

Each plugin under `plugins/` is a standard Claude Code plugin: `.claude-plugin/plugin.json`, `.mcp.json`, `.lsp.json`, `agents/*.md`, `skills/*/SKILL.md`, `commands/*.md`, `hooks/hooks.json`, `scripts/*.sh`, `output-styles/`. The two plugins share no files so they can be installed independently.

Hook wiring (`hooks/hooks.json`, scripts referenced via `${CLAUDE_PLUGIN_ROOT}`):

- **PreToolUse** — the enforcement layer. Backend: `block-destructive.sh` + `block-secrets-exfil.sh` on Bash commands; `guard-backend-write.sh` on Write/Edit/MultiEdit. Frontend: `guard-frontend-write.sh`. Guards deny by emitting `hookSpecificOutput.permissionDecision:"deny"` with exit 0 (Claude dialect).
- **PostToolUse** — `format-*.sh` after writes; backend also appends every tool invocation as JSONL to `$CLAUDE_FINTECH_AUDIT_DIR` (default `~/.claude-fintech-audit`) via `audit-log.sh` (SOC 2 evidence).
- **SessionStart** — `*-context.sh` injects domain context.

What the guards enforce (the domain rules that must never regress): Luhn-valid PANs, SSN patterns, inline secret literals, float/double money types, `Database.Migrate()` at startup, Service Bus connection strings with keys, ledger UPDATE/DELETE (append-only), direct `kubectl`/`helm` mutation, `dotnet ef database update`, force pushes, credential-file reads, and data exfiltration via curl/wget.

**Known duplication:** the per-plugin write guards (`plugins/*/scripts/guard-*-write.sh`) inline a subset of the same checks that `shared/guards/guard-core.sh` implements centrally. When changing a rule, update `shared/guards/guard-core.sh` (the one canonical implementation, per README) and check whether the per-plugin script carries a copy of that rule.

### Target fidelity (see README for the full matrix)

- **Codex** — near-lossless: same hook event names and JSON-on-stdin contract, different output dialect (exit 2 on deny).
- **Cursor** — lossy: content becomes `.cursor/rules/*.mdc`; hooks only intercept shell/MCP, **not** Cursor's own file edits, so write-time content checks are advisory there (pre-commit closes the gap).
- **Copilot CLI** — ships as repo-scope `.github/hooks/` (not a plugin) because plugin-defined `preToolUse` hooks don't fire (upstream bug github/copilot-cli#2540). Non-zero hook exits deny, so the guard's fail-closed exit 3 denies automatically. Only target with Windows parity (`guard-core.ps1` is a full reimplementation, Luhn included — keep it in sync with the bash guard).
- `targets/*/AGENTS.md` is fanned out from `targets/copilot/AGENTS.md` by the build.

## Gotchas

- Every hook script parses stdin with `jq`; the build also requires it. On Windows, run the build and guard tests from Git Bash.
- `bash -n` validation in the build covers every `.sh` in the repo, including `targets/` — a syntax error in generated output fails the build.
- Agent-to-Copilot conversion in `build/build.sh` assigns read-only tools to agents whose names match `*auditor|*code-reviewer|microservice-architect`; new reviewer/auditor agents should follow that naming to stay read-only.
