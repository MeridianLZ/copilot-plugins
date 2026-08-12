# Research Vector: VS Code Agent Host OTel

**Collected:** 2026-08-12  
**Confidence:** High for VS Code Agent Host; not proof of ordinary Copilot CLI
user-config behavior.

## Findings

VS Code Agent Host has a separate OTel pipeline from extension-host telemetry.
It supports pass-through and local DB modes.

Environment variables found in the Agent Host implementation:

```text
COPILOT_OTEL_ENABLED
COPILOT_OTEL_ENDPOINT
COPILOT_OTEL_PROTOCOL
COPILOT_OTEL_EXPORTER_TYPE
COPILOT_OTEL_FILE_EXPORTER_PATH
COPILOT_OTEL_SOURCE_NAME
COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED
OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_EXPORTER_OTLP_PROTOCOL
OTEL_EXPORTER_OTLP_HEADERS
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT
OTEL_SERVICE_NAME
OTEL_RESOURCE_ATTRIBUTES
```

Agent Host settings include:

```text
chat.agentHost.otel.enabled
chat.agentHost.otel.exporterType
chat.agentHost.otel.otlpEndpoint
chat.agentHost.otel.captureContent
chat.agentHost.otel.outfile
chat.agentHost.otel.dbSpanExporter.enabled
```

Managed policy keys include:

```text
telemetry.enabled
telemetry.endpoint
telemetry.captureContent
telemetry.lockCaptureContent
```

## Implementation consequence

Agent Host DB mode can persist spans locally, but it is a separate runtime
surface. Do not assume these settings are read from ordinary Copilot CLI
`settings.json`.

## Sources

- https://github.com/microsoft/vscode/blob/main/src/vs/platform/agentHost/OTEL.md
- https://github.com/microsoft/vscode/blob/main/src/vs/platform/agentHost/node/otel/agentHostOTelService.ts
- https://github.com/microsoft/vscode/blob/main/src/vs/platform/policy/common/copilotManagedSettings.ts
