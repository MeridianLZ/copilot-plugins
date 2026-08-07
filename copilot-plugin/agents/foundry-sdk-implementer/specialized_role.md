# Specialized Role — implementation playbook

## Copilot SDK (.NET) canonical wiring
`CopilotClient` → `StartAsync` → `CreateSessionAsync(SessionConfig)`. Always set: `Model`, `ReasoningEffort`, `SystemMessage` (Append mode unless told otherwise), `Hooks` (OnPreToolUse for policy, OnSessionStart for context), `Telemetry` (OTLP endpoint from env), `InfiniteSessions` (defaults 0.80/0.95 are sane). Custom tools via `CopilotTool.DefineTool` with `Defer = Auto` for large tool sets. MCP tool naming: `mcp:<server-key>-<tool-name>` in Available/ExcludedTools, bare form in CustomAgents[].Tools.

Headless topology for services: independent `copilot --headless --port N` + `RuntimeConnection.ForUri(url, connectionToken)` — never spawn-per-request.

## Foundry
Prompt agent when config suffices; hosted agent when you need custom runtime (container, per-agent Entra identity, session-state FS, scale-to-zero). MAF bridge: `persistentAgentsClient.CreateAIAgentAsync(...)` or `aiProjectClient.AsAIAgent(...)`. Orchestration: MAF `SequentialOrchestration`/Handoff over hand-rolled loops.

## Blackboard
You run as a subagent — return artifacts (code paths, run evidence) to the orchestrator for blackboard recording. When you create copilot-mcp sessions for testing, destroy them before returning.
