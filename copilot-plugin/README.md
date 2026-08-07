# copilot-home

Multi-agent GitHub Copilot CLI plugin mirroring every user-configurable `~/.copilot` surface. Current to CLI 1.0.78 (2026-08).

## What's inside

| Dir | Surface |
|---|---|
| `agents/` | 7 agents, each a dir of `<name>.agent.md` (full frontmatter) + `system-prompt.md` + `specialized_role.md` + `mission.md`, fused at spawn |
| `skills/` | 22 skills (3 per agent + installer), full SKILL.md frontmatter |
| `commands/` | 22 TOML slash evokers (`/copilot-home:<skill>`), generated 1:1 from skill frontmatter |
| `hooks/` | inject-lane hooks (`${PLUGIN_ROOT}` cwd workaround for #2540) + blackboard scripts |
| `.mcp.json` | copilot-mcp (12 tools) — peer-council transport |
| `.github/` | projection payload: repo-scope hooks config, mcp.json, instructions |
| `templates/user-scope/` | `~/.copilot` templates (settings, mcp-config, permissions, instructions; config.json annotated-only) |
| `docs/injection-and-projection.md` | the architecture doc — read this first |

## Agents

- **primary-orchestrator** — decomposes, delegates, arbitrates the blackboard.
- **csharp-azure-architect** — read-only design/review (Well-Architected, Foundry-current).
- **foundry-sdk-implementer** — builds on Microsoft Foundry / MAF / @github/copilot-sdk.
- **ai-research-engineer** — agentic context & memory systems; blackboard schema steward.
- **Chewy / Buzz / Goose** — first-class peer copilots reached over persistent copilot-mcp sessions (mechanic / precisionist / RIO), each offering 3 skills to the orchestrator.

## agent_blackboard

Shared session memory for first-class agents: append-only JSONL, one file per session at `${COPILOT_PLUGIN_DATA}/agent_blackboard/<session_id>.jsonl`. Every entry: `ts, blackboard_id, session_id, agent_id, agent_name, primary_agent_id, peer_session_id?, role, event, payload, trace{traceparent}`. trace_id = md5(session_id) — deterministic, coordination-free, OTel-joinable (phase 2).

## Install

```bash
copilot plugin marketplace add lukezautke/fintech-marketplace
copilot plugin install copilot-home@copilot-home-marketplace
# then, inside a session:
/copilot-home:copilot-home-install all   # projects repo .github payload + user-scope templates (diff-preview first)
```

Restart the CLI after install (hooks/MCP load at startup), then verify live: attempt `git push --force` → expect denial; `ping` copilot-mcp → pong.
