---
name: copilot-sdk-session-wiring
description: Wire a production @github/copilot-sdk session - CopilotClient connection modes (stdio/TCP/headless attach), SessionConfig (model, reasoning effort, system-message sections, tools, MCP), SessionHooks, TelemetryConfig OTLP, infinite-session compaction, permissions. Use for "integrate the Copilot SDK", "headless copilot", "SDK hooks/telemetry", or embedding Copilot in a service. Do NOT use for Foundry-hosted agents — that is foundry-hosted-agent-scaffold.
license: MIT
allowed-tools:
  - read
  - edit
  - execute
  - web
argument-hint: "<integration to build> [--lang dotnet|typescript|python] [--mode spawn|headless-attach]"
user-invocable: true
disable-model-invocation: false
---

# Copilot SDK Session Wiring

Checklist (all items addressed or explicitly waived):
1. **Connection**: services attach to an independent `copilot --headless --port N` via `ForUri` + connectionToken (never spawn-per-request); dev tools may `ForStdio`. `ForUri` ⊥ `UseLoggedInUser`, ignores `BaseDirectory` — plan auth accordingly (copilot-sdk#483: .NET doesn't pass GITHUB_COPILOT_TOKEN to sessions).
2. **SessionConfig**: `Model`, `ReasoningEffort`, `SystemMessage` (Append; section-level Customize only with reason), `AvailableTools`/`ExcludedTools` (`mcp:<server>-<tool>` form), `McpServers`, `CustomAgents`, `InfiniteSessions` (defaults 0.80/0.95), `Memory`, `EnableSessionStore`.
3. **Hooks**: `OnPreToolUse` policy (allow/deny/ask + ModifiedArgs), `OnSessionStart` context injection, `OnErrorOccurred` retry policy. SDK hooks are the only place `userPromptSubmitted.modifiedPrompt` works.
4. **Tools**: `CopilotTool.DefineTool`, `Defer = Auto` for big sets, `SkipPermission` only for provably safe tools.
5. **Telemetry**: `TelemetryConfig` with OTLP endpoint from env; verify traceparent propagates CreateSession→Send→tool handler. This is the phase-2 OTel seam — leave exporter type configurable.
6. **Permissions**: explicit `OnPermissionRequest` handler; `ApproveAll` never in production paths (throws under managed settings anyway).

Verify live: create session, send prompt, observe `SessionIdleEvent`, dump event stream as evidence.
