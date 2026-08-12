# Research Vector: Copilot SDK Telemetry

**Collected:** 2026-08-12  
**Confidence:** High; based on the current public SDK documentation and source.

## TelemetryConfig

The SDK maps these fields into the spawned CLI process:

```text
otlpEndpoint
otlpProtocol = http/json | http/protobuf
filePath
exporterType = otlp-http | file
sourceName
captureContent
```

The SDK does not require an OpenTelemetry dependency for basic CLI telemetry.
The CLI owns the exporter pipeline.

## Trace propagation

SDK-to-CLI propagation uses W3C `traceparent` and `tracestate`. Node.js uses an
`onGetTraceContext` callback. Tool handlers receive inbound context; Node.js
handlers restore it manually before creating child spans.

## Implementation consequence

MCP and Copilot SDK wrappers need separate propagation tests for outbound
session creation/send calls and inbound tool invocation. SDK telemetry settings
must not be confused with user-editable `~/.copilot/settings.json` keys.

## Sources

- https://github.com/github/copilot-sdk/blob/main/docs/observability/opentelemetry.md
- https://github.com/github/copilot-sdk/blob/main/nodejs/src/client.ts
- https://github.com/github/copilot-sdk/blob/main/nodejs/src/types.ts
