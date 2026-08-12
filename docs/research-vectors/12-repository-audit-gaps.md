# Research Vector: Repository Audit and Missing Work

**Collected:** 2026-08-11 to 2026-08-12  
**Confidence:** High; based on current merged source and tests.

## Implemented

- Native OTel traces, metrics, and logs ingestion.
- Collector durable JSONL output.
- Incremental native cache with truncation/rewrite handling.
- Native transcript projection.
- Hook span assembler with lifecycle and point spans.
- MCP HTTP/WebSocket context extraction and peer linkage.
- Paged API, ETags, coverage, and forensic UI.
- OTel content capture launch paths set to `true`.

## Unaccounted or incomplete

1. Native `turnId`, `messageId`, and `toolCallId` are not one canonical graph.
2. Native OTel attributes/resources/scope/status/events/links are dropped during
   coverage reduction.
3. OTel links have no clickable UI representation.
4. Most hook events are hidden in native-first rendering.
5. Native and hook terminal reducers are separate.
6. Unknown native event types disappear without invalid dispositions.
7. Stdio MCP propagation is not wired.
8. Dynamic payload attributes lack searchable inspector rendering.
9. `parent_span_id` is normalized but not used for graph reconstruction.
10. Native source records lacking `session_id` cannot attach to a conversation.

## Next implementation slice

Create one canonical `ConversationIdentity` and preserve full sanitized native
record metadata through correlation. Add explicit `links`, `attributes`,
`resource`, `scope`, `status`, and `source_refs` fields to conversation nodes.
Render these in the inspector and mark every unrendered record with a
disposition instead of dropping it.

## Sources

- `docs/otel-span-conversation-audit.md`
- `copilot-otel-bridge/src/coverage.ts`
- `copilot-otel-bridge/src/correlation.ts`
- `copilot-otel-bridge/src/conversation-projector.ts`
- `copilot-otel-bridge/ui/index.html`
