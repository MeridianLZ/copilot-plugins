# copilot-home — repo instructions (projected)

This repository runs the copilot-home multi-agent system.

- **Orchestration**: multi-step or multi-perspective tasks go through the `primary-orchestrator` agent (`/agent primary-orchestrator`). It delegates to specialists (csharp-azure-architect, foundry-sdk-implementer, ai-research-engineer) and consults peers (chewy, buzz, goose) over persistent copilot-mcp sessions.
- **Shared memory**: first-class agents coordinate through the agent_blackboard — append-only JSONL, one file per session, under `${COPILOT_PLUGIN_DATA}/agent_blackboard/`. Every entry carries session_id, agent_id, primary_agent_id, blackboard_id, and a W3C traceparent (trace_id = md5(session_id)); these fields are load-bearing for OTel instrumentation — never omit them.
- **Skills**: invoke via `/copilot-home:<skill>` slash commands or by description match; each agent's three skills are listed in its `.agent.md`.
- **Guard rails**: the preflight-guard denies force pushes, recursive root deletes, and direct cluster mutations. Hooks load at CLI startup — after editing them, restart and verify enforcement with an attempted-block test, never by file presence.
