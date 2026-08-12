# Research Vector: Native Copilot OTel

**Collected:** 2026-08-01 to 2026-08-12  
**Confidence:** High for current CLI reference and SDK contract.

## Findings

Native OTel is enabled by `COPILOT_OTEL_ENABLED=true`, an OTLP endpoint, or a
file exporter path. Native exporter types are `otlp-http` and `file`. Supported
HTTP protocols are `http/json` and `http/protobuf`.

Native telemetry is the authoritative lane for:

- `invoke_agent`, `chat`, and `execute_tool` span structure;
- model identity;
- input/output/cache/reasoning usage categories;
- token and AIU/cost data where available;
- native tool-call IDs;
- execution duration and provider metadata.

Native file export contains all signals as JSON Lines. Content capture is
opt-in through `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`.

## Implementation consequence

Conversation reconstruction must combine native transcript events with native
OTel records. Hook spans remain a control-plane overlay. Native OTel records
must retain signal, trace/span/parent IDs, model, usage, attributes, resources,
scope, status, links, validity, and redaction metadata through correlation.

## Sources

- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://github.com/github/copilot-sdk/blob/main/docs/observability/opentelemetry.md
- `docs/copilot-research/CHATGPT_github-copilot-cli-otel-hook-bridge/docs/state-of-the-art-research.md`
- `docs/otel-span-conversation-audit.md`
