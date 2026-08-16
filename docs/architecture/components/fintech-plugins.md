# Component: fintech-plugins

**Responsibility:** The two canonical Claude Code plugins — `fintech-frontend` (React 19 / TS / RTK Query / dnd-kit, WCAG 2.1 AA) and `fintech-backend` (C# .NET vertical slices, EF Core, Service Bus, ISO 20022, double-entry ledger) — that package the domain knowledge (agents, skills, commands, output styles), the tool surface (`.mcp.json`, `.lsp.json`), and the runtime enforcement wiring (`hooks/hooks.json` → `scripts/*.sh`). They are the canonical source every `targets/` port is generated from.

**Boundary:** in — plugin manifests, agent/skill/command Markdown, MCP and LSP server declarations, hook event registration and dispatch, and the plugin-local scripts (guards, formatters, audit log, session context). out — the canonical rule engine itself (`shared/guards/guard-core.sh`, guard-enforcement), the target generation (build-pipeline), and any application code (there is none in this repo). The two plugins share no files so each installs independently.

## Constituent files

| File | Role |
|------|------|
| `plugins/fintech-{frontend,backend}/.claude-plugin/plugin.json` | Manifest: name, version, description, author, keywords. |
| `plugins/fintech-backend/.mcp.json` | MCP servers: `context7`, `microsoft-learn`. |
| `plugins/fintech-frontend/.mcp.json` | MCP servers: `chrome-devtools`, `context7`. |
| `plugins/fintech-backend/.lsp.json` / `plugins/fintech-frontend/.lsp.json` | LSP servers: `csharp` / `typescript`. |
| `plugins/fintech-backend/agents/*.md` (12) | e.g. `aspnet-api-engineer`, `compliance-auditor`, `ledger-domain-modeler`, `microservice-architect`. |
| `plugins/fintech-frontend/agents/*.md` (7) | e.g. `a11y-auditor`, `react-dnd-architect`, `redux-rtk-architect`. |
| `plugins/fintech-backend/skills/*/SKILL.md` (15) | `pci-secure-coding`, `sox-change-control`, `ledger-modeling`, `efcore-migration-safety`, … |
| `plugins/fintech-frontend/skills/*/SKILL.md` (8) | `a11y-standards`, `bff-client-auth`, `dnd-architecture`, `rtk-query-patterns`, … |
| `plugins/fintech-backend/commands/*.md` (8) | `/audit-compliance`, `/iso20022-check`, `/ledger-review`, `/migration-safety`, `/threat-model`, … |
| `plugins/fintech-frontend/commands/*.md` (6) | `/a11y-audit`, `/migrate-dnd`, `/perf-audit`, `/review-frontend`, … |
| `plugins/*/hooks/hooks.json` | Event→script dispatch table; scripts referenced via `${CLAUDE_PLUGIN_ROOT}`. |
| `plugins/*/scripts/*.sh` | Guards, formatters, audit log, session-context injectors. |
| `plugins/*/output-styles/*.md` | Review output style (`fintech-backend-review.md`, frontend equivalent). |

## Lynchpin symbols

| Symbol | Location | Why load-bearing |
|--------|----------|------------------|
| PreToolUse[Bash] entry | `plugins/fintech-backend/hooks/hooks.json:4` | Registers `block-destructive.sh` (`:6`) and `block-secrets-exfil.sh` (`:7`) — the whole shell-command enforcement surface. |
| PreToolUse[Write\|Edit\|MultiEdit] entry | `plugins/fintech-backend/hooks/hooks.json:11` | Routes writes to `guard-backend-write.sh` (`:13`). |
| PostToolUse[Write\|Edit\|MultiEdit] entry | `plugins/fintech-backend/hooks/hooks.json:19` | `format-backend.sh` (`:21`). |
| PostToolUse `"matcher": ""` entry | `plugins/fintech-backend/hooks/hooks.json:25` | Empty matcher = **every** tool invocation is audited via `audit-log.sh` (`:27`) — the SOC 2 evidence trail. |
| SessionStart entry | `plugins/fintech-backend/hooks/hooks.json:31` | `backend-context.sh` (`:34`) injects the compliance regime banner. |
| PreToolUse[Write\|Edit\|MultiEdit] entry | `plugins/fintech-frontend/hooks/hooks.json:4` | Frontend's only PreToolUse hook — `guard-frontend-write.sh` (`:6`); the frontend plugin has no Bash guard. |
| PostToolUse + SessionStart entries | `plugins/fintech-frontend/hooks/hooks.json:10` | `format-frontend.sh` (`:14`) and `frontend-context.sh` (`:21`). |
| `LOG_DIR` resolution | `plugins/fintech-backend/scripts/audit-log.sh:5` | `${CLAUDE_FINTECH_AUDIT_DIR:-$HOME/.claude-fintech-audit}` — the audit sink location. |
| JSONL record shape | `plugins/fintech-backend/scripts/audit-log.sh:9` | Emits `{ts,user,session,tool,cwd,file,input_digest,ok}`; `input_digest` is a truncated base64 of `tool_input` (`:15`) so payloads are attested without being stored. |
| append + never-fail | `plugins/fintech-backend/scripts/audit-log.sh:17` | `>> $LOG_DIR/<UTC date>.jsonl`, errors swallowed, `exit 0` — audit logging never blocks a tool call. |
| formatter guard clause | `plugins/fintech-backend/scripts/format-backend.sh:6` | No file / missing file ⇒ exit 0; `*.cs` ⇒ `dotnet format whitespace` best-effort (`:8`). |
| formatter guard clause | `plugins/fintech-frontend/scripts/format-frontend.sh:6` | Same shape; `*.ts,tsx,js,jsx,json,css,md` ⇒ `pnpm exec prettier --write` (`:9`). |
| regime banner | `plugins/fintech-backend/scripts/backend-context.sh:6` | Declares PCI-DSS v4.0 / SOX ITGC / SOC 2 Type II / GLBA-FFIEC and the enforced invariants (`:8`). |
| repo probes | `plugins/fintech-backend/scripts/backend-context.sh:9` | Conditional context: pending migration artifacts (`:9`), unstructured address fields → ISO 20022 warning (`:12`), `CLAUDE_NOTES.md` (`:15`). |
| version probe | `plugins/fintech-frontend/scripts/frontend-context.sh:7` | Reads `react` and the installed dnd package out of `package.json`; warns when an unmaintained DnD library is present (`:14`). |

## Dependencies

- **Inbound (who uses this):** Claude Code itself (`/plugin marketplace add <repo>` then `/plugin install fintech-backend@fintech-marketplace`); `.claude-plugin/marketplace.json`; `build-pipeline` (`build/build.sh:18`, `:45`) reads these trees to generate all targets.
- **Outbound (what this uses):** `guard-enforcement` scripts under each plugin's `scripts/`; `jq` (every hook script parses stdin with it); `git` (`backend-context.sh:4`); optional `dotnet`, `pnpm`/`prettier`; MCP servers `context7`, `microsoft-learn`, `chrome-devtools`; LSP servers `csharp`, `typescript`.

## Data flow

See [fintech-plugins-dataflow.mmd](fintech-plugins-dataflow.mmd). Output payload summary:
Four payload families — PreToolUse deny decisions (`hookSpecificOutput.permissionDecision:"deny"`, exit 0), PostToolUse formatted files in place, one append-only audit JSONL record per tool invocation in `$CLAUDE_FINTECH_AUDIT_DIR/<UTC-date>.jsonl`, and SessionStart context text injected into the session transcript.
