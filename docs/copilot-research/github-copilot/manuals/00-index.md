# GitHub Copilot — Instruction Manuals

Long-form operator manuals synthesized 2026-08-11 from the three raw research streams
(`../stream-1-copilot-cli/`, `../stream-2-copilot-vscode/`, `../stream-3-copilot-coding-agent/`,
all compiled 2026-07-25) plus a 2026-08-10 SOTA re-verification pass. Raw streams keep the
full evidence trail and citations; these manuals keep the operational knowledge.

| # | Manual | Covers |
|---|--------|--------|
| 1 | [01-copilot-cli-manual.md](01-copilot-cli-manual.md) | Copilot CLI: config dir, profiles (`COPILOT_HOME`), agents, instructions, hooks, plugins, MCP/LSP, extensions |
| 2 | [02-copilot-vscode-manual.md](02-copilot-vscode-manual.md) | Copilot in VS Code: modes, settings layers, profile-isolation reality, custom agents, `mcp.json`, skills |
| 3 | [03-copilot-cloud-agent-manual.md](03-copilot-cloud-agent-manual.md) | Copilot cloud agent (né coding agent): triggers, `copilot-setup-steps.yml`, MCP, agent profiles, security |
| 4 | [04-cross-surface-interop.md](04-cross-surface-interop.md) | What's shared across surfaces; the profile-scheme design this repo ships; Open Plugin Spec |

**Recency:** facts current as of stream compile (2026-07-25) unless marked with a later
check date. Copilot ships every 2–4 days — re-verify anything load-bearing before relying
on it months later. Known post-stream delta already folded in: user settings migrated
`config.json` → `settings.json` (JSONC, symlink-following writes; verified 2026-08-10).
