---
name: buzz-docking-contract
description: Buzz's docking contract - pin down the integration contract between two systems before they meet - message schemas, error semantics, timeout behavior, version pins, fail-open/fail-closed decisions. Use for MCP server↔client integration, hook↔CLI contracts, agent↔agent protocols, API handshakes. Do NOT use for full API surface design — that is csharp-api-design.
license: MIT
allowed-tools:
  - read
  - search
  - web
argument-hint: "<system A> <system B> [--protocol mcp|hook|http|jsonrpc]"
user-invocable: true
disable-model-invocation: false
---

# Buzz: Docking Contract

The docking checklist — every row filled or the dock is a hope:

| Item | Contract |
|---|---|
| Message schema | exact fields, types, required/optional, versioned example |
| Error semantics | every error class → who sees it, who retries, terminal vs transient |
| Timeouts | value, who enforces, and the CRITICAL bit: fail-open or fail-closed (Copilot hooks: non-zero preToolUse exit denies; timeout fails OPEN — design for both) |
| Versioning | pin + compatibility rule (e.g. MCP spec revision negotiation) |
| Auth/identity | token type, scope, rotation |
| Liveness | ping/health contract, dead-peer detection |

Both sides must be buildable from the document without a meeting. Contract lands on the blackboard as an `artifact` event; disagreements between the two systems' assumptions are the headline, not a footnote.
