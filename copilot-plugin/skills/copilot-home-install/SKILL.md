---
name: copilot-home-install
description: Install/project copilot-home surfaces beyond what the plugin manifest loads natively - project repo-scope .github payload (hooks, mcp.json, instructions) into a target repo, and merge user-scope templates (settings.json, mcp-config.json, permissions-config.json, copilot-instructions.md) into ~/.copilot with diff preview. Use after installing the plugin, or when the user says "install copilot-home", "project the plugin config", "set up my ~/.copilot". Do NOT run without showing diffs first — user-scope files are personal config.
license: MIT
allowed-tools:
  - read
  - edit
  - execute
argument-hint: "repo|user|all [--target <repo-path>] [--dry-run]"
user-invocable: true
disable-model-invocation: true
---

# Copilot-Home Install (Projection Lane)

The plugin manifest already injects agents/skills/commands/hooks/MCP at plugin scope. This skill handles what the manifest CANNOT express — see `docs/injection-and-projection.md`.

## repo projection (`repo` or `all`)
Into `<target>/.github/`:
1. `hooks/copilot-home.json` + `hooks/scripts/*` — copied from the plugin's `.github/hooks/` payload. This is the **reliable enforcement lane** (plugin-scope preToolUse depends on the undocumented `${PLUGIN_ROOT}` workaround for #2540; repo scope is also the only lane the cloud agent loads).
2. `mcp.json` — workspace MCP config (copilot-mcp entry).
3. `copilot-instructions.md` + `instructions/*.instructions.md` — always-on repo instructions.
4. Agents/skills stay plugin-scope by default (no duplication); pass an explicit request to vendor them into `.github/agents|skills/`.

## user projection (`user` or `all`)
From `templates/user-scope/` into `~/.copilot` (respect `COPILOT_HOME`):
- `mcp-config.json` — **merge** `mcpServers` keys via jq, never overwrite the file.
- `settings.json` — merge only keys the user confirms.
- `permissions-config.json` — show proposed tool_approvals; apply only on confirmation.
- `copilot-instructions.md` — append-or-create with a marked block.
- `config.json` — NEVER touched (machine-managed).

## Rules
- Always diff-preview (`--dry-run` output) before writing; user-scope writes require explicit confirmation in-session.
- Verify after install: hooks live via attempted-block test; MCP via a `ping` through copilot-mcp; restart note (hooks/MCP load at CLI startup).
