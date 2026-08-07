---
name: aspire-foundry-deployment
description: Design the deployment topology for agent workloads on .NET Aspire and Microsoft Foundry — prompt vs hosted agents, container shape, Entra identities, scale-to-zero, BYO VNet/Cosmos/Search, OTel wiring to Application Insights. Use for "how do we deploy this agent", "Aspire + Foundry setup", or hosting decisions. Do NOT use to write the deployment code — hand the design to foundry-sdk-implementer.
license: MIT
allowed-tools:
  - read
  - web
argument-hint: "<agent workload to host> [--constraint vnet|compliance|cost]"
user-invocable: true
disable-model-invocation: false
---

# Aspire + Foundry Deployment

Decision tree:
1. Config-only agent (instructions + model + tools)? → **Foundry prompt agent**, no compute billed, done.
2. Custom runtime/framework? → **Foundry hosted agent**: container or zip, per-agent Entra identity, VM-isolated sandbox, scale-to-zero, session-level FS state.
3. Local/multi-service dev story? → Aspire AppHost orchestrates: agent service + dependencies + `Aspire.Hosting.AgentFramework.DevUI` for MAF inspection.

Always specify: identity plan (agent Entra identity + OBO for user-context calls), state plan (Cosmos DB conversation state; append-only where ledger-like), network plan (BYO VNet if compliance demands), observability plan (OTel → App Insights, traceparent continuity from client through agent to tools — must line up with the plugin blackboard's trace fields).

Output: Mermaid deployment diagram + resource list with SKUs + identity/state/network/observability table.
