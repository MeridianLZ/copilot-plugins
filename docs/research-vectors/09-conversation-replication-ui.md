# Research Vector: Conversation Replication UI

**Collected:** 2026-08-06 to 2026-08-12  
**Confidence:** High for repository audit; implementation remains incomplete.

## Authority split

- Native transcript: verbatim assistant/user/tool conversation ordering.
- Native OTel: execution graph, model, usage, timing, IDs, and provider metadata.
- Hook lane: lifecycle, policy, permissions, notifications, transformations,
  and audit evidence.
- MCP lane: outer/inner peer context and transport linkage.

## Replication requirements

Every visible conversation node needs a canonical identity object:

```text
sessionId
turnId
messageId
toolCallId
agentId
traceId
spanId
parentSpanId
eventId
```

Every source record needs one explicit disposition:

```text
rendered
represented
redacted
unavailable
unmatched
heuristic
deduplicated
invalid
late_out_of_order
```

## Current blockers

- Native IDs are parsed but not fully joined into one graph.
- Rich native OTel metadata is reduced before UI presentation.
- OTel links are not carried into conversation nodes or inspector targets.
- Native-first overlay hides most hook events.
- Native and hook terminal status can diverge.
- Unrecognized native event types are silently ignored.

## Sources

- `docs/otel-span-conversation-audit.md`
- `docs/otel-conversation-span-map.md`
- `copilot-otel-bridge/src/native-session.ts`
- `copilot-otel-bridge/src/conversation-projector.ts`
- `copilot-otel-bridge/ui/index.html`
