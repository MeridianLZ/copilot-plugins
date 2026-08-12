# OTel Span and Conversation Audit

**Audit date:** 2026-08-11  
**Merged branch:** `feat/copilot-otel-replica`  
**Native-ingestion source merged:** `feat/copilot-otel-implementation`  
**Documentation corpus:** `local/fintech-marketplace-docs`, 25 documents, 769
sections, 470,754 indexed bytes, SHA-certified at `524c00c`.

## Executive finding

Native OTel ingestion was missing from the running branch because native
ingestion lived in a separate worktree. That workspace is now merged. The
merged implementation contains:

- native OTel traces, metrics, and logs ingestion;
- durable sanitized Collector JSONL files;
- `NativeOtelCache`;
- source coverage and correlation;
- MCP W3C carrier extraction and peer records;
- API routes for native OTel and coverage;
- forensic UI inspector and disposition cards.

Conversation replication still falls short because telemetry identity and
conversation identity are not yet carried through one shared projection. Native
transcript content is richer than hook content, but native IDs, OTel attributes,
OTel links, and most hook events are not rendered as inspectable conversation
metadata.

## Remediation status — 2026-08-12

The following review findings are now implemented and verified on the feature
branch, then merged into `development`:

| Finding | Remediation | Evidence |
|---|---|---|
| Native `turnId` / `messageId` / `toolCallId` joins incomplete | `ConversationIdentity` normalizes aliases; exact message/tool/turn/agent/trace-span keys precede FIFO/session fallback | `src/conversation-identity.ts`, `test/conversation-identity.test.ts`, `test/correlation.test.ts` |
| Native signal/model/usage/attributes/resource/scope metadata dropped | Full sanitized raw record/entity/resource/scope plus normalized identity survives parser, cache, coverage, correlation, and source detail API | `src/native-otel.ts`, `src/coverage.ts`, `test/native-otel.test.ts`, `test/correlation-api.test.ts` |
| OTel links absent from projection | Projected hook spans now carry links; source detail preserves native raw links; UI exposes link fields in normalized/raw evidence sections | `src/hook-span-contract.ts`, `src/trace-projector.ts`, `ui/index.html` |
| Native-first overlay hides most hook events | All 14 hook events overlay under selectable chronological governance groups | `src/conversation-projector.ts`, `test/conversation-projector.test.ts` |
| Native/hook status diverges | `reconcileTerminalStatus()` resolves error > recovered > ok > open and exposes conflict evidence | `src/terminal-status.ts`, `test/terminal-status.test.ts` |
| MCP stdio propagation lacks coverage | Real stdio subprocess succeeded with valid carrier; per-message transport wrapper and tests cover isolation | `src/transports/stdio-context.ts`, `test/stdio-propagation.test.ts`, `docs/otel-remediation/live-validation.md` |
| No proof every source field is accounted | `/telemetry-fields` walks every evidence leaf and requires disposition/UI target; live session recorded `2,235 / 2,235` | `src/coverage.ts`, `test/coverage.test.ts`, `docs/otel-remediation/live-validation.md` |

Fresh package gates after remediation: bridge **101/101**, MCP **23/23**,
typecheck and build pass. Live validation is recorded in
[`docs/otel-remediation/live-validation.md`](otel-remediation/live-validation.md).

## Documentation map

### Copilot implementation research

| Document | Role | Authority |
|---|---|---|
| `CHATGPT_github-copilot-cli-otel-hook-bridge/README.md` | Architecture and operating model | Primary Copilot bridge contract |
| `CHATGPT_github-copilot-cli-otel-hook-bridge/docs/attribute-link-contract.md` | Resource, span, GenAI, lifecycle, content, parent, link, dedupe contract | Primary attribute/link contract |
| `CHATGPT_github-copilot-cli-otel-hook-bridge/docs/hook-map.md` | Current hook inventory and failure semantics | Primary hook behavior map |
| `CHATGPT_github-copilot-cli-otel-hook-bridge/docs/state-of-the-art-research.md` | Architecture selection and SOTA rationale | Architectural rationale |
| `CHATGPT_github-copilot-cli-otel-hook-bridge/docs/claude-code-comparison.md` | Copilot versus Claude authority/correlation differences | Comparative reference |
| `CHATGPT_github-copilot-cli-otel-hook-bridge/VALIDATION.md` | Historical validation record | Historical; not current acceptance proof |
| `CHATGPT_github-copilot-cli-otel-hook-bridge/package.json` | Runtime/build metadata | Metadata only |
| `CHATGPT_github-copilot-cli-otel-hook-bridge/tsconfig.json` | Compiler contract | Metadata only |

### Claude/reference research

| Document | Role | Authority |
|---|---|---|
| `CHATGPT_claude-code-otel-hook-bridge/README.md` | Claude hook bridge reference | Comparison only |
| `CHATGPT_claude-code-otel-hook-bridge/docs/attribute-link-contract.md` | Claude attribute/link contract | Do not transfer Copilot IDs blindly |
| `CHATGPT_claude-code-otel-hook-bridge/docs/hook-map.md` | Claude event map | Comparison only |
| `CHATGPT_claude-code-otel-hook-bridge/jsonl-agentic-event-streaming-lifecycle-copilot-sdk-expanded.md` | Generic SDK event, persistence, replay, MCP, SSE model | Custom SDK guidance, not Copilot CLI ground truth |
| `CHATGPT_claude-code-otel-hook-bridge/package.json` | Reference package metadata | Metadata only |
| `CHATGPT_claude-code-otel-hook-bridge/tsconfig.json` | Reference compiler metadata | Metadata only |

### Executable tutorial

| Document | Role | Authority |
|---|---|---|
| `copilot-cli-hooks-otel-tutorial.md` | Earlier hook emitter, native OTel, OTLP, and transcript tutorial | Legacy prototype; conflicts with current hash-default contract and 14-event inventory |

### Corpus-level conclusions

Docmunch inventory found 15 research documents inside `docs/copilot-research`
and 10 additional repository documents indexed in the same corpus. Research
contains several explicit contradictions:

- legacy tutorial says 13 events; current local hook surface has 14;
- tutorial assumes full payload capture; current bridge defaults to hash mode;
- tutorial describes a prototype point/link model; current bridge has lifecycle
  duration spans plus point spans;
- native OTel is authoritative for model/execution/usage while native transcript
  is authoritative for verbatim conversation;
- Copilot hook payloads do not expose the same exact tool-call IDs as native
  GenAI spans.

Authoritative docmunch sections:

- `.../docs/attribute-link-contract.md::attribute-and-link-contract/common-point-span-attributes#2`
- `.../docs/attribute-link-contract.md::attribute-and-link-contract/lifecycle-attributes#2`
- `.../docs/attribute-link-contract.md::attribute-and-link-contract/standard-genai-attributes-used-by-the-bridge#2`
- `.../docs/attribute-link-contract.md::attribute-and-link-contract/parent-selection-rules#2`
- `.../docs/attribute-link-contract.md::attribute-and-link-contract/link-rules#2`
- `.../docs/hook-map.md::github-copilot-cli-hook-opentelemetry-map/complete-current-event-inventory#2`
- `.../docs/state-of-the-art-research.md::state-of-the-art-research-github-copilot-cli-hooks-and-opentelemetry/three-current-architectural-approaches/approach-3-dual-lane-selected#3`
- `.../copilot-cli-hooks-otel-tutorial.md::mapping-opentelemetry-traces-to-every-github-copilot-cli-hook/8-native-cli-otel-in-parallel-the-other-half-of-the-verbatim-transcript#2`

## Hook-lane span inventory

### Lifecycle spans

| Span name | Open event | Close event | Conversation analog | Current UI |
|---|---|---|---|---|
| `github.copilot.hook.session` | `sessionStart` | `sessionEnd` | Session shell | Header, sidebar, waterfall |
| `github.copilot.hook.turn` | `userPromptSubmitted` | `agentStop` | User exchange / turn | Turn header, waterfall |
| `github.copilot.hook.tool` | `preToolUse` | `postToolUse` or `postToolUseFailure` | Tool execution | Tool card, waterfall |
| `github.copilot.hook.subagent` | `subagentStart` | `subagentStop` | Nested agent execution | Subagent card, child-session button, waterfall |

Lifecycle closure attributes:

```text
github.copilot.hook.lifecycle.end_event
github.copilot.hook.lifecycle.recovered_end
github.copilot.hook.lifecycle.recovered_reason
```

Recovered spans close with `ERROR`, but recovery reason is not yet exposed in
the trace inspector.

### Point spans

Every accepted local event emits:

```text
github.copilot.hook.agentStop
github.copilot.hook.errorOccurred
github.copilot.hook.notification
github.copilot.hook.permissionRequest
github.copilot.hook.postToolUse
github.copilot.hook.postToolUseFailure
github.copilot.hook.preCompact
github.copilot.hook.preToolUse
github.copilot.hook.sessionEnd
github.copilot.hook.sessionStart
github.copilot.hook.subagentStart
github.copilot.hook.subagentStop
github.copilot.hook.userPromptSubmitted
github.copilot.hook.userPromptTransformed
```

Point-span status:

| Event | Status | Exception |
|---|---|---|
| `postToolUseFailure` | `ERROR` | Error message when present |
| `errorOccurred` | `ERROR` | Error message when present |
| `postToolUse`, `agentStop`, `subagentStop`, `sessionEnd` | `OK` | None |
| Other events | Unset | None |

Known inconsistency: point `sessionEnd` is always `OK`, while lifecycle
`sessionEnd` can be `ERROR` when reason is not `complete` or `user_exit`.

## Hook span attributes

### Always present

```text
github.copilot.hook.event.name
github.copilot.hook.event.id
github.copilot.hook.source
github.copilot.hook.payload_format
github.copilot.hook.schema_version
github.copilot.hook.observed_at_unix_ms
github.copilot.session.id
gen_ai.conversation.id
```

### Optional canonical mappings

| Span attribute | Payload field | Conversation analog | UI state |
|---|---|---|---|
| `github.copilot.cwd` | `cwd` | Working directory | Header |
| `github.copilot.session.source` | `source` | Session source | Not explicit |
| `github.copilot.session.end_reason` | `reason` | Session terminal reason | Partially in status |
| `gen_ai.tool.name` | `tool_name` | Tool title | Tool card |
| `github.copilot.transcript.path` | `transcript_path` | Transcript source | Unaccounted |
| `github.copilot.stop.reason` | `stop_reason` | Turn completion reason | Hooks-only event content |
| `gen_ai.agent.id` | `agent_id` | Agent identity | Partially in subagent content |
| `github.copilot.agent.type` | `agent_type` | Agent type | Not explicit |
| `gen_ai.agent.name` | `agent_name` | Subagent title | Subagent card |
| `gen_ai.agent.display_name` | `agent_display_name` | Display title | Subagent card |
| `github.copilot.error.context` | `error_context` | Error context | Not explicit |
| `github.copilot.compaction.trigger` | `trigger` | Context compacted event | Notice |
| `github.copilot.notification.type` | `notification_type` | Notification | Notice |
| `error.type` | `error_type` | Error type | Error content only |
| `github.copilot.error.recoverable` | `recoverable` | Recoverability | Not explicit |
| `github.copilot.stop_hook_active` | `stop_hook_active` | Stop-hook state | Unaccounted |
| `github.copilot.tool.result_type` | `tool_result.resultType` | Tool result status | Partially in tool card |

### Lifecycle-only attributes

```text
github.copilot.hook.lifecycle.kind
github.copilot.hook.lifecycle.correlation_key
github.copilot.hook.lifecycle.start_event
github.copilot.hook.lifecycle.end_event
github.copilot.hook.lifecycle.recovered_end
github.copilot.hook.lifecycle.recovered_reason
```

### Tool and subagent attributes

```text
gen_ai.operation.name=execute_tool
gen_ai.tool.name
gen_ai.tool.type=function
github.copilot.hook.correlation.limit=no_tool_call_id_in_hook_payload

gen_ai.operation.name=invoke_agent
gen_ai.agent.name
gen_ai.agent.id
github.copilot.hook.correlation.limit=subagent_start_has_no_agent_id
```

### Dynamic attributes

`github.copilot.hook.payload.*` is flattened from sanitized payload data:

- max depth: 4;
- max attributes: 96;
- max value: 16,384 bytes;
- complex values become `.json`;
- content keys are hash/off/full according to policy.

Dynamic attributes are not rendered as a complete attribute table. Known event
renderers can hide extra payload fields when a mapped body already exists.

## Native OTel record inventory

`NativeOtelRecord` can contain:

```text
record_id
source_file
line_number
signal
observed_at_unix_ms
trace_id
span_id
parent_span_id
session_id
turn_id
tool_call_id
model
usage
attributes
resource
instrumentation_scope
content_disposition
validity
source_hash
```

Signal normalization:

| Signal | Normalized values |
|---|---|
| Trace | span name, span kind, trace/span/parent IDs, model, usage, attributes |
| Metric | metric name, unit, type, value, resource/scope |
| Log | body, severity text, trace/span IDs, resource/scope |
| Invalid line | source hash, source location, invalidity reason |
| Truncation/rewrite | reset record and source metadata |

Native OTel records reach:

```text
Copilot native exporter
  -> local OTLP Collector
  -> traces.jsonl / metrics.jsonl / logs.jsonl
  -> NativeOtelCache
  -> /api/sessions/:id/native-otel
  -> source coverage
```

### Native OTel fields currently dropped from correlation records

`coverage.ts` currently reduces native records to identity fields. It drops:

```text
signal
parent_span_id
model
usage
attributes
resource
instrumentation_scope
validity
content_disposition
source_file
line_number
source_hash
```

This is the largest direct reason native GenAI detail does not appear in the UI.

## MCP propagation and links

Carrier fields:

```text
traceparent
tracestate
baggage
```

MCP peer records:

```text
type=mcp.peer_link
server
tool_name
status
trace_id
span_id
session_id
peer_request_id
peer_transport
```

Supported transports:

- HTTP: extracts JSON-RPC `params._meta`;
- WebSocket: extracts per JSON-RPC frame;
- stdio: no production carrier extraction.

The bridge span links use these reasons:

| Link reason | Heuristic | Intended analog | Current UI |
|---|---:|---|---|
| `native_traceparent` | No | Native/outer trace context | Not shown |
| `fifo_tool_name_match` | Yes | Tool lifecycle pairing | Generic FIFO badge only |
| `fifo_agent_name_match` | Yes | Subagent lifecycle pairing | Generic heuristic state |
| `sole_open_tool` | Yes | Permission-to-tool association | Not shown |
| `last_completed_turn` | No | Late event attachment | Not shown |

Links are not carried into `ProjectedSpan`, `ConversationNode`, or the
inspector. Link targets are therefore unclickable and cannot explain why a
conversation node was attached.

## Conversation/UI mapping

| Source fact | Conversation field | UI element | Current state |
|---|---|---|---|
| Native user message | `ConversationContent(role=user)` | User bubble | Rendered |
| Native assistant message | `ConversationContent(role=agent)` | Assistant bubble | Rendered |
| Native reasoning | content or `reasoning_encrypted` | Reasoning disclosure | Rendered |
| Native model | node/document `model` | Model chip/footer | Rendered |
| Native usage | document `usage` | Usage footer | Rendered |
| Native tool args/result | tool content JSON | Tool card | Rendered |
| Native permission | event node/status | Permission row | Rendered |
| Native subagent | subagent node/child session | Nested card/link | Partially rendered |
| Hook event | event node or overlay | Event line | Native-first hides most events |
| Hook span | `spans` / lifecycle shell | Waterfall | Identity not inspectable |
| Native OTel record | coverage source record | Coverage table | Rich attributes absent |
| OTel link | no conversation field | No UI element | Unaccounted |
| MCP peer link | coverage/MCP record | Lineage section | Partial |
| Redaction metadata | content marker | Redaction chip | Partial |
| Invalid/late/unmatched | coverage gap node | Disposition card | Rendered |

Live conversation refresh now follows all `/conversation` cursors. Export and
live render therefore no longer silently stop at the first 100 events.

## Unaccounted audit

### Critical

1. **Native ID join incomplete**
   - `turnId` is parsed but not used as projected parent identity.
   - `messageId` is not joined to hook events or OTel records.
   - `toolCallId` is not joined to native tool nodes, hook tool spans, and OTel
     spans as one canonical object.
   - `agent_id` and child session identity are only partially joined.

2. **Native OTel metadata discarded before UI**
   - Signal, model, usage, attributes, resources, scope, parent span, status,
     events, links, validity, and redaction metadata are absent from coverage
     rows.

3. **Native-first overlay hides hook truth**
   - Only `errorOccurred`, `preCompact`, `notification`, and
     `postToolUseFailure` are overlaid.
   - Other hook events remain in the API ledger but disappear from the rendered
     native conversation.

4. **Links have no conversation/UI representation**
   - Link reasons and target contexts are emitted but not projected.

### High

1. Native root status closes on native `session.shutdown`, not hook
   `sessionEnd`.
2. Unrecognized native event types are silently ignored.
3. Model-change details retain only the new model.
4. Native subagent completion result/response content is not rendered.
5. `parent_span_id` is normalized but not used for graph reconstruction.
6. `redacted` appears in UI accounting vocabulary but is not currently produced
   by `correlateSources`.
7. Native OTel records without `session_id` cannot be attached to a session.
8. Point `sessionEnd` status can disagree with lifecycle `sessionEnd` status.
9. stdio MCP transport does not propagate OTel carrier context.
10. `injectCarrier()` is unit-tested but lacks a verified production caller in
    the MCP path.

### Medium

1. Event IDs, trace IDs, span IDs, turn IDs, tool-call IDs, request IDs, and
   parent IDs are not consistently visible in UI.
2. Flattened payload attributes are not available through a searchable
   attribute inspector.
3. Transcript path is emitted but not mapped to a source record UI action.
4. Error context, recoverability, stop-hook state, correlation limits, and
   recovery reasons lack dedicated UI fields.
5. Native OTel span status, events, links, metric exemplars, and log severity
   number are not first-class normalized fields.
6. Coverage rows expose identity and disposition but not source line/hash
   lineage in the inspector.

## Replication blocker order

1. Preserve every source record in one canonical timeline, including all native
   event IDs and all hook events.
2. Add a canonical identity object:
   `sessionId`, `turnId`, `messageId`, `toolCallId`, `agentId`, `traceId`,
   `spanId`, `parentSpanId`, `eventId`.
3. Carry full sanitized NativeOtelRecord metadata into coverage and UI.
4. Carry OTel links into projected spans and conversation nodes.
5. Overlay all hook events without suppressing native transcript content.
6. Close native and hook session status through one terminal-state reducer.
7. Render an inspectable attribute/link panel for every selected conversation
   node and source record.
8. Add tests asserting every emitted field has one of:
   `rendered`, `represented`, `redacted`, `unavailable`, `unmatched`,
   `heuristic`, `deduplicated`, `invalid`, or `late_out_of_order`.
