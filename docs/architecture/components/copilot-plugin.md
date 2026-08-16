# Component: copilot-plugin

**Responsibility:** The `copilot-home` plugin: a declarative bundle of 7 role agents, 22 skills with matching slash-command evokers, dual-lane hooks, an MCP server registration, and user-scope config templates. Its manifest points the Copilot CLI at each content directory; its hook scripts enforce a preflight deny-list and write every session exchange into an OTel-shaped `agent_blackboard` JSONL shared memory.

**Boundary:** in — plugin manifest and discovery paths, agent/skill/command markdown+TOML content, hook wiring and the bash hook implementations, blackboard append format, installer templates for `~/.copilot`; out — the MCP server implementation itself (`copilot-mcp`, only *referenced* via `.mcp.json`), telemetry export (`copilot-otel-bridge`), and the Copilot CLI's own agent-loop behavior.

## Constituent files

| File | Role |
|------|------|
| `copilot-plugin/plugin.json` | Manifest — declares every discovery path the CLI reads |
| `copilot-plugin/hooks/copilot-hooks.json` | Hook wiring for `sessionStart`, `preToolUse`, `postToolUse`, `errorOccurred`, `sessionEnd` (10 s timeouts, `${PLUGIN_ROOT}/hooks` cwd) |
| `copilot-plugin/hooks/scripts/bb-lib.sh` | Blackboard primitives: dir resolution, W3C trace/span ids, append |
| `copilot-plugin/hooks/scripts/preflight-guard.sh` | `preToolUse` deny-list (force push, `rm -rf /`, `kubectl delete`, `helm uninstall`, `git reset --hard origin/`) |
| `copilot-plugin/hooks/scripts/blackboard-append-tool.sh` | `postToolUse` + `errorOccurred` recorder |
| `copilot-plugin/hooks/scripts/session-blackboard-init.sh` / `-close.sh` | Session open/close blackboard entries; injects the session trace id into context |
| `copilot-plugin/agents/*/` | 7 agents; each has `<name>.agent.md` + `mission.md`, `specialized_role.md`, `system-prompt.md` |
| `copilot-plugin/skills/*/SKILL.md` | 22 skills |
| `copilot-plugin/commands/*.toml` | 22 slash-command evokers, one per skill |
| `copilot-plugin/.mcp.json`, `.github/mcp.json` | Registers `copilot-mcp` so peer-copilot agents can call `ask_*` |
| `copilot-plugin/lsp.json` | LSP server map (currently empty `{}`) |
| `copilot-plugin/templates/user-scope/` | `settings.json`, `mcp-config.json`, `permissions-config.json`, `copilot-instructions.md`, annotated `config.json` |
| `copilot-plugin/.github/` | Repo-scope projection: `copilot-instructions.md`, `instructions/`, `hooks/copilot-home.json` |
| `copilot-plugin/docs/injection-and-projection.md` | How repo/user-scope projection works |

## Lynchpin symbols

| Symbol | Location | Why load-bearing |
|--------|----------|------------------|
| `agents` / `skills` / `commands` keys | `copilot-plugin/plugin.json:17`–`:19` | Directory-based auto-discovery — adding a folder is the whole registration step |
| `hooks` key | `copilot-plugin/plugin.json:20` | Points at the hook wiring; without it no enforcement or memory runs |
| `mcpServers` key | `copilot-plugin/plugin.json:21` | The only link from plugin content to the `copilot-mcp` peer-copilot tools |
| `lspServers` key | `copilot-plugin/plugin.json:22` | LSP extension point, presently an empty map |
| `sessionStart` handler | `copilot-plugin/hooks/copilot-hooks.json:4` | Runs `session-blackboard-init.sh`; establishes the session's blackboard + trace id |
| `preToolUse` handler | `copilot-plugin/hooks/copilot-hooks.json:12` | Runs `preflight-guard.sh` before every tool call — the enforcement seam |
| `postToolUse` / `errorOccurred` handlers | `copilot-plugin/hooks/copilot-hooks.json:20`, `:28` | Both route to `blackboard-append-tool.sh`, the latter with `--event error` |
| `bb_append` | `copilot-plugin/hooks/scripts/bb-lib.sh:33` | Single writer of the blackboard record shape; every hook goes through it |
| `bb_trace_id` / `bb_span_id` | `copilot-plugin/hooks/scripts/bb-lib.sh:14`, `:24` | Derive the W3C `traceparent` (`00-<trace>-<span>-01`) that makes the blackboard OTel-joinable |
| `deny` | `copilot-plugin/hooks/scripts/preflight-guard.sh:27` | Emits `{permissionDecision:"deny", permissionDecisionReason}` on stdout **and** records the verdict, then `exit 0` |
| session-id extraction | `copilot-plugin/hooks/scripts/blackboard-append-tool.sh:23` | `jq -r '.sessionId // .session_id'` — tolerates both Copilot payload dialects |
| tool payload projection | `copilot-plugin/hooks/scripts/blackboard-append-tool.sh:28` | Compacts the raw tool call into the stored payload |
| orchestrator plan entry | `copilot-plugin/hooks/scripts/session-blackboard-init.sh:20` | First blackboard record of a session; carries the trace id into agent context |

## Dependencies

- **Inbound (who uses this):** the GitHub Copilot CLI session loader (plugin discovery + hook dispatch); the `copilot-home-install` skill/command which projects `templates/user-scope/` into `~/.copilot`.
- **Outbound (what this uses):** `jq` (every hook script parses stdin with it); `copilot-mcp` via `.mcp.json` for the Chewy/Buzz/Goose peer tools; the `agent_blackboard` JSONL directory resolved by `bb_dir`; the same hook event names consumed by `copilot-otel-bridge`.

## Data flow

See [copilot-plugin-dataflow.mmd](copilot-plugin-dataflow.mmd). Output payload summary:
Plugin discovery yields registered agents/skills/commands/MCP tools; each tool call then produces either a deny verdict JSON on stdout or an appended `agent_blackboard/<session>.jsonl` record carrying `blackboard_id`, `agent_id`, `role`, `event`, `payload`, and a W3C `traceparent`.
