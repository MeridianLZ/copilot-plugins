---
name: orchestrate-peer-council
description: Fan a question out to the peer council (chewy, buzz, goose) as parallel copilot-mcp sessions and reconcile their answers into one recommendation. Use when a decision benefits from mechanic/precision/recon perspectives, when the user says "ask the peers", "council", or "second opinions", or before a risky change. Do NOT use for single-perspective questions — route those to one agent via delegation-triage.
license: MIT
allowed-tools:
  - read
  - copilot-mcp/ask
  - copilot-mcp/session_create
  - copilot-mcp/session_list
  - copilot-mcp/session_destroy
argument-hint: "<question for the council> [--peers chewy,buzz,goose] [--keep-warm]"
user-invocable: true
disable-model-invocation: false
---

# Orchestrate Peer Council

1. Resolve or create one copilot-mcp session per requested peer (`session_create`; reuse the session_id already on the blackboard if present — one session per peer per Copilot session).
2. Frame the question per persona: Chewy gets the risk/stability angle, Buzz the correctness/verification angle, Goose the coverage/what-are-we-missing angle. Prefix each prompt with the peer's system-prompt.md + specialized_role.md + mission.md fused, then the question.
3. `ask` all peers; each exchange is appended to the blackboard as `peer_ask` / `peer_reply` events with `peer_session_id` and traceparent.
4. Reconcile: agreements → recommendation; disagreements → surfaced verbatim with your arbitration and reason.
5. `session_destroy` unless `--keep-warm`.

Monitoring rule: give each peer a worst-case deadline (default the copilot-mcp ask timeout); a silent peer is reported as NO-REPLY, never silently dropped.
