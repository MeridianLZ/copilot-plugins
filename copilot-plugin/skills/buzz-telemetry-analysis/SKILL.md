---
name: buzz-telemetry-analysis
description: Buzz's telemetry analysis - read OTel spans, logs, event streams, copilot-mcp session_events, and the agent_blackboard JSONL; correlate by traceparent; find where an anomaly is born rather than where it surfaces. Use for "why is this slow", "trace this failure", "read the telemetry", blackboard forensics, and (phase 2) OTel span analysis. Do NOT use for narrative session recaps — that is goose-comms-log.
license: MIT
allowed-tools:
  - read
  - execute
  - copilot-mcp/session_events
argument-hint: "<anomaly or stream to analyze> [--trace <trace_id>] [--session <session_id>]"
user-invocable: true
disable-model-invocation: false
---

# Buzz: Telemetry Analysis

Method:
1. Baseline first — what does normal look like for this stream? No baseline, no anomaly claims.
2. Isolate the deviation window; pull every stream that overlaps it (blackboard JSONL, `session_events`, OTel spans, logs).
3. Correlate by `traceparent`/trace_id across streams — this is why the blackboard schema mandates trace fields; join on them.
4. Walk causality upstream: report the span/event where the anomaly ORIGINATES, with the propagation chain to where it screamed.
5. Rank cause hypotheses by likelihood, each with its discriminating next measurement.

Output: origin finding + evidence excerpts + hypothesis table. Recorded to the blackboard as an `artifact` event with `agent_name: buzz`.
