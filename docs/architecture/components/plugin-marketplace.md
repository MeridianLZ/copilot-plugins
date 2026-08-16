# Component: plugin-marketplace

**Responsibility:** Declares the marketplace manifests that make this repo installable
by a coding-agent host. `.claude-plugin/marketplace.json` advertises the two canonical
Claude Code plugins (`fintech-frontend`, `fintech-backend`) with relative `source` paths;
`.github/plugin/marketplace.json` advertises the separate `copilot-home` Copilot CLI
plugin with an expanded metadata schema (surface directories, hooks file, MCP servers).
The manifests are pure declaration — no code runs here; the host does the resolution.

**Boundary:** in — manifest JSON, plugin names, descriptions, `source` paths, per-plugin
surface pointers, marketplace owner/metadata. out — plugin *contents* (see
`fintech-plugins`, `copilot-plugin`), the generated per-target marketplace manifests
under `targets/` (see `target-ports`), and hook/guard execution (see `guard-enforcement`).

## Constituent files

| File | Role |
|------|------|
| `.claude-plugin/marketplace.json` | Claude Code marketplace root: `name`, `owner`, 2-entry `plugins[]` with `./plugins/<name>` sources |
| `.github/plugin/marketplace.json` | Copilot CLI marketplace root: `metadata.pluginRoot`, 1-entry `plugins[]` (`copilot-home`) with surface-directory keys |
| `targets/codex/marketplace.json` | Generated Codex dialect of the same registry (`source:{source:"local",path:…}`, `policy`, `category`) — owned by `target-ports`, validated here |

## Lynchpin symbols

JSON manifests carry no symbols; the load-bearing keys are:

| Key | Location | Why load-bearing |
|--------|----------|------------------|
| `plugins[].source` | `.claude-plugin/marketplace.json:7`, `:12` | Relative path the host resolves to a plugin dir; a wrong path makes the plugin uninstallable |
| `owner.name` | `.claude-plugin/marketplace.json:3` | Namespaces installs as `<plugin>@fintech-marketplace` |
| `metadata.pluginRoot` | `.github/plugin/marketplace.json:10` | Base against which `source: "./copilot-plugin"` resolves in Copilot CLI |
| `hooks` / `mcpServers` / `agents` / `skills` / `commands` | `.github/plugin/marketplace.json:25-29` | Copilot's manifest declares surface locations explicitly, unlike Claude's convention-based discovery |
| `strict: false` | `.github/plugin/marketplace.json:30` | Tolerates unknown manifest keys across Copilot CLI versions |
| jq validation loop | `build/build.sh:69-73` | The only automated check that these manifests parse; `jq empty` failure fails the build |

## Dependencies

- **Inbound (who uses this):** the Claude Code host (`/plugin marketplace add <repo>`,
  `/plugin install fintech-backend@fintech-marketplace`), the Copilot CLI plugin
  installer, and `build-pipeline` (`build/build.sh:69-73` validates the JSON).
- **Outbound (what this uses):** `plugins/fintech-frontend/`, `plugins/fintech-backend/`
  (Claude), `copilot-plugin/` (Copilot). Only by path reference — no imports.

## Data flow

See [plugin-marketplace-dataflow.mmd](plugin-marketplace-dataflow.mmd). Output payload summary:
a resolved plugin registry — `{name, source-path, description}` records the host turns into
an on-disk install (agents, skills, commands, hooks.json, .mcp.json) registered into the session.
