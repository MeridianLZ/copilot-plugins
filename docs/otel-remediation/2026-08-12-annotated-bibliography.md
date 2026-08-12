# Copilot Telemetry Replication: Annotated Bibliography

**Research date:** 2026-08-12  
**Purpose:** Support same-day remediation of incomplete Copilot conversation
replication and complete display/accounting of every sanitized telemetry field.

## Executive findings

1. Existing ingestion is usable. Main failure is lossy reduction between native
   OTel normalization, coverage/correlation, conversation projection, and UI.
2. Native transcript remains chronological/verbatim authority. Native OTel
   remains execution, identity, model, usage, timing, resource, scope, event,
   link, and status authority. Hooks remain governance/lifecycle authority.
3. Complete support cannot be a fixed allow-list of known GenAI attributes.
   Full sanitized OTLP entities must be preserved, including unknown future
   fields, while normalized indexes provide search and joins.
4. OTLP traces require more than `traceId`, `spanId`, and attributes. Lossless
   handling includes resource and scope containers/schema URLs, span intrinsics,
   events, links, status, trace state, flags, and all dropped counts.
5. OpenTelemetry GenAI conventions moved into a dedicated repository. Existing
   GenAI names in the core semantic-conventions registry are deprecated
   migration entries. Compatibility must therefore preserve raw fields rather
   than rewrite or discard unfamiliar names.
6. GitHub Copilot CLI supports native OTel configuration and content capture.
   `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` is required for
   requested local forensic capture and increases privacy risk.
7. MCP stdio is newline-delimited JSON-RPC. Trace context is not a standard
   stdio header, so propagation must use validated JSON-RPC `params._meta`
   carrier data and remain per request.
8. State-of-the-art trace UIs separate readable timelines from complete
   evidence inspection. Span intrinsics, span/resource/event/link attributes,
   raw records, search, and link targets should be distinct inspector surfaces.

## Research retrieval and evidence method

Research combined:

- CodeMunch semantic repository retrieval for source symbols and call seams.
- DocMunch retrieval across `docs/copilot-research`.
- Context7 retrieval for current OpenTelemetry specification content.
- Official GitHub code search for Copilot, SDK, VS Code, OTel, and MCP source.
- Direct web retrieval of official specifications and product documentation.

The indexed research corpus was resolved as
`local/fintech-marketplace-docs`: 25 documents, 769 sections, and indexed SHA
`524c00c19da6eae994736ee953e5ef052c86e9e1`. Retrieval date for this inventory:
2026-08-12.

## Repository evidence

### [Current OTel Span and Conversation Audit](../otel-span-conversation-audit.md)

**Authority:** Repository audit, grounded in CodeMunch and DocMunch retrieval.  
**Finding:** Records current hook span inventory, native OTel fields,
conversation/UI mappings, and unaccounted findings. Critical findings are
incomplete native ID joins, native metadata reduction, hidden hook events,
missing link projection, and divergent terminal status.

### [Current OTel Span, Source, and Conversation Map](../otel-conversation-span-map.md)

**Authority:** Repository architecture map.  
**Finding:** Shows hook, transcript, native OTel, and MCP lanes through
ingestion, correlation, conversation projection, and UI. Every unmatched source
must remain visible rather than being silently folded into a node.

### [Research Vector Index](../research-vectors/README.md)

**Authority:** Repository research index.  
**Finding:** Links 12 durable research vectors covering hooks, native OTel,
Copilot SDK telemetry, GenAI conventions, OpenInference, VS Code Agent Host,
configuration precedence, MCP propagation, UI replication, exemplars, privacy,
and repository gaps.

### [Original Copilot Research Corpus](../copilot-research/)

**Authority:** Frozen historical research corpus.  
**Finding:** Contains bridge contracts, attribute/link maps, hook maps,
tutorials, comparisons, and executable references. Historical contradictions
are documented in the current audit; current source and official specifications
override stale tutorial assumptions.

### CodeMunch indexed repository

**Authority:** CodeMunch repository index `zautke/fintech-marketplace`.  
**Finding:** 3,960 symbols across 185 files. Decisive source findings:

- `copilot-otel-bridge/src/types.ts` defines `NativeOtelRecord` with signal,
  trace/span/parent IDs, session/turn/tool IDs, model, usage, attributes,
  resource, instrumentation scope, redaction, validity, and source lineage.
- `copilot-otel-bridge/src/coverage.ts::buildNativeOtelRecords` reduces those
  records to time plus session/trace/span/turn/tool identity, dropping rich
  metadata before correlation/UI.
- `copilot-otel-bridge/src/trace-projector.ts::ProjectedSpan` lacks trace ID,
  parent span ID, attributes, events, links, and source references.
- `copilot-otel-bridge/src/conversation-projector.ts::projectNativeFirst`
  overlays only `errorOccurred`, `preCompact`, `notification`, and
  `postToolUseFailure`.
- `copilot-mcp/src/transports/stdio.ts` calls `buildServer({ bridge, timer })`
  without per-request carrier extraction, unlike HTTP and WebSocket paths.

## OpenTelemetry normative sources

### [OpenTelemetry Protocol Specification 1.11.0](https://opentelemetry.io/docs/specs/otlp/)

**Authority:** Normative OpenTelemetry protocol specification.  
**Stability:** Traces, metrics, and logs stable; profiles development.  
**Finding:** Defines OTLP encoding, HTTP/gRPC transport, success, partial
success, failure, and delivery behavior. Preserve all three stable signals and
surface invalid/partial records explicitly.

### [OpenTelemetry Tracing API](https://opentelemetry.io/docs/specs/otel/trace/api/)

**Authority:** Normative OpenTelemetry tracing API.  
**Stability:** Stable except marked sections.  
**Finding:** Defines `SpanContext`, trace/span IDs, trace flags, trace state,
remote context, instrumentation scope identity, span timing, attributes,
events, links, and status. Conversation identity cannot replace trace identity.

### [OpenTelemetry OTLP Trace Protobuf v1.11.0](https://github.com/open-telemetry/opentelemetry-proto/blob/v1.11.0/opentelemetry/proto/trace/v1/trace.proto)

**Authority:** Versioned wire schema.  
**Finding:** Canonical field inventory for lossless trace ingestion:
`trace_id`, `span_id`, `trace_state`, `parent_span_id`, `flags`, `name`, `kind`,
start/end timestamps, attributes, dropped attribute count, events and dropped
event count, links and dropped link count, and status. Links also carry trace
and span IDs, trace state, attributes, dropped attribute count, and flags.

### [OTLP Trace Data Format OTEP 59](https://github.com/open-telemetry/opentelemetry-specification/blob/main/oteps/trace/0059-otlp-trace-data-format.md)

**Authority:** OpenTelemetry design specification.  
**Finding:** Documents the complete span, event, link, status, and resource
model. Dropped counts are evidence of loss and must remain inspectable.

### [Telemetry Schemas OTEP 152](https://github.com/open-telemetry/opentelemetry-specification/blob/main/oteps/0152-telemetry-schemas.md)

**Authority:** OpenTelemetry schema evolution specification.  
**Finding:** Adds resource-level and scope-level schema URLs. Store both URLs so
future interpretation does not require guessing convention versions.

### [Instrumentation Scope Attributes OTEP 201](https://github.com/open-telemetry/opentelemetry-specification/blob/main/oteps/0201-scope-attributes.md)

**Authority:** OpenTelemetry scope specification.  
**Finding:** Instrumentation scope includes name, version, attributes, and
dropped attribute count. Preserve the complete scope container, not only a
flattened map.

### [OpenTelemetry Log Data Model](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/logs/data-model.md)

**Authority:** Normative OpenTelemetry logs specification.  
**Finding:** Logs correlate by time, trace/span IDs, and resource. Logs remain
first-class evidence even though conversation display is span-centric.

### [OpenTelemetry Collector Overview](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/overview.md#collector)

**Authority:** OpenTelemetry architecture specification.  
**Finding:** Collector can enrich, transform, aggregate, sample, and scrub
personal information. Local collector use is valid, but application-side
sanitization remains mandatory before UI/API exposure.

### [OpenTelemetry Trace API: child spans versus events](https://opentelemetry.io/docs/specs/otel/trace/api/#span)

**Authority:** OpenTelemetry tracing API guidance.  
**Finding:** Child spans are preferred when sub-operations need detailed timing
and attributes; events remain appropriate for point-in-time annotations. The UI
must preserve both rather than flattening events into span attributes.

## OpenTelemetry GenAI sources

### [OpenTelemetry GenAI Semantic Conventions Repository](https://github.com/open-telemetry/semantic-conventions-genai)

**Authority:** Current official GenAI semantic-conventions home.  
**Finding:** GenAI spans, metrics, events, provider conventions, and MCP
conventions moved here from core semantic conventions. Preserve observed schema
and unknown fields during rapid convention evolution.

### [OpenTelemetry GenAI Execute Tool Span Support Report](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/reference/reports/execute-tool-span.md)

**Authority:** Official GenAI compatibility report.  
**Finding:** Confirms broad ecosystem use of `gen_ai.tool.call.id`,
`gen_ai.tool.name`, `gen_ai.tool.description`, and tool call
arguments/results. `tool_call_id` must be a first-class exact join key.

### [OpenTelemetry GenAI Attribute Registry Migration Notice](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/registry/attributes/gen-ai.md)

**Authority:** Official core semantic-conventions registry.  
**Finding:** Entries including `gen_ai.agent.id`, `gen_ai.agent.name`, and
`gen_ai.conversation.id` are deprecated because they moved to the dedicated
GenAI repository. “Deprecated” means moved, not discard emitted values.

### [OpenTelemetry GenAI Conversation ID Enhancement](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/changelog.d/410.enhancement.md)

**Authority:** Official GenAI convention changelog.  
**Finding:** Allows `gen_ai.conversation.id` on invoke-workflow spans when
available. Index conversation IDs, but do not overwrite native session identity
when values conflict.

### [OpenTelemetry Complex Attribute Values OTEP 4485](https://github.com/open-telemetry/opentelemetry-specification/blob/main/oteps/4485-extending-attributes-to-support-complex-values.md)

**Authority:** OpenTelemetry specification proposal.  
**Finding:** Uses GenAI prompts/completions as a motivating case for complex
attributes. Generic JSON preservation is safer than scalar-only coercion.

### [OpenTelemetry GenAI Events](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/docs)

**Authority:** Official generated GenAI documentation set.  
**Finding:** GenAI content and message representations are evolving. Preserve
event names and payloads after redaction; do not assume one stable attribute
shape.

## GitHub Copilot telemetry sources

### [GitHub Copilot CLI Command Reference: OpenTelemetry](https://github.com/github/docs/blob/1d8dc3817bb74ef04d3ac2d5d49a2716dcc53ff9/content/copilot/reference/copilot-cli-reference/cli-command-reference.md)

**Authority:** Official GitHub documentation source.  
**Finding:** Documents `COPILOT_OTEL_ENABLED`,
`OTEL_EXPORTER_OTLP_ENDPOINT`, `COPILOT_OTEL_EXPORTER_TYPE=otlp-http|file`,
`OTEL_EXPORTER_OTLP_PROTOCOL=http/json|http/protobuf`, per-signal protocol
overrides, file exporter path, and source name. Endpoint presence can enable
OTel without the explicit enabled flag.

### [GitHub Copilot CLI Hooks Reference](https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-cli/using-hooks)

**Authority:** Official GitHub Copilot CLI hooks documentation.  
**Finding:** Hooks receive JSON payloads and environment context; hook exit
status is the control channel, with non-zero `preToolUse` able to deny. Hooks
are governance/control evidence, not a reliable source of main-agent prose.

### [GitHub Copilot SDK Node Telemetry Configuration](https://github.com/github/copilot-sdk/blob/a6d3ed1c844b39fad52af345b0ca401611becfbf/nodejs/src/types.ts)

**Authority:** Official GitHub Copilot SDK source at commit
`a6d3ed1c844b39fad52af345b0ca401611becfbf`.  
**Finding:** `TelemetryConfig` exposes endpoint, protocol, file path, exporter
type, source name, and content capture.

### [GitHub Copilot SDK Node Telemetry Environment Injection](https://github.com/github/copilot-sdk/blob/a6d3ed1c844b39fad52af345b0ca401611becfbf/nodejs/src/client.ts)

**Authority:** Official SDK implementation.  
**Finding:** SDK sets `COPILOT_OTEL_ENABLED=true`, maps telemetry fields to
environment variables, and maps `captureContent` to
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`.

### [GitHub Copilot SDK Node README](https://github.com/github/copilot-sdk/blob/a6d3ed1c844b39fad52af345b0ca401611becfbf/nodejs/README.md)

**Authority:** Official SDK documentation.  
**Finding:** Confirms SDK-owned CLI process lifecycle and telemetry configuration
surface. The CLI owns exporter behavior; SDK injects process environment.

### [GitHub Copilot SDK Go telemetry types](https://github.com/github/copilot-sdk/blob/8690695f2c52200bd006df5749db1a2f571e65db/go/types.go)

**Authority:** Official SDK source.  
**Finding:** Go `TelemetryConfig` mirrors exporter type, file path, source name,
and environment mapping. Cross-language SDKs converge on the same CLI variables.

### [GitHub Copilot SDK Rust telemetry configuration](https://github.com/github/copilot-sdk/blob/cafa3c59689c77f0fdd4169e042b29d26d159b5e/rust/src/lib.rs)

**Authority:** Official SDK source.  
**Finding:** Rust client documents the same environment mapping and enables
`COPILOT_OTEL_ENABLED=true` when telemetry is configured.

### [VS Code Copilot Agent Monitoring Architecture](https://github.com/microsoft/vscode/blob/661f18fdeb7861d25e79df68b32af3a681eff7b2/extensions/copilot/docs/monitoring/agent_monitoring_arch.md)

**Authority:** Microsoft VS Code source documentation at commit
`661f18fdeb7861d25e79df68b32af3a681eff7b2`.  
**Finding:** Maps agent monitoring configuration to Copilot CLI variables,
states CLI runtime OTLP is HTTP-oriented, maps content capture to
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`, and notes standard
resource/service/header variables flow through inherited environment.

### [VS Code Agent Host OpenTelemetry Configuration](https://github.com/microsoft/vscode/blob/661f18fdeb7861d25e79df68b32af3a681eff7b2/src/vs/platform/agentHost/OTEL.md)

**Authority:** Microsoft VS Code Agent Host documentation.  
**Finding:** Documents pass-through and host-owned telemetry paths,
environment precedence, exporter types, endpoint aliases, protocol mapping,
resource/service/header settings, and host-specific DB span export. These
settings are not proof that ordinary Copilot CLI `settings.json` accepts the
same keys.

### [VS Code Copilot Agent OTel Environment Mapping](https://github.com/microsoft/vscode/blob/661f18fdeb7861d25e79df68b32af3a681eff7b2/extensions/copilot/src/platform/otel/common/agentOTelEnv.ts)

**Authority:** Microsoft implementation source.  
**Finding:** Explicitly forwards CLI variables and states Copilot CLI runtime
supports OTLP HTTP rather than assuming gRPC.

### [VS Code Enterprise AI Telemetry Managed Settings](https://github.com/microsoft/vscode-docs/blob/95cc3b3b226823b70306b8b6ef118def6f3c1842/docs/enterprise/ai-settings.md)

**Authority:** Microsoft enterprise documentation.  
**Finding:** Defines `telemetry.captureContent`,
`telemetry.lockCaptureContent`, service name, resource attributes, endpoint,
protocol, and headers for managed VS Code agent telemetry. This is a separate
enterprise surface from local Copilot CLI environment configuration.

## MCP and distributed trace propagation sources

### [Model Context Protocol 2025-06-18 Transports Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

**Authority:** Official MCP specification.  
**Finding:** Standard transports are stdio and Streamable HTTP. stdio uses
UTF-8 newline-delimited JSON-RPC, stdout must contain only protocol messages,
and diagnostics belong on stderr. No transport header exists for stdio.

### [Model Context Protocol documentation index](https://modelcontextprotocol.io/llms.txt)

**Authority:** Official MCP documentation index.  
**Finding:** Current MCP pages are discoverable through the generated index;
implementation should pin the specific revision used by each test.

### [W3C Trace Context Recommendation](https://www.w3.org/TR/trace-context/)

**Authority:** W3C Recommendation.  
**Finding:** Defines interoperable `traceparent` and `tracestate`, mutation,
privacy, and security rules. Invalid values must not create trusted parent
context.

### [MCP TypeScript SDK Tool Callback and Server Context](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/mcp.ts)

**Authority:** Official MCP TypeScript SDK source at commit
`cc4b41617ce3601b1290d67216ea0b194a3cd9ac`.  
**Finding:** `ToolCallback` includes `ServerContext`. First prove raw request
`_meta` is available there; if not, use a bounded stdio JSON-RPC transform.

### [MCP TypeScript SDK v2 migration notes](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/docs/migration/upgrade-to-v2.md)

**Authority:** Official MCP SDK migration source.  
**Finding:** Confirms current v2 callback/context naming and `serveStdio`
surface. Avoid relying on retired monolithic package APIs.

### [MCP transport security guidance](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http)

**Authority:** Official MCP transport specification.  
**Finding:** Local HTTP servers should bind loopback, validate `Origin`, and
authenticate non-local connections. The remediation remains loopback-only.

## Trace and conversation UI sources

### [Grafana Tempo Trace Structure](https://grafana.com/docs/tempo/latest/introduction/trace-structure/)

**Authority:** Official Grafana Tempo documentation.  
**Finding:** Separates span intrinsics from span, resource, event, and link
attributes. This directly supports distinct inspector sections.

### [Jaeger Frontend UI Configuration and Link Patterns](https://www.jaegertracing.io/docs/2.9/deployment/frontend-ui/)

**Authority:** Official Jaeger documentation.  
**Finding:** Supports configurable links from process, tags, logs, and traces
using trace-aware templates. Local evidence links should be clickable when
targets exist, while missing targets remain explicit.

### [SigNoz trace explorer documentation](https://signoz.io/docs/traces-management/trace-explorer/)

**Authority:** Third-party product documentation.  
**Finding:** This exact URL returned 404 during the 2026-08-12 fetch. It is
retained as a negative-search record only; no implementation claim depends on
it. Use the [SigNoz documentation home](https://signoz.io/docs/) for current
navigation.

### [Arize Phoenix documentation](https://arize.com/docs/phoenix)

**Authority:** Arize Phoenix documentation home.  
**Finding:** Relevant ecosystem reference for LLM trace inspection and
OpenInference, but the selected deep-link returned 404 during retrieval.

### [Langfuse observability documentation](https://langfuse.com/docs)

**Authority:** Langfuse documentation home.  
**Finding:** Relevant ecosystem reference for trace/session/conversation
inspection; the selected deep-link returned 404 during retrieval.

### [OpenInference project](https://github.com/Arize-ai/openinference)

**Authority:** OpenInference project repository.  
**Finding:** OpenInference is a semantic/instrumentation ecosystem layered over
OTel, not a native Copilot CLI configuration surface. Preserve native OTel
fields and optionally map OpenInference names as aliases.

### [OpenLLMetry instrumentation project](https://github.com/traceloop/openllmetry)

**Authority:** Open-source OTel GenAI instrumentation project.  
**Finding:** Ecosystem exemplar for GenAI spans and content/usage capture.
Useful for comparison, not a Copilot runtime dependency.

### [Copilot Session Explorer](https://github.com/mitsha-microsoft/copilot-session-explorer)

**Authority:** Open-source Copilot transcript exploration exemplar.  
**Finding:** Prior art for reading native Copilot session-state data. Supports
the decision to keep native transcript as verbatim conversation authority.

## Configuration, privacy, and content-capture sources

### [OpenTelemetry data protection guidance](https://opentelemetry.io/docs/security/)

**Authority:** OpenTelemetry security documentation.  
**Finding:** Telemetry can contain sensitive data; local forensic content
capture requires explicit handling, redaction, bounded retention, and no
credential-bearing exporter configuration.

### [OpenTelemetry Collector transform processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor)

**Authority:** Official Collector Contrib source.  
**Finding:** Collector transforms can redact or enrich telemetry, but bridge
sanitization must still occur before API/UI exposure because local files and
application memory are also sensitive surfaces.

### [OpenTelemetry GenAI privacy guidance](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/docs)

**Authority:** Official GenAI conventions documentation set.  
**Finding:** Content capture is optional and privacy-sensitive. The local
forensic profile intentionally enables it, while production defaults should
remain restricted.

## Internal research documents

Each document below is an independent durable research vector already copied
under `docs/research-vectors/`. These are active repository links, not external
claims:

- [Copilot CLI hooks](../research-vectors/01-copilot-cli-hooks.md)
- [Native Copilot OTel](../research-vectors/02-native-copilot-otel.md)
- [Copilot SDK telemetry](../research-vectors/03-copilot-sdk-telemetry.md)
- [OTel GenAI semantic conventions](../research-vectors/04-otel-genai-semconv.md)
- [OpenInference](../research-vectors/05-openinference.md)
- [VS Code Agent Host OTel](../research-vectors/06-vscode-agent-host-otel.md)
- [Copilot configuration and precedence](../research-vectors/07-copilot-config-and-precedence.md)
- [MCP OTel propagation](../research-vectors/08-mcp-otel-propagation.md)
- [Conversation replication UI](../research-vectors/09-conversation-replication-ui.md)
- [Ecosystem exemplars](../research-vectors/10-ecosystem-exemplars.md)
- [Telemetry privacy and redaction](../research-vectors/11-telemetry-privacy-and-redaction.md)
- [Repository audit gaps](../research-vectors/12-repository-audit-gaps.md)

## Negative and inconclusive searches

### GitHub Copilot CLI repository searches

Searches scoped to `github/copilot-cli` for
`COPILOT_OTEL_ENABLED` and
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` returned no indexed code
results. This is not evidence that support is absent; official GitHub docs,
Copilot SDK source, and VS Code integration source provide positive evidence.

### OpenTelemetry protobuf search

A combined `ResourceSpans ScopeSpans Span` code search returned no result.
The versioned protobuf file and Context7 specification retrieval provide the
authoritative field inventory instead.

### MCP stdio traceparent search

Repository searches found no standard MCP stdio `traceparent` mechanism. The
MCP transport specification defines JSON-RPC framing, not trace headers.
`params._meta` propagation is therefore an implementation convention requiring
tests, not a normative MCP guarantee.

### Selected UI deep-links

The selected SigNoz, Phoenix, and Langfuse deep-links returned 404 during the
retrieval pass. Their documentation home links remain active above. No plan
decision depends on unavailable deep-links.

## Research-to-plan decisions

| Finding | Plan consequence |
|---|---|
| Rich native metadata is dropped in `coverage.ts` | Preserve one full sanitized evidence object and carry references through correlation |
| OTLP includes resources, scope, events, links, schema URLs, flags, status, and dropped counts | Add container-aware lossless fixtures and generic detail API |
| GenAI conventions move quickly | Preserve unknown fields and schema metadata; normalize without destructive rewriting |
| Native transcript and OTel have different authority | Keep native-first readable timeline and attach OTel evidence rather than replacing transcript |
| Only four hooks overlay in native-first projection | Overlay all 14 hooks under selectable governance grouping |
| Emission and projection duplicate span rules | Extract shared pure hook-span contract |
| Native and hook terminal state can disagree | Add one reducer with conflict evidence |
| stdio has no header carrier | Prove callback context `_meta`; use bounded JSON-RPC transform only if needed |
| Complete evidence can be large | Keep paginated summaries; lazy-load full detail on selection |
| Generic trace UIs separate attribute classes | Inspector sections for identity, intrinsics, attributes, resource, scope, events, links, status, raw, lineage, and accounting |

## Confidence

**Overall implementation confidence:** 93%.

High-confidence work uses existing parser, cache, pagination, ETag, projection,
and inspector seams. Primary uncertainty is whether installed MCP SDK exposes
raw stdio request metadata in `ServerContext`. The plan resolves this first
with a proof test and defines a contained fallback that preserves standard
JSON-RPC wire shape.
