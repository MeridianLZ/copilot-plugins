---
name: azure-well-architected-review
description: Pillar-by-pillar Well-Architected review (Security, Reliability, Cost, Performance, Operational Excellence) of an Azure/.NET design or repo, current to 2026 platform reality (Foundry, Responses API, MAF). Use for "review this architecture", "is this design sound", or pre-implementation design gates. Do NOT use for code-level review of a diff — that is not an architecture review.
license: MIT
allowed-tools:
  - read
  - web
argument-hint: "<design doc or repo path> [--pillar security|reliability|cost|performance|operations]"
user-invocable: true
disable-model-invocation: false
---

# Azure Well-Architected Review

Per pillar (or the one requested): finding → evidence (file:line or doc citation) → recommendation (named service/SDK/version) → effort (S/M/L). Order: Security → Reliability → Cost → Performance → Operational Excellence.

2026 gates that always apply: no Assistants API in new designs (retires 2026-08-26; Responses API instead); MAF over SK/AutoGen for new agent code; per-agent Entra identity for hosted agents; Cosmos DB for conversation state; money as decimal/minor-units, never float; OTel + traceparent end to end; Service Bus via Entra auth, never key-embedded connection strings.

Output: findings table + one-paragraph verdict per pillar + Mermaid topology diagram of the recommended shape. Read-only — describe fixes, never apply them.
