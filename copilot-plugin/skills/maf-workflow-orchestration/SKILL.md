---
name: maf-workflow-orchestration
description: Build multi-agent workflows on Microsoft Agent Framework - sequential and handoff orchestration, agent-as-tool (connected agents), Agent Harness providers (FileMemoryProvider, TodoProvider, BackgroundAgentsProvider), OpenTelemetryAgent middleware, Foundry bridging. Use for "orchestrate agents in .NET", "MAF workflow", "handoff topology", or migrating SK/AutoGen orchestration. Do NOT use for this plugin's own peer-council routing — that is orchestrate-peer-council.
license: MIT
allowed-tools:
  - read
  - edit
  - execute
  - web
argument-hint: "<workflow to build> [--pattern sequential|handoff|connected-agents]"
user-invocable: true
disable-model-invocation: false
---

# MAF Workflow Orchestration

Pattern selection:
- Linear pipeline → `SequentialOrchestration`.
- Dynamic routing between specialists → **Handoff Orchestration** (declare topology + edges; framework injects handoff tools).
- Parent delegates and owns state/retries → **connected agents** (agent-as-tool).
- Long-running with memory/compaction needs → **Agent Harness** (auto-compaction, `FileMemoryProvider`, `TodoProvider`, `BackgroundAgentsProvider` for sleep-time work).

Rules: new code on `Microsoft.Agents.AI.*` only (SK agents = bug fixes only; AutoGen .NET = maintenance-only, refuse new builds on it); every agent wrapped in `OpenTelemetryAgent` middleware; `ToolApprovalAgent` in front of mutating tools; Foundry bridge via `AsAIAgent`/`CreateAIAgentAsync` when the runtime should be managed.

Verify: run the workflow with a scripted input, capture the thread/`ConversationId` and span tree as evidence.
