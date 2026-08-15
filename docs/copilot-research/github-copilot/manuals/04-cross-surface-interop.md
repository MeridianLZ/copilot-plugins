# Manual 4 — Cross-Surface Interop & the Profile Scheme

> Synthesized 2026-08-11 across all three streams. This is the design-decision record
> for this repo's Copilot profile scheme and dual-manifest plugin work.

## 1. What's shared across CLI / VS Code / cloud agent

| Convention | CLI | VS Code | Cloud agent |
|---|---|---|---|
| `.github/copilot-instructions.md` | ✅ | ✅ | ✅ |
| `.github/instructions/*.instructions.md` (`applyTo`) | ✅ | ✅ | ✅ |
| `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` | ✅ (native, merged) | ✅ | ✅ |
| `.github/agents/*.agent.md` | ✅ | ✅ (1.106+) | ✅ (+ org/enterprise tiers) |
| Personal agents dir | ✅ `$COPILOT_HOME/agents/` | profile-stored, not switch-aware | ❌ (no persistent home) |
| `SKILL.md` skills (open Agent Skills spec) | ✅ (`$COPILOT_HOME/skills/` + project) | ✅ (multi-vendor paths incl. `.claude/skills/`) | via head-branch repo skills |
| MCP config | `mcp-config.json` / `.mcp.json` / `.github/mcp.json` (`mcpServers`) | `.vscode/mcp.json` (**`servers`** key — different!) | Settings-UI JSON (`mcpServers`, `tools` required) |
| Hooks | ✅ 14 events, 3 handler types | ❌ (no hook system) | repo `.github/hooks/` only, bash/command only |
| Plugin manifest | ✅ Open Plugin Spec + vendor paths | ❌ (decomposed files) | ❌ |
| Managed/enterprise settings | ✅ shared MDM schema | ✅ same schema | policy toggles in Settings UI |

Notable convergences: Copilot reads Claude's instruction files, agents dirs, skills dirs,
and even `.claude/settings.json` keys natively; the `agentStop` 8-block cap copies Claude
Code's `Stop`-hook cap; Open Plugin Spec (`.plugin/plugin.json`, adopted CLI 1.0.74)
keeps `.claude-plugin/plugin.json` as a sanctioned vendor-prefixed override.

## 2. Profile isolation per surface — the design answer

| Surface | Mechanism | Completeness |
|---|---|---|
| Copilot CLI | `COPILOT_HOME` (+ `COPILOT_CACHE_HOME`) | Full — direct `CLAUDE_CONFIG_DIR` analog |
| VS Code | `--user-data-dir` (+ `--extensions-dir`) | Nearly full; native Profiles leak chat history + AI-config files |
| Cloud agent | none (ephemeral container) | Specialize via repo/org agent profiles instead |

**Decision (implemented 2026-08-10):** profile scheme targets the CLI only, mirroring
`claude-profiles`:

- SSOT: `settings/global/copilot-profiles/{dotnet,fe}/` — `copilot-instructions.md`,
  `settings.json` (JSONC), `agents/<name>.agent.md`, optional `mcp-config.json` override.
- Launcher: `profiles/copilot/bin/copilot-profile -p <name>` — exports
  `COPILOT_HOME=~/.copilot-<name>`, `COPILOT_CACHE_HOME=<home>/cache`; symlinks SSOT
  files (Copilot follows symlinks on settings writes, so `/settings` edits land in the
  SSOT), shared MCP from `settings/global/copilot-mcp-config.json`, hooks from
  `platform/copilot/hooks/`.
- VS Code specialty isolation deliberately not built: `--user-data-dir` friction
  (per-dir extension reinstall) outweighs benefit while the CLI covers the use case;
  revisit if `microsoft/vscode#290374` (profile-scoped AI config) ships.

## 3. Plugin strategy — dual manifest

Manifest search order in Copilot CLI: `.plugin/plugin.json` → root `plugin.json` →
`.github/plugin/plugin.json` → `.claude-plugin/plugin.json`. Practical portability recipe
used by `braisenly-base` and `plugins/kitchen-sink-copilot-cli`:

- Ship `.github/plugin/plugin.json` (Copilot) beside `.claude-plugin/plugin.json`
  (Claude Code); `.plugin/plugin.json` is the emerging vendor-neutral canonical — adopt
  it when Claude Code/Codex conformance is confirmed (open question, stream-1 §Open Q4).
- Shared component dirs (`agents/`, `skills/`, `commands/`, `hooks/`, `.mcp.json`) work
  for both hosts; hook configs need per-host event-name casing (camelCase = Copilot
  native, PascalCase = Claude-compat with snake_case fields).
- Marketplace: `.github/plugin/marketplace.json` in a git repo is all Copilot needs.

## 4. Standing cautions

- Release cadence is 2–4 days (CLI) / monthly (VS Code) — date-stamp every claim.
- Terminology churn: chat modes→custom agents (Oct 2025 / VS Code 1.106), coding
  agent→cloud agent (2026-04), `config.json`→`settings.json` (2026 mid). Old content
  mis-describes the current world.
- Security posture differs by surface: CLI has fail-open/fail-closed hook asymmetry;
  cloud agent has an actively-researched prompt-injection surface and no-approval MCP
  tool execution. Allowlist tightly; review agent PRs like untrusted contributions.
