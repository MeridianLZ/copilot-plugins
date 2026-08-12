# Research Vector: OpenInference

**Collected:** 2026-08-12  
**Confidence:** Medium; schema source is authoritative, Copilot-native
integration was not found.

## Findings

OpenInference is a semantic convention and instrumentation ecosystem, not a
Copilot CLI exporter switch. It commonly models:

```text
LLM
EMBEDDING
CHAIN
RETRIEVER
TOOL
AGENT
GUARDRAIL
```

Representative fields use prefixes such as `llm.*`, `tool.*`, `retriever.*`,
and `embedding.*`. OpenInference backends include Phoenix and Arize.

No Copilot-native `OPENINFERENCE_*` configuration variable was found. Native
Copilot telemetry remains `gen_ai.*` and Copilot-specific attributes.

## Implementation consequence

Use OpenInference only when instrumenting the surrounding application, MCP
server, or tool handlers. Do not relabel native Copilot spans as OpenInference
without a documented translation layer.

## Sources

- https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md
- https://arize.com/docs/phoenix/tracing/concepts-tracing/otel-openinference/semantic-conventions
- https://www.npmjs.com/package/@arizeai/openinference-genai
