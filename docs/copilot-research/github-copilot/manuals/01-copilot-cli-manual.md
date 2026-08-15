# Manual 1 — GitHub Copilot CLI

> Synthesized 2026-08-11 from `../stream-1-copilot-cli/RAW-RESEARCH.md` (compiled 2026-07-25)
> + 2026-08-10 re-verification of the config-dir reference. Citations live in the raw stream.

## 1. Identity, install, auth

- npm package `@github/copilot`, binary `copilot`. Node 22+ for npm install; also
  `curl -fsSL https://gh.io/copilot-install | bash`, Homebrew (`copilot-cli`), WinGet,
  direct binaries. Release cadence: every 2–4 days; `/changelog` in-CLI mirrors
  `github/copilot-cli/changelog.md`.
- Auth: `copilot login` (OAuth device/browser flow; `--host` for GHE Cloud). Headless:
  env token precedence `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN`. Fine-grained
  PATs (with "Copilot Requests" permission) and OAuth tokens work; **classic `ghp_` PATs
  are rejected**. Token lands in the system credential store (plaintext-file fallback
  gated by `storeTokenPlaintext`, default off).

## 2. The config directory (`~/.copilot` / `$COPILOT_HOME`)

Everything lives in one directory. Key entries:

| Path | Purpose |
|---|---|
| `settings.json` | User settings — **JSONC**, editable, `/settings KEY VALUE` writes it. **Follows symlinks on write** (SSOT-friendly). |
| `config.json` | Auto-managed app state only (auth, installed-plugin metadata). Don't script against it for user settings — those migrated to `settings.json`. |
| `copilot-instructions.md` | Personal instructions, all sessions |
| `instructions/*.instructions.md` | Additional personal instructions |
| `agents/*.agent.md` | Personal custom agents |
| `skills/NAME/SKILL.md` | Personal skills |
| `hooks/*.json` | User-level hooks |
| `mcp-config.json` / `lsp-config.json` | User-level MCP / LSP servers |
| `extensions/NAME/` | Personal JS SDK extensions |
| `permissions-config.json` | Saved approvals, keyed per project path |
| `session-state/`, `session-store.db`, `logs/` | History/state (rebuild index via `/chronicle reindex`) |
| `installed-plugins/`, `plugin-data/` | Plugin install state |

**Settings precedence** (later wins): built-in defaults → MDM managed → user
`settings.json` → repo `.github/copilot/settings.json` → repo `.local.json` → env vars →
CLI flags. Repo level honors only a fixed key list (e.g. `model`, `effortLevel`,
`enabledPlugins`, `hooks`, `disabledSkills`); everything else silently ignored.
**Cross-tool shim:** the CLI also reads `.claude/settings.json`/`.local.json` for
`enabledPlugins`, `extraKnownMarketplaces`, `hooks`, `disableAllHooks`,
`companyAnnouncements`.

## 3. Profiles / isolation — `COPILOT_HOME`

Direct analog of Claude Code's `CLAUDE_CONFIG_DIR`:

- `export COPILOT_HOME=/path/to/profile` relocates the **entire** config dir (auth,
  settings, history, plugins, permissions, MCP/LSP, hooks, skills, agents, extensions).
- **Cache does NOT follow** — set `COPILOT_CACHE_HOME` too, or marketplace/auto-update
  caches bleed between profiles.
- Legacy `--config-dir=DIR` flag exists but is deprecated; precedence `--config-dir` >
  `COPILOT_HOME` > `~/.copilot` (first applicable wins, no merging).
- No data migration on switch; no named-profile command — isolation is pure directory
  relocation via env var.
- Additive (non-isolating) knobs: `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`, `COPILOT_SKILLS_DIRS`.

**This repo's implementation:** `profiles/copilot/bin/copilot-profile -p <name>` — sets
`COPILOT_HOME=~/.copilot-<name>` + `COPILOT_CACHE_HOME=<home>/cache`, symlinks
`settings.json` / `copilot-instructions.md` / `agents/*.agent.md` from
`settings/global/copilot-profiles/<name>/`, shared MCP from
`settings/global/copilot-mcp-config.json`, hooks from `platform/copilot/hooks/`.

## 4. Agents

- `--agent=NAME` flag or `/agent` picker. Definition = `NAME.agent.md` (YAML frontmatter:
  `name`, `description`, `tools: [...]`, optional `model`; body = system prompt).
- Precedence: project `.github/agents/` > personal `$COPILOT_HOME/agents/` > plugin-contributed.
- Built-ins: `explore`, `task`, `code-review`, `general-purpose`, `research`,
  `security-review`, plus always-on `rubber-duck` (disable via `builtInAgents.rubberDuck`).
  Per-agent model/effort config under `subagents.agents`; disable via
  `subagents.disabledSubagents`. Concurrency/depth (`COPILOT_SUBAGENT_MAX_CONCURRENT`,
  `_MAX_DEPTH`) honored only on usage-based billing.

## 5. Custom instructions

All of these load **simultaneously and merge** (no first-match-wins):
`CLAUDE.md`, `GEMINI.md`, `AGENTS.md` (git root + cwd), `.github/copilot-instructions.md`,
`.github/instructions/**/*.instructions.md`, `$COPILOT_HOME/copilot-instructions.md`,
`$COPILOT_HOME/instructions/**`, plus `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`.

- The CLI natively reads competitor instruction files — the most interoperable of the
  three Copilot surfaces.
- `@path` line-prefix imports supported (recursive, cycle/size-guarded) in `AGENTS.md`,
  `CLAUDE.md`, `.github/copilot-instructions.md`.
- `copilot init` / `/init` generates `.github/copilot-instructions.md`; silence the
  startup nag with `/init suppress`.

## 6. Hooks

Sources (all fire; pure union): policy (`/etc/github-copilot/policy.d/*.json` or
`HKLM\Software\Policies\GitHub\Copilot`; can't be disabled) → repo `.github/hooks/*.json`
→ user `$COPILOT_HOME/hooks/*.json` → inline `hooks` in repo/user settings (incl.
`.claude/settings.json`) → plugin `hooks.json`.

**14 events:** `sessionStart`, `sessionEnd`, `userPromptSubmitted`,
`userPromptTransformed`, `preToolUse` (allow/deny/modify), `postToolUse`,
`postToolUseFailure`, `preCompact`, `permissionRequest`, `agentStop` (block cap: 8),
`subagentStart`, `subagentStop`, `notification`, `errorOccurred`.

**3 handler types:** `command` (bash/powershell/command; `timeoutSec` default 30;
progress-message protocol), `http` (POST payload; https required for permission-granting
events), `prompt` (`sessionStart` only, interactive new sessions only).

**Fail-open/closed asymmetry (security-critical):** command `preToolUse` fails **closed**
on crash/non-zero exit, but **timeouts always fail open**; HTTP hooks fail **open** on any
network error. Write security-critical `preToolUse` hooks as command hooks.

**Dual naming:** camelCase events = native (camelCase fields); PascalCase events =
Claude-compat (snake_case fields, Claude matcher semantics, Claude tool-name mapping
`bash`→`Bash`, `view`→`Read`, etc.). Casing of the event key selects the mode — mixing
them up silently gives the wrong payload shape.

## 7. Plugins, skills, marketplace

- Manifest search order: `.plugin/plugin.json` (**Open Plugin Spec v1 canonical**, adopted
  1.0.74 / 2026-07-23) → `plugin.json` → `.github/plugin/plugin.json` →
  `.claude-plugin/plugin.json`. Only `name` is required. Component keys: `agents`,
  `skills` (array), `commands`, `hooks`, `mcpServers`, `lspServers`,
  `extensions.paths`/`.exclusive`.
- Marketplace = git repo with `.github/plugin/marketplace.json` (`name`, `owner`,
  `metadata`, `plugins[]` with `source` paths or remote repos). Identity =
  `plugin@marketplace`.
- Manage: `/plugins install SOURCE`, `/plugins install --skill <file|URL|dir> [--project]`,
  `/plugins enable|disable|remove|update|uninstall --plugin|--mcp|--skill NAME`,
  `/plugins marketplace add|remove|list|browse`; `copilot plugins list` non-interactively.
  Declarative: `enabledPlugins` + `extraKnownMarketplaces` settings (user/repo/MDM).
- **Gotcha:** plugin contents are cached at install; editing source does nothing until
  reinstall — use `--plugin-dir` during development.
- Skills: `skills/NAME/SKILL.md` (open Agent Skills spec, cross-vendor). Personal
  `$COPILOT_HOME/skills/`, extra dirs via `skillDirectories`/`COPILOT_SKILLS_DIRS`,
  plugin-contributed. `disabledSkills` to suppress.

## 8. MCP and LSP

- MCP: user `$COPILOT_HOME/mcp-config.json`; project `.mcp.json` or `.github/mcp.json`
  (project wins on name conflict); session-only `--additional-mcp-config=JSON|@file`;
  plugin `mcpServers`; Open-Plugin-Spec `mcp.json` also accepted. MDM allow/deny lists
  (deny wins; GitHub first-party server exempt).
- LSP: user `lsp-config.json`; project `lsp.json` / `.github/lsp.json`. `lspServers`
  keyed by name: `command`, `fileExtensions` (required), `args`, `env` (`${VAR}`
  expansion), `rootUri`, `initializationOptions`, `requestTimeoutMs` (default 90s). No
  servers bundled — install your own.

## 9. Extensions (SDK)

Node.js module (`extension.mjs|.cjs|.js`, **JS only**) in `.github/extensions/NAME/`
(project) or `$COPILOT_HOME/extensions/NAME/` (personal) or plugin-contributed. Forked as
child process, JSON-RPC `joinSession()`, registers tools/hooks live. Reloaded on
`/clear`; killed on exit. Separate standalone `CopilotClient` SDK exists for embedding.
Extensions = code-first; plugins = manifest-first distribution unit.

## 10. Gotchas checklist

- `-p` (prompt/headless) mode disables extensions, repo hooks, workspace MCP by default —
  opt back in via `GITHUB_COPILOT_PROMPT_MODE_{EXTENSIONS,REPO_HOOKS,WORKSPACE_MCP}`.
- `COPILOT_ALLOW_ALL=true` = full YOLO; MDM `permissions.disableBypassPermissionsMode`
  can kill all `--allow-all*`/`--yolo` flags and always beats user settings.
- MDM settings re-fetched hourly mid-session — policy changes land without restart.
- Hook timeout default 30s per entry (not Codex's 600s global).
- Airtight profiles need `COPILOT_HOME` **and** `COPILOT_CACHE_HOME`.
