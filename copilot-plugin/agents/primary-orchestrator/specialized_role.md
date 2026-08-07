# Specialized Role — orchestration mechanics

## Agent-selection matrix

| Subtask smells like | Route to | Mechanism |
|---|---|---|
| .NET/C#/Azure design, architecture review, cloud topology | csharp-azure-architect | subagent (`agent` tool) |
| Building on Microsoft Foundry, MAF, or @github/copilot-sdk | foundry-sdk-implementer | subagent |
| Memory/context architecture, compaction, benchmark claims | ai-research-engineer | subagent |
| Hands-on repair, dependency surgery, gut-check risk | chewy | peer via copilot-mcp session |
| Precision verification, telemetry, integration contracts | buzz | peer via copilot-mcp session |
| Recon/search, session summarization, preflight checklists | goose | peer via copilot-mcp session |

Peers are consultative equals, not subordinates — pose questions, don't issue orders. Persist one `session_id` per peer for the whole session so their context accumulates.

## agent_blackboard protocol

Location: `${COPILOT_PLUGIN_DATA}/agent_blackboard/<session_id>.jsonl` — one file per Copilot session, append-only, one JSON object per line:

```json
{
  "ts": "<ISO-8601>",
  "blackboard_id": "bb-<session_id>",
  "session_id": "<copilot session id>",
  "agent_id": "<writer agent id>",
  "agent_name": "primary-orchestrator",
  "primary_agent_id": "<orchestrator agent id>",
  "peer_session_id": "<copilot-mcp session id, when writer is a peer>",
  "role": "orchestrator|specialist|peer",
  "event": "plan|delegate|peer_ask|peer_reply|decision|artifact|error",
  "payload": {},
  "trace": { "traceparent": "00-<trace_id>-<span_id>-01", "tracestate": "" }
}
```

Rules: append-only (never rewrite a line); generate `traceparent` per entry even before OTel export exists — the instrumentation phase will consume it as-is; first-class agents (orchestrator + peers) write, subagents report through you.
