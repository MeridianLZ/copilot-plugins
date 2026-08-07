---
name: foundry-hosted-agent-scaffold
description: Scaffold a working Microsoft Foundry hosted agent - project layout, container, Responses API wiring, MAF (Microsoft.Agents.AI.*) agent class, Entra identity, OTel. Use for "create/scaffold a Foundry agent", "hosted agent starter", or standing up a new agent service. Do NOT use for design-only questions — that is aspire-foundry-deployment.
license: MIT
allowed-tools:
  - read
  - edit
  - execute
  - web
argument-hint: "<agent name and purpose> [--stack dotnet|python] [--framework maf|copilot-sdk]"
user-invocable: true
disable-model-invocation: false
---

# Foundry Hosted Agent Scaffold

Deliver a runnable skeleton:
1. Project: .NET 10 worker or minimal API; packages pinned (`Microsoft.Agents.AI.*`, `Azure.Identity`).
2. Agent class: MAF `AIAgent` with `AgentThread` per conversation; Foundry bridge via `persistentAgentsClient.CreateAIAgentAsync(...)` or `aiProjectClient.AsAIAgent(...)`.
3. Tools: MCP servers and custom functions declared, deferred where the set is large.
4. Identity: `DefaultAzureCredential` locally, per-agent Entra identity in Foundry; zero secrets in code (config SSoT = env/.env).
5. Observability: OTel exporter configured from env; traceparent flows in and out.
6. Container: distroless Dockerfile + Foundry hosted-agent manifest; scale-to-zero friendly (no startup migrations, fast cold start).

Verification is part of the skill: build, run locally, one live request through the agent loop, evidence in the report. Never target Assistants API or AutoGen.
