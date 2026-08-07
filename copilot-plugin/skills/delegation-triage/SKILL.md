---
name: delegation-triage
description: Choose the right executor for a subtask — a specialist subagent (csharp-azure-architect, foundry-sdk-implementer, ai-research-engineer), a peer session (chewy, buzz, goose), a skill, or inline execution. Use when decomposing multi-part work or when unsure who should own a subtask. Do NOT use to launch the work — it returns a routing decision, then you delegate.
license: MIT
allowed-tools:
  - read
argument-hint: "<subtask to route>"
user-invocable: true
disable-model-invocation: false
---

# Delegation Triage

Decision ladder (stop at the first hit):
1. **Inline** — bounded, <5 tool calls, no specialist knowledge needed. Fan-out for trivial work is waste.
2. **Skill** — an existing `/copilot-home:*` skill covers it exactly.
3. **Peer** — the value is a *perspective* (risk gut-check → chewy; independent verification → buzz; coverage/recon → goose). Peers converse; they don't take work orders.
4. **Specialist subagent** — the value is *labor* in a domain: design → csharp-azure-architect; build on Foundry/copilot-sdk/MAF → foundry-sdk-implementer; memory/context analysis → ai-research-engineer.
5. **Council** — decision with material disagreement risk → orchestrate-peer-council.

Output: `{executor, mechanism (inline|skill|subagent|peer-session|council), rationale (1 sentence), deadline (worst-case)}` — recorded to the blackboard as a `plan` event. Every delegation gets a deadline; no fire-and-forget.
