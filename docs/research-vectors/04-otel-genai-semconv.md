# Research Vector: OTel GenAI Semantic Conventions

**Collected:** 2026-08-01 to 2026-08-12  
**Confidence:** High for operation names and core fields; convention status
remains development-oriented.

## Findings

Current GenAI trace shape centers on:

```text
invoke_agent
chat
execute_tool
```

Common fields include:

```text
gen_ai.conversation.id
gen_ai.request.model
gen_ai.usage.input_tokens
gen_ai.usage.output_tokens
gen_ai.response.finish_reasons
gen_ai.tool.name
gen_ai.tool.call.id
gen_ai.input.messages
gen_ai.output.messages
gen_ai.system_instructions
```

Message and tool content are sensitive and must be explicitly enabled. Tool
arguments/results may require exact attribute selection in some collector or
instrumentation configurations.

## Implementation consequence

The UI must show operation name, model, usage, finish reason, tool-call ID,
parent span, content disposition, and source lane per conversation node. It
must distinguish native provider spans from reconstructed hook spans.

## Sources

- https://opentelemetry.io/docs/specs/semconv/gen-ai/
- https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- https://github.com/open-telemetry/opentelemetry.io/blob/main/content/en/blog/2026/genai-observability/index.md
- `docs/copilot-research/CHATGPT_github-copilot-cli-otel-hook-bridge/docs/attribute-link-contract.md`
