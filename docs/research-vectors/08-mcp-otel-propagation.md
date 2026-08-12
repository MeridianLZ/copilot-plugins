# Research Vector: MCP OTel Propagation

**Collected:** 2026-08-01 to 2026-08-12  
**Confidence:** High for W3C carrier mechanics; medium for complete Copilot
runtime coverage.

## Findings

W3C carrier fields:

```text
traceparent
tracestate
baggage
```

For JSON-RPC, outbound context belongs in `params._meta`. HTTP and WebSocket
transports can extract it. Tool handlers can restore inbound context and create
child spans.

The repository emits bounded `mcp.peer_link` records containing server,
tool, status, trace/span IDs, session ID, request ID, and transport.

The stdio transport does not currently establish production peer context.

## Implementation consequence

MCP lineage must remain separate from Copilot execution spans but navigable by
peer request ID, trace ID, inner session ID, and transport. The UI needs link
targets and propagation disposition, not just a peer count.

## Sources

- https://github.com/github/copilot-sdk/blob/main/docs/observability/opentelemetry.md
- https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- `copilot-mcp/src/telemetry-context.ts`
- `copilot-mcp/test/mcp-propagation.test.ts`
