# Research Vector: Telemetry Privacy and Redaction

**Collected:** 2026-08-01 to 2026-08-12  
**Confidence:** High for policy requirements; exact enterprise policy behavior
depends on deployment surface.

## Findings

GenAI message capture can include prompts, responses, tool arguments, tool
results, source code, commands, and credentials. Native capture is therefore
opt-in. This project now sets:

```text
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true
```

That is intentional for local forensic replication and must remain loopback or
sanitized before any external export.

Hook content modes remain separate:

```text
COPILOT_TRACE_CONTENT_MODE=off|hash|full
```

Native OTel records require redaction before durable persistence and UI
projection. Hashes are pseudonymous sensitive data, not anonymization.

## Implementation consequence

Content capture true is valid only with explicit local-runtime boundaries,
secret scanning, bounded retention, and no credential-bearing exporter headers
in repository files.

## Sources

- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://github.com/microsoft/vscode/blob/main/src/vs/platform/agentHost/OTEL.md
- `copilot-otel-bridge/src/security.ts`
- `copilot-otel-bridge/src/native-otel.ts`
- `docs/security/incidents/2026-08-08-proxy-credential-exposure.md`
