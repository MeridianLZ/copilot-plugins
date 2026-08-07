---
name: blackboard-sync
description: Read, append, or replay the agent_blackboard shared session memory (one append-only JSONL per session under ${COPILOT_PLUGIN_DATA}/agent_blackboard). Use to record a delegation/decision/artifact, to catch up on what other agents did this session, or to replay a prior session's trail. Do NOT use for long-term cross-session knowledge — that belongs in the kb, not the blackboard.
license: MIT
allowed-tools:
  - read
  - execute
argument-hint: "read|append|replay [<session_id>] [--event <type>] [--json '<payload>']"
user-invocable: true
disable-model-invocation: false
---

# Blackboard Sync

File: `${COPILOT_PLUGIN_DATA}/agent_blackboard/<session_id>.jsonl` (fallback `~/.copilot/plugin-data/copilot-home/agent_blackboard/`). Append-only; never rewrite a line.

Entry schema (all fields required unless marked optional):
`ts` ISO-8601 · `blackboard_id` ("bb-<session_id>") · `session_id` · `agent_id` · `agent_name` · `primary_agent_id` · `peer_session_id` (optional, peers only) · `role` orchestrator|specialist|peer · `event` plan|delegate|peer_ask|peer_reply|decision|artifact|error · `payload` object · `trace` `{traceparent, tracestate}`.

- **append**: build the JSON object, generate a fresh span_id inside a session-stable trace_id for `traceparent` (`00-<32hex>-<16hex>-01`), append with `>>`. jq-validate before appending; invalid JSON never lands.
- **read**: tail the current session file, filtered by `--event`.
- **replay**: goal-directed retrieval — filter by event type/agent relevant to the stated goal, then order by ts; do not dump the whole file into context.

OTel contract (phase 2 depends on this): trace_id is constant per session, span_id fresh per entry; never omit or fabricate malformed traceparents.
