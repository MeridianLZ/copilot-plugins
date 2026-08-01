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

---

# Multi-agent expansion

The same conventions, compliance rules, and expert content now target four coding agents. The Claude Code trees under `plugins/` are **canonical**; everything under `targets/` is **generated** by `build/build.sh`. Never hand-edit `targets/`.

```
plugins/            canonical Claude Code plugins (edit here)
shared/guards/      guard-core.sh — the one enforcement implementation
build/build.sh      regenerates every target; validates JSON + shell syntax
targets/codex/      Codex plugins + marketplace.json + hooks.json
targets/cursor/     .cursor/rules/*.mdc + .cursor/hooks.json + adapter
targets/copilot/    .github/agents/*.agent.md + pre-commit + CI workflow
targets/*/AGENTS.md cross-tool baseline (AGENTS.md open standard)
```

## Fidelity by target — read this before trusting anything

| Capability | Claude Code | Codex | Cursor | Copilot CLI |
|---|---|---|---|---|
| Plugin bundle + marketplace | native | native | none | none |
| Agents / personas | 19 agents | as skills | as rules | 19 `.agent.md` |
| Skills | 23 | 42 | 10 rules | folded into agents |
| Windows parity | bash only | bash only | bash only | bash + powershell |
| Slash commands | 14 | — | — | — |
| Hooks (enforcement) | full | full | shell + MCP only | **full** |
| MCP | yes | yes | yes | yes |
| LSP | yes | — | — | — |

**Codex is a near-lossless port.** Its hook system shares Claude Code's event names, `matcher`+`hooks[]` shape, and JSON-on-stdin contract, so the guard is the same script with a different output dialect (`permissionDecision`/`block` + exit 2 rather than `hookSpecificOutput` + exit 0). Codex actually exposes *more* events than Claude Code (`SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`) — those are unused here and are available if you want them.

**Cursor is a real but lossy translation.** Rules carry the content with correct activation modes: conventions are `alwaysApply: true`, file-scoped rules use `globs`, and judgment-heavy material is Agent-Requested via `description`. Hooks exist but are scoped to shell and MCP execution — they do **not** intercept Cursor's own file edits, so write-time content checks (PAN, float money, `dangerouslySetInnerHTML`) are advisory in Cursor. Use the pre-commit hook to close that gap.

**Copilot CLI enforces properly — and in one respect better than the others.** It has a GA lifecycle hook system (`sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred`, `agentStop`) plus a separate `permissionRequest` hook that fires ahead of the whole permission service. Config lives at `.github/hooks/*.json`, committed to the repo — so distribution is a merge, with no per-developer install step, and the policy is version-controlled and reviewable like any other code.

Two Copilot-specific advantages worth knowing:

- **The runtime fails closed for you.** For `preToolUse` command hooks, exit 2, crashes, and any other non-zero exit deny the tool call — and exit 2 denies *even if the hook's stdout says `allow`*. Our guard's exit-3-on-missing-`jq` therefore denies automatically. (Timeouts deliberately fail *open*, so keep the guard fast; it is well inside the 15s budget.)
- **Three decisions, not two.** `preToolUse` supports `ask` alongside `allow`/`deny`. The guard currently only ever returns `deny` or stays silent; if you want a middle tier — say, prompt rather than block on a borderline migration — that is a small edit to `emit_deny` and a genuinely useful escalation path the other three ecosystems can't express.

**Windows parity is Copilot-only.** Its hook entries take both `bash` and `powershell` keys and Copilot picks by OS, so `scripts/guard-core.ps1` is a full reimplementation of the guard (Luhn included) rather than a stub. The other three targets are bash-only.

### Known upstream bugs affecting this config

These are open issues in `github/copilot-cli`, not defects in this marketplace — but they dictate the layout:

- **Plugin-defined `preToolUse` hooks don't fire** (#2540, open, CLI 1.0.18). Only `config.json`-defined and `.github/hooks/` hooks execute. **This is why the guard ships as repo-scope `.github/hooks/` rather than a Copilot plugin bundle.** If you package it as a plugin, enforcement silently disappears.
- **`preToolUse` is not enforced in subagents** (#2392). A subagent can perform an action the main session would be blocked from. Treat subagent output as unguarded until that closes.
- **`sessionStart` ordering and output** (#2201, #1730) — the banner may fire after `userPromptSubmitted` and its stdout may not render. It's informational only, so nothing enforcing depends on it.

## Install per target

**Codex**
```bash
cp -r targets/codex/plugins ~/.codex/plugins
cp targets/codex/marketplace.json ~/.codex/marketplace.json
cp targets/codex/AGENTS.md <repo>/AGENTS.md
```

**Cursor**
```bash
cp -r targets/cursor/.cursor <repo>/.cursor
cp targets/cursor/AGENTS.md <repo>/AGENTS.md
```

**Copilot CLI** — four distribution shapes; see the `fintech-copilot-install` skill and `copilot-track-installer` agent for the full model, precedence rules, and verification steps.

*Repo scope (default — the only shape with guaranteed team-wide enforcement):*
```bash
cp -r targets/copilot/.github <repo>/.github     # agents + hooks + skills + workflow
cp -r targets/copilot/scripts <repo>/scripts     # pre-commit guard (defense in depth)
cp targets/copilot/AGENTS.md <repo>/AGENTS.md
git add .github/hooks && git commit -m "Add fintech compliance hooks"
```
The hooks are live for every collaborator once merged — `preToolUse` enforcement needs no local install. For the Copilot **cloud agent**, the config must be on the **default branch** to take effect.

*User scope (personal, cross-repo — never the control of record):*
```bash
mkdir -p ~/.copilot/hooks ~/.copilot/skills
cp targets/copilot/.github/hooks/fintech-compliance.json ~/.copilot/hooks/
cp -r targets/copilot/.github/skills/* ~/.copilot/skills/
```

*`gh skill` (skills only, versioned — GitHub CLI v2.90.0+):*
```bash
gh skill preview <org>/<skills-repo> <skill>      # always inspect before installing
gh skill install <org>/<skills-repo> <skill>@v1.2.0
gh skill update --all
```
Writes provenance (source repo, ref, git tree SHA) into SKILL.md frontmatter and detects upstream drift. Pin by tag or SHA for anything used in CI. It does **not** distribute hooks or agents.

**Verify, don't assume.** Restart the CLI, then have the agent attempt `kubectl delete pod test` and confirm it is denied. A configured control is not an enforced control — a plugin layout, a missing `jq`, or an un-restarted CLI all produce a config that looks right and blocks nothing. The pre-commit hook and CI workflow remain as defense in depth (they also cover the subagent gap in #2392):
```bash
ln -sf ../../scripts/pre-commit <repo>/.git/hooks/pre-commit
```

## The guard fails closed

`guard-core.sh` exits 3 if `jq` is missing rather than passing silently. The Claude Code hooks shipped in the first version of this marketplace failed *open* in that case — enforcement would vanish with no signal. If you already installed those, regenerate with `build/build.sh` and re-copy.
