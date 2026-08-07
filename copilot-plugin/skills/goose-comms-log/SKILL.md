---
name: goose-comms-log
description: Goose's comms log - reconstruct what happened in a session from the agent_blackboard JSONL and copilot-mcp session_events into a replayable briefing - decisions made, evidence attached, open threads, who owes what. Use for "what happened this session", handoff briefings, session postmortems, catching up after compaction. Do NOT use for anomaly root-causing — that is buzz-telemetry-analysis.
license: MIT
allowed-tools:
  - read
  - execute
  - copilot-mcp/session_events
  - copilot-mcp/session_list
argument-hint: "[<session_id>] [--since <ts>] [--for-agent <name>]"
user-invocable: true
disable-model-invocation: false
---

# Goose: Comms Log

Method:
1. Pull the session's blackboard JSONL (`${COPILOT_PLUGIN_DATA}/agent_blackboard/<session_id>.jsonl`) and, for peer traffic, `session_events` per peer_session_id.
2. Order by ts; group by traceparent so each delegation thread reads as one exchange.
3. Compress goal-directedly (retrieve what the briefing's audience needs — do not eagerly summarize into the store; the JSONL stays raw).
4. Briefing sections: **Decisions** (with who and evidence) · **Artifacts** (paths) · **Open threads** (who owes what) · **Disagreements** (verbatim, unaveraged) · **Coverage** (what this log does NOT capture).

A newcomer must be able to reconstruct the session from the briefing alone — that is the acceptance test. Briefing is itself appended as an `artifact` event with `agent_name: goose`.
