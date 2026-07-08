# fintech-marketplace

Two Claude Code plugins for enterprise fintech/banking work, distributed as a local marketplace.

| Plugin | Scope |
|---|---|
| **fintech-frontend** | React 19 + TypeScript · dnd-kit next-gen drag & drop · Redux Toolkit + RTK Query · WCAG 2.1 AA · BFF cookie auth · masked financial data |
| **fintech-backend** | .NET microservices · vertical slice architecture · Azure Service Bus outbox/saga · EF Core migration safety · ISO 20022 payments · double-entry ledger · PCI-DSS v4.0 / SOX ITGC / SOC 2 Type II / GLBA-FFIEC enforcement |

## Install

```bash
# from the extracted directory
/plugin marketplace add /absolute/path/to/fintech-marketplace
/plugin install fintech-frontend@fintech-marketplace
/plugin install fintech-backend@fintech-marketplace
```

Install one or both. They share no files and can be enabled per project — a backend-only repo doesn't need the frontend hooks firing on every write.

After changing anything other than a `SKILL.md`, run `/reload-plugins` or restart Claude Code. Hooks, `.mcp.json`, `.lsp.json`, and agents are not hot-reloaded.

## Requirements

- **`jq` on PATH** — every hook script parses its stdin payload with it. Without `jq` the hooks fail open (they `exit 0`), so enforcement silently disappears. Verify with `jq --version`.
- **LSP binaries are not bundled.** `.lsp.json` declares the connection; install the servers yourself:
  - frontend: `pnpm add -D typescript-language-server typescript`
  - backend: `dotnet tool install --global csharp-ls`
  - Delete the `.lsp.json` slot in a plugin if you don't want it.
- **MCP servers** declared in `.mcp.json` start when the plugin is enabled. Backend pulls Microsoft Learn (`https://learn.microsoft.com/api/mcp`) and Context7; frontend pulls Context7 and `chrome-devtools-mcp` via `pnpm dlx`. Remove entries you don't want auto-starting.

## A note on CLAUDE.md

Plugins do **not** auto-load a `CLAUDE.md`. The baseline conventions that would normally live there are instead in the `frontend-conventions` and `backend-conventions` skills, whose descriptions instruct Claude to read them at the start of any task in the relevant repo. That works, but it's a soft trigger rather than a guarantee.

If you want hard guarantees, copy the contents of those two skills into the `CLAUDE.md` of your `CLAUDE_CONFIG_DIR` profile (or the project root). Belt and braces is reasonable here given the compliance stakes.

## Layout

```
fintech-marketplace/
├── .claude-plugin/marketplace.json
└── plugins/
    ├── fintech-frontend/
    │   ├── .claude-plugin/plugin.json
    │   ├── .mcp.json · .lsp.json
    │   ├── agents/ (7) · commands/ (6) · skills/ (8)
    │   ├── hooks/hooks.json · scripts/ (3)
    │   └── output-styles/
    └── fintech-backend/
        ├── .claude-plugin/plugin.json
        ├── .mcp.json · .lsp.json
        ├── agents/ (12) · commands/ (8) · skills/ (15)
        ├── hooks/hooks.json · scripts/ (6)
        └── output-styles/
```

## Audit trail

The backend plugin writes an append-only JSONL record of every tool invocation to `$CLAUDE_FINTECH_AUDIT_DIR` (default `~/.claude-fintech-audit`). Point that at a retained volume if you want it to serve as SOC 2 evidence; rotate it yourself.
