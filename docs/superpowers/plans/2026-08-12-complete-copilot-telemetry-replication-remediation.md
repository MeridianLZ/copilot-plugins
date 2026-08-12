# Complete Copilot Telemetry Replication Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to execute independent tasks, `test-driven-development` for every behavior change, and `verification-before-completion` before deployment.

**Goal:** Deploy one lossless, searchable conversation-forensics path that preserves, correlates, accounts for, and displays every sanitized field from every supported Copilot telemetry lane.

**Architecture:** Keep existing ingestion lanes, but stop reducing them into lossy UI records. Introduce one canonical identity contract and one lossless sanitized evidence contract. Conversation nodes and projected spans carry identity plus source references; full evidence stays behind paginated summary and detail APIs. UI keeps readable transcript timeline while exposing every hook event and every native OTLP field in a generic inspector.

**Tech stack:** TypeScript 7, Node.js 22, OpenTelemetry JS 2.10/0.221, native HTML/CSS/JavaScript UI, Node test runner, MCP Node SDK 2.0, JSONL persistence, OTLP HTTP.

**Planning confidence:** 93%. Existing parsers, caches, pagination, ETags, correlation, conversation projection, and inspector already work. Remediation extends those seams instead of replacing runtime. Main uncertainty is MCP stdio request-context access; plan contains an early proof gate and a bounded fallback that still ships without changing MCP wire format.

---

## Scope and hard acceptance contract

Supported lanes:

1. Native Copilot OTLP traces.
2. Native Copilot OTLP metrics.
3. Native Copilot OTLP logs.
4. Copilot hook envelopes and emitted lifecycle/point spans.
5. Native Copilot transcript events.
6. MCP peer-link records over HTTP, WebSocket, and stdio.

“Every attribute of every span” means:

- every native trace span intrinsic;
- every native span, resource, instrumentation-scope, event, and link attribute;
- every hook span intrinsic, attribute, event/exception, parent, and link;
- every dropped-count, schema URL, trace-state, flags, status, source, validity, and redaction field;
- every metric/log field remains inspectable even though metrics and logs are not spans.

No field may disappear silently. Every source field ends with one disposition:

`rendered`, `represented`, `redacted`, `unavailable`, `unmatched`, `heuristic`, `deduplicated`, `invalid`, or `late_out_of_order`.

Deployment gates:

- existing native transcript conversation remains readable and chronological;
- all 14 hook events appear in native-first sessions;
- exact ID joins precede bounded heuristics;
- source detail API returns full sanitized evidence without truncating unknown fields;
- UI can select any conversation node, projected span, or source record and inspect all fields;
- content capture remains explicitly enabled in local launch paths;
- no credentials, raw secrets, or forbidden reasoning plaintext survive sanitization;
- bridge and MCP `check` commands pass;
- live smoke run proves trace, metric, log, hook, transcript, and MCP evidence in one session.

## Approach decision

### Selected: lossless evidence plus normalized index

Preserve full sanitized lane evidence once, derive searchable identity and summaries, and load full detail on selection. This is leanest safe path because current ingestion and UI remain in place while lossy reduction is removed.

### Rejected: expand `SourceRecord` into one giant conversation payload

Fast initially, but sends every raw record on every refresh, duplicates data across coverage and conversation responses, and makes live UI memory use scale badly.

### Rejected: replace bridge with Collector backend or third-party trace UI

Would improve generic trace browsing but would not reconstruct native transcript conversation, hook governance overlays, or Copilot-specific identity today. Migration and integration risk exceed benefit.

## File responsibility map

### New files

- `copilot-otel-bridge/src/conversation-identity.ts` — canonical IDs, exact-match keys, merge rules, source-reference helpers.
- `copilot-otel-bridge/src/telemetry-evidence.ts` — lossless sanitized evidence types, OTLP intrinsic extraction, field accounting traversal.
- `copilot-otel-bridge/src/terminal-status.ts` — one native/hook terminal-state reducer.
- `copilot-otel-bridge/src/hook-span-contract.ts` — pure hook span name, status, attributes, exception, parent, and link semantics shared by emission and projection.
- `copilot-otel-bridge/test/fixtures/native-otel-lossless.jsonl` — trace fixture containing all OTLP span/resource/scope/event/link/status/dropped-count fields.
- `copilot-otel-bridge/test/fixtures/native-otel-all-lanes.jsonl` — trace, metric, log, invalid, and unknown-field records for generic evidence preservation.
- `copilot-otel-bridge/test/telemetry-evidence.test.ts` — lossless preservation and accounting tests.
- `copilot-otel-bridge/test/conversation-identity.test.ts` — exact join and precedence tests.
- `copilot-otel-bridge/test/terminal-status.test.ts` — divergent native/hook status tests.
- `copilot-otel-bridge/test/ui-telemetry-inspector.test.ts` — static UI contract and rendering helper tests.
- `copilot-mcp/test/stdio-propagation.test.ts` — real stdio JSON-RPC carrier propagation test.
- `docs/otel-remediation/README.md` — remediation index, acceptance matrix, deployment evidence links.
- `docs/otel-remediation/2026-08-12-research-sources.md` — all planning research with named active hyperlinks, retrieval date, commit/SHA where available, claim mapping, and failed/unknown searches.
- `docs/otel-remediation/telemetry-field-contract.md` — every supported lane, field, conversation analog, UI location, disposition, and test.
- `docs/otel-remediation/deployment-runbook.md` — exact local build, launch, live capture, rollback, and evidence commands.
- `docs/otel-remediation/live-validation.md` — filled during deployment with session ID, record counts, screenshots/URLs if available, and command results.

### Modified files

- `copilot-otel-bridge/src/types.ts` — extend `NativeOtelRecord` with canonical identity and full evidence.
- `copilot-otel-bridge/src/native-otel.ts` — preserve complete sanitized OTLP containers and signal records.
- `copilot-otel-bridge/src/native-session.ts` — extract `messageId`, merge IDs into native nodes, retain unknown native events as explicit records.
- `copilot-otel-bridge/src/coverage.ts` — retain source references and evidence summaries instead of dropping metadata.
- `copilot-otel-bridge/src/correlation.ts` — exact canonical-ID joins before FIFO fallback; preserve evidence untouched.
- `copilot-otel-bridge/src/trace-projector.ts` — project full hook span contract, identities, attributes, links, status, and exceptions.
- `copilot-otel-bridge/src/span-assembler.ts` — consume shared hook contract and remove status/link duplication.
- `copilot-otel-bridge/src/conversation-projector.ts` — attach all hook events, source references, identities, link references, and reconciled status.
- `copilot-otel-bridge/src/bridge.ts` — add paginated evidence summaries, detail route, field-accounting route, and conversation wiring with native OTel records.
- `copilot-otel-bridge/ui/index.html` — selectable nodes/spans/sources; searchable raw/normalized inspector sections.
- `copilot-otel-bridge/test/native-otel.test.ts` — parser regression expansion.
- `copilot-otel-bridge/test/native-otel-api.test.ts` — evidence detail API tests.
- `copilot-otel-bridge/test/coverage.test.ts` — evidence/reference retention tests.
- `copilot-otel-bridge/test/correlation.test.ts` — exact identity join matrix.
- `copilot-otel-bridge/test/correlation-api.test.ts` — API accounting and gap tests.
- `copilot-otel-bridge/test/native-session.test.ts` — message/tool/agent identity and unknown-event tests.
- `copilot-otel-bridge/test/conversation-projector.test.ts` — all-hook overlay, link, identity, status tests.
- `copilot-otel-bridge/test/span-assembler.test.ts` — emission/projection contract parity.
- `copilot-mcp/src/telemetry-context.ts` — extract per-request carrier from handler context.
- `copilot-mcp/src/server.ts` — preserve MCP tool handler context and run each call inside peer request context.
- `copilot-mcp/src/transports/stdio.ts` — wire stdio per-request metadata when transport API exposes messages.
- `copilot-mcp/test/mcp-propagation.test.ts` — shared per-request extraction tests.
- `docs/otel-span-conversation-audit.md` — mark each finding remediated and link exact test/UI surface.
- `docs/otel-conversation-span-map.md` — update Mermaid map with lossless evidence and detail APIs.

## Task 1: Freeze research and deployment contract

**Files:**

- Create `docs/otel-remediation/README.md`
- Create `docs/otel-remediation/2026-08-12-research-sources.md`
- Create `docs/otel-remediation/telemetry-field-contract.md`
- Create `docs/otel-remediation/deployment-runbook.md`
- Modify `docs/otel-span-conversation-audit.md`

**Steps:**

1. Write research source ledger. Each entry must use a descriptive link label, not a bare URL, and include retrieval date `2026-08-12`, authority, version/commit, supported claim, and stability.
2. Record direct repository evidence:
   - `NativeOtelRecord` already retains `signal`, IDs, model, usage, attributes, resource, scope, validity, redaction, and source lineage.
   - `buildNativeOtelRecords()` currently drops everything except time/session/trace/span/turn/tool IDs.
   - `ProjectedSpan` lacks attributes, links, events, trace ID, parent span ID, and source references.
   - `projectNativeFirst()` overlays only four hook events.
   - stdio builds server without per-request carrier context.
3. Add field-contract rows for every OTLP trace field, every hook span field, all metric/log record fields, transcript identity fields, and MCP peer fields. Required columns: lane, wire path, normalized path, canonical identity path, conversation analog, UI section, disposition rule, test.
4. Add deployment runbook commands:

```powershell
Push-Location copilot-otel-bridge
pnpm check
Pop-Location
Push-Location copilot-mcp
pnpm check
Pop-Location
. .\copilot-otel-bridge\scripts\copilot-otel-env.ps1
copilot
```

5. Link every research source listed in “Research source ledger” below.
6. Commit:

```powershell
git add docs\otel-remediation docs\otel-span-conversation-audit.md
git commit -m "docs(otel): freeze lossless replication contract"
```

## Task 2: Introduce canonical identity

**Files:**

- Create `copilot-otel-bridge/src/conversation-identity.ts`
- Create `copilot-otel-bridge/test/conversation-identity.test.ts`
- Modify `copilot-otel-bridge/src/types.ts`
- Modify `copilot-otel-bridge/src/native-session.ts`

**Contract:**

```ts
export interface ConversationIdentity {
  session_id?: string;
  turn_id?: string;
  message_id?: string;
  tool_call_id?: string;
  agent_id?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  hook_event_id?: string;
  mcp_request_id?: string;
}

export type IdentityMatch =
  | 'session_id'
  | 'turn_id'
  | 'message_id'
  | 'tool_call_id'
  | 'agent_id'
  | 'trace_span'
  | 'hook_event_id'
  | 'mcp_request_id';
```

**Steps:**

1. Write failing tests proving:
   - `tool_call_id` joins transcript tool request/result to native OTel `execute_tool`;
   - `message_id` joins assistant chunks without using timestamp;
   - `turn_id` attaches messages and tools to correct turn;
   - `trace_id + span_id` identifies one span;
   - conflicting non-empty IDs remain explicit conflicts, never overwritten.
2. Run:

```powershell
Push-Location copilot-otel-bridge
pnpm exec tsx --test test/conversation-identity.test.ts
Pop-Location
```

Expected: fail because identity helpers do not exist.

3. Implement normalized extraction aliases, immutable merge, exact-match keys, and conflict reporting.
4. Add `message_id` and `identity` to `NativeEvent` and `NativeOtelRecord`.
5. Parse native `id`, `messageId`, `turnId`, `toolCallId`, `agentId`, trace/span IDs without removing original sanitized values.
6. Keep unrecognized native event types as `kind: 'unknown'` with identity, timestamp, and sanitized raw payload.
7. Re-run targeted tests. Expected: pass.
8. Commit:

```powershell
git add copilot-otel-bridge\src\conversation-identity.ts copilot-otel-bridge\src\types.ts copilot-otel-bridge\src\native-session.ts copilot-otel-bridge\test\conversation-identity.test.ts copilot-otel-bridge\test\native-session.test.ts
git commit -m "feat(otel): add canonical conversation identity"
```

## Task 3: Preserve complete native OTLP evidence

**Files:**

- Create `copilot-otel-bridge/src/telemetry-evidence.ts`
- Create `copilot-otel-bridge/test/telemetry-evidence.test.ts`
- Create fixtures listed in file map
- Modify `copilot-otel-bridge/src/types.ts`
- Modify `copilot-otel-bridge/src/native-otel.ts`
- Modify `copilot-otel-bridge/test/native-otel.test.ts`

**Contract:**

```ts
export interface TelemetryEvidence {
  lane: 'native_trace' | 'native_metric' | 'native_log' | 'hook_span' | 'hook_event' | 'native_transcript' | 'mcp_peer';
  identity: ConversationIdentity;
  resource: JsonObject;
  resource_schema_url?: string;
  instrumentation_scope: JsonObject;
  scope_schema_url?: string;
  record: JsonObject;
  source: {
    file?: string;
    line?: number;
    hash?: string;
  };
  validity: 'valid' | 'invalid';
  content_disposition: RedactionDisposition;
}
```

`record` must preserve full sanitized signal entity. Trace fixtures must prove preservation of:

```text
traceId, spanId, traceState, parentSpanId, flags, name, kind,
startTimeUnixNano, endTimeUnixNano, attributes, droppedAttributesCount,
events[].timeUnixNano, events[].name, events[].attributes,
events[].droppedAttributesCount, droppedEventsCount,
links[].traceId, links[].spanId, links[].traceState, links[].attributes,
links[].droppedAttributesCount, links[].flags, droppedLinksCount,
status.code, status.message
```

Resource/scope fixtures must prove preservation of:

```text
resource.attributes, resource.droppedAttributesCount,
resourceSpans.schemaUrl,
scope.name, scope.version, scope.attributes, scope.droppedAttributesCount,
scopeSpans.schemaUrl
```

**Steps:**

1. Write failing lossless fixture tests using one unknown future field at resource, scope, span, event, and link levels.
2. Assert deep equality after sanitization for all non-sensitive values.
3. Assert secret/content policy still redacts prohibited values inside nested unknown fields.
4. Implement container-aware candidate parsing. Preserve sanitized resource container, scope container, and signal entity instead of reconstructing only selected maps.
5. Derive normalized convenience fields from evidence; never remove evidence fields.
6. Add field walker returning every JSON path and its disposition.
7. Run:

```powershell
Push-Location copilot-otel-bridge
pnpm exec tsx --test test/telemetry-evidence.test.ts test/native-otel.test.ts
Pop-Location
```

Expected: pass with unknown future fields intact.

8. Commit:

```powershell
git add copilot-otel-bridge\src\telemetry-evidence.ts copilot-otel-bridge\src\native-otel.ts copilot-otel-bridge\src\types.ts copilot-otel-bridge\test\telemetry-evidence.test.ts copilot-otel-bridge\test\native-otel.test.ts copilot-otel-bridge\test\fixtures
git commit -m "feat(otel): preserve lossless native telemetry evidence"
```

## Task 4: Make correlation lossless and exact-ID first

**Files:**

- Modify `copilot-otel-bridge/src/coverage.ts`
- Modify `copilot-otel-bridge/src/correlation.ts`
- Modify `copilot-otel-bridge/test/coverage.test.ts`
- Modify `copilot-otel-bridge/test/correlation.test.ts`

**Steps:**

1. Write failing tests for exact match priority:

```text
message_id
tool_call_id
turn_id
agent_id
trace_id + span_id
hook_event_id
mcp_request_id
session_id
```

2. Add tests proving evidence payload survives `buildSourceRecords()` and `correlateSources()` unchanged.
3. Add collision tests: ambiguous exact IDs produce `unmatched` with candidates, not arbitrary selection.
4. Keep FIFO tool/agent matching only when no exact key exists; mark `heuristic` and include reason.
5. Change source record shape to carry:

```ts
identity: ConversationIdentity;
evidence_ref: string;
summary: TelemetryEvidenceSummary;
```

6. Keep full evidence in one map keyed by stable `evidence_ref`; correlation only handles refs and summaries.
7. Run:

```powershell
Push-Location copilot-otel-bridge
pnpm exec tsx --test test/coverage.test.ts test/correlation.test.ts
Pop-Location
```

8. Commit:

```powershell
git add copilot-otel-bridge\src\coverage.ts copilot-otel-bridge\src\correlation.ts copilot-otel-bridge\test\coverage.test.ts copilot-otel-bridge\test\correlation.test.ts
git commit -m "feat(otel): correlate lossless evidence by canonical ids"
```

## Task 5: Unify emitted and projected hook span contracts

**Files:**

- Create `copilot-otel-bridge/src/hook-span-contract.ts`
- Modify `copilot-otel-bridge/src/span-assembler.ts`
- Modify `copilot-otel-bridge/src/trace-projector.ts`
- Modify `copilot-otel-bridge/test/span-assembler.test.ts`

**Contract:**

```ts
export interface ProjectedLink {
  trace_id: string;
  span_id: string;
  trace_state?: string;
  flags?: number;
  attributes: Record<string, JsonValue>;
  dropped_attributes_count?: number;
}

export interface ProjectedSpan {
  identity: ConversationIdentity;
  name: string;
  kind: 'session' | 'turn' | 'tool' | 'subagent' | 'point';
  span_kind: number;
  start_unix_ms: number;
  end_unix_ms?: number;
  status: ProjectedStatus;
  status_message?: string;
  attributes: Record<string, JsonValue>;
  events: TelemetrySpanEvent[];
  links: ProjectedLink[];
  source_refs: string[];
}
```

**Steps:**

1. Write parity tests that process each of 14 hook events and compare projected contract with `InMemorySpanExporter` output for names, statuses, attributes, exception events, parent, and links.
2. Extract pure status, attribute, exception, parent, and link builders from `SpanAssembler`.
3. Make emitter and projector call same pure contract.
4. Fix `sessionEnd` status so point and lifecycle views use same terminal semantics.
5. Preserve link reason attributes:

```text
native_traceparent
fifo_tool_name_match
fifo_agent_name_match
sole_open_tool
last_completed_turn
```

6. Run:

```powershell
Push-Location copilot-otel-bridge
pnpm exec tsx --test test/span-assembler.test.ts test/trace-projector.test.ts
Pop-Location
```

7. Commit:

```powershell
git add copilot-otel-bridge\src\hook-span-contract.ts copilot-otel-bridge\src\span-assembler.ts copilot-otel-bridge\src\trace-projector.ts copilot-otel-bridge\test\span-assembler.test.ts copilot-otel-bridge\test\trace-projector.test.ts
git commit -m "refactor(otel): share emitted and projected span contract"
```

## Task 6: Reconcile terminal status once

**Files:**

- Create `copilot-otel-bridge/src/terminal-status.ts`
- Create `copilot-otel-bridge/test/terminal-status.test.ts`
- Modify `copilot-otel-bridge/src/conversation-projector.ts`
- Modify `copilot-otel-bridge/src/hook-span-contract.ts`

**Rules:**

1. Explicit error from either authoritative lane wins.
2. Recovered closure yields `recovered` unless later explicit error exists.
3. Hook `sessionEnd` closes session even when native transcript lacks `session.shutdown`.
4. Native `session.shutdown` closes session when hook ending is absent.
5. Successful explicit terminal event yields `ok`.
6. No terminal event yields `open`.
7. Conflicting evidence remains listed in `status_evidence`; reducer result never hides conflict.

**Steps:**

1. Write table-driven failing tests for native/hook disagreement.
2. Implement reducer returning:

```ts
interface TerminalState {
  status: ProjectedStatus;
  end_reason?: string;
  ended_at_ms?: number;
  evidence: Array<{ source_ref: string; status: ProjectedStatus; reason?: string }>;
  conflict: boolean;
}
```

3. Use reducer for document, session node, hook session span, and header status.
4. Run targeted tests.
5. Commit:

```powershell
git add copilot-otel-bridge\src\terminal-status.ts copilot-otel-bridge\src\hook-span-contract.ts copilot-otel-bridge\src\conversation-projector.ts copilot-otel-bridge\test\terminal-status.test.ts copilot-otel-bridge\test\conversation-projector.test.ts
git commit -m "fix(otel): reconcile native and hook terminal status"
```

## Task 7: Project complete conversation evidence without hiding hooks

**Files:**

- Modify `copilot-otel-bridge/src/conversation-projector.ts`
- Modify `copilot-otel-bridge/src/native-session.ts`
- Modify `copilot-otel-bridge/test/conversation-projector.test.ts`
- Modify `copilot-otel-bridge/test/native-session.test.ts`

**Steps:**

1. Write failing native-first tests asserting all 14 hook event names remain present.
2. Add `identity`, `source_refs`, and `link_refs` to every `ConversationNode`.
3. Join native nodes by exact IDs. Timestamp containment remains last fallback and must set `heuristic: true`.
4. Replace `OVERLAY_EVENTS` filter with all-event overlay.
5. Prevent visual duplication by grouping hook nodes under an expandable `governance` child while keeping each event individually selectable and chronological.
6. Render unknown native event types as explicit event nodes with `invalid` or `unmatched` disposition.
7. Include native subagent completion response/result content and model-change old/new values.
8. Add node-level status evidence and link refs.
9. Run:

```powershell
Push-Location copilot-otel-bridge
pnpm exec tsx --test test/native-session.test.ts test/conversation-projector.test.ts
Pop-Location
```

10. Commit:

```powershell
git add copilot-otel-bridge\src\native-session.ts copilot-otel-bridge\src\conversation-projector.ts copilot-otel-bridge\test\native-session.test.ts copilot-otel-bridge\test\conversation-projector.test.ts
git commit -m "feat(otel): project all conversation evidence"
```

## Task 8: Add summary, detail, and accounting APIs

**Files:**

- Modify `copilot-otel-bridge/src/bridge.ts`
- Modify `copilot-otel-bridge/src/coverage.ts`
- Modify `copilot-otel-bridge/test/native-otel-api.test.ts`
- Modify `copilot-otel-bridge/test/correlation-api.test.ts`

**Endpoints:**

```text
GET /api/sessions/:id/sources?limit=&cursor=
GET /api/sessions/:id/sources/:sourceId
GET /api/sessions/:id/telemetry-fields
GET /api/sessions/:id/conversation?limit=&cursor=
```

Summary rows stay small. Detail returns:

```ts
interface TelemetryEvidenceDetail {
  source_id: string;
  disposition: CoverageDisposition;
  identity: ConversationIdentity;
  evidence: TelemetryEvidence;
  related_ids: string[];
  match_method: string;
  reason: string;
  field_accounting: Array<{
    path: string;
    disposition: CoverageDisposition;
    ui_target: string;
  }>;
}
```

**Steps:**

1. Write failing API tests for a full OTLP trace record and unknown future fields.
2. Assert summary route does not duplicate `evidence.record`.
3. Assert detail route returns all sanitized fields.
4. Assert invalid source ID returns 404.
5. Assert ETag changes when evidence changes and returns 304 when unchanged.
6. Implement per-request evidence map from current caches; do not create second persistence format.
7. Add field-accounting route that reports every JSON path and disposition.
8. Run:

```powershell
Push-Location copilot-otel-bridge
pnpm exec tsx --test test/native-otel-api.test.ts test/correlation-api.test.ts
Pop-Location
```

9. Commit:

```powershell
git add copilot-otel-bridge\src\bridge.ts copilot-otel-bridge\src\coverage.ts copilot-otel-bridge\test\native-otel-api.test.ts copilot-otel-bridge\test\correlation-api.test.ts
git commit -m "feat(otel): expose lossless telemetry evidence api"
```

## Task 9: Display every field in one forensic inspector

**Files:**

- Modify `copilot-otel-bridge/ui/index.html`
- Create `copilot-otel-bridge/test/ui-telemetry-inspector.test.ts`

**UI contract:**

- Transcript remains primary center timeline.
- Every node, waterfall span, coverage row, link, and hook event is selectable.
- Inspector tabs/sections:
  - Overview
  - Identity
  - Span intrinsics
  - Span attributes
  - Resource
  - Instrumentation scope
  - Events
  - Links
  - Status
  - Raw sanitized record
  - Source lineage
  - Field accounting
- Search filters by attribute path or value.
- Raw and normalized views are both available.
- Long arrays/objects are collapsed by default; rendering is incremental.
- Link targets are clickable when local target exists.
- Missing target remains visible with explicit disposition.
- No truthy checks hide `0`, `false`, or empty string values.

**Steps:**

1. Extract pure UI render helpers into exported/testable script functions or a small inline module loaded by page.
2. Write failing tests for:
   - `0`, `false`, empty string, arrays, nested objects;
   - all OTLP sections;
   - all hook attributes and links;
   - exact ID display;
   - all hook events in native-first conversation;
   - HTML escaping and redaction.
3. Add selection state and lazy detail fetch.
4. Add generic recursive key/value renderer with depth controls and copy buttons.
5. Add namespace chips and search:

```text
gen_ai.*
github.copilot.*
otel.*
resource.*
scope.*
custom/unknown
```

6. Make waterfall include native trace spans and hook spans, labeled by lane.
7. Keep governance hook group collapsed by default but count and expose every event.
8. Add field-accounting counter: `accounted / total`, with click-through for any non-rendered path.
9. Run:

```powershell
Push-Location copilot-otel-bridge
pnpm exec tsx --test test/ui-telemetry-inspector.test.ts test/conversation-projector.test.ts test/correlation-api.test.ts
Pop-Location
```

10. Commit:

```powershell
git add copilot-otel-bridge\ui\index.html copilot-otel-bridge\test\ui-telemetry-inspector.test.ts
git commit -m "feat(otel-ui): display all telemetry evidence"
```

## Task 10: Add MCP stdio propagation

**Files:**

- Modify `copilot-mcp/src/telemetry-context.ts`
- Modify `copilot-mcp/src/server.ts`
- Modify `copilot-mcp/src/transports/stdio.ts`
- Modify `copilot-mcp/test/mcp-propagation.test.ts`
- Create `copilot-mcp/test/stdio-propagation.test.ts`

**Proof gate:**

First prove installed MCP Node SDK tool callback receives request `params._meta` through handler context. `ToolCallback` in current SDK accepts `ServerContext`; implementation must use that context rather than global transport state.

**Primary implementation:**

1. Change `withCheckIn` wrapper to preserve callback context arguments.
2. Extract `traceparent`, `tracestate`, and `baggage` from per-call context/params metadata.
3. Wrap each tool call in `runWithPeerRequestContext({ transport: 'stdio', ... })`.
4. Keep HTTP and WebSocket extraction unchanged.

**Bounded fallback if SDK context omits raw `_meta`:**

Implement a thin stdio JSON-RPC transform around SDK transport that:

1. reads each newline-delimited JSON-RPC message;
2. extracts only validated carrier and request ID;
3. runs message dispatch inside `runWithPeerRequestContext`;
4. writes only valid JSON-RPC to stdout;
5. sends diagnostics only to stderr.

No custom wire field is introduced; carrier remains in standard JSON-RPC `params._meta`.

**Steps:**

1. Write subprocess test sending:

```json
{
  "jsonrpc": "2.0",
  "id": "stdio-42",
  "method": "tools/call",
  "params": {
    "name": "session_create",
    "arguments": {},
    "_meta": {
      "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      "tracestate": "acme=foo"
    }
  }
}
```

2. Assert peer record has trace ID, span ID, request ID, tool name, `peer_transport: stdio`.
3. Assert malformed carrier and baggage canary do not survive.
4. Implement primary path; use fallback only if proof test demonstrates context omission.
5. Run:

```powershell
Push-Location copilot-mcp
pnpm exec node --test --import tsx test/mcp-propagation.test.ts test/stdio-propagation.test.ts
Pop-Location
```

6. Commit:

```powershell
git add copilot-mcp\src\telemetry-context.ts copilot-mcp\src\server.ts copilot-mcp\src\transports\stdio.ts copilot-mcp\test\mcp-propagation.test.ts copilot-mcp\test\stdio-propagation.test.ts
git commit -m "feat(mcp): propagate trace context over stdio"
```

## Task 11: Prove every field accounted

**Files:**

- Modify `copilot-otel-bridge/test/telemetry-evidence.test.ts`
- Modify `copilot-otel-bridge/test/correlation-api.test.ts`
- Modify `copilot-otel-bridge/test/ui-telemetry-inspector.test.ts`
- Modify `docs/otel-remediation/telemetry-field-contract.md`

**Steps:**

1. Add fixture walker that enumerates every source JSON path.
2. Query field-accounting output.
3. Fail test when any source path lacks one allowed disposition.
4. Fail test when a `represented` or `rendered` path lacks a real UI target.
5. Fail test when UI target ID is absent from page.
6. Fail test when any new hook event lacks emitted-span and projected-node coverage.
7. Generate contract table data from fixture/accounting output, then review descriptive text manually.
8. Run:

```powershell
Push-Location copilot-otel-bridge
pnpm exec tsx --test test/telemetry-evidence.test.ts test/correlation-api.test.ts test/ui-telemetry-inspector.test.ts
Pop-Location
```

Expected: `accounted_paths === total_paths` for every fixture.

9. Commit:

```powershell
git add copilot-otel-bridge\test docs\otel-remediation\telemetry-field-contract.md
git commit -m "test(otel): require complete telemetry field accounting"
```

## Task 12: Full verification and live deployment

**Files:**

- Modify `docs/otel-remediation/live-validation.md`
- Modify `docs/otel-remediation/README.md`
- Modify `docs/otel-conversation-span-map.md`
- Modify `docs/otel-span-conversation-audit.md`

**Steps:**

1. Run complete package gates:

```powershell
Push-Location copilot-otel-bridge
pnpm check
Pop-Location
Push-Location copilot-mcp
pnpm check
Pop-Location
```

Expected: typecheck, all tests, and build pass in both packages.

2. Confirm launch configuration:

```powershell
$required = @(
  'COPILOT_OTEL_ENABLED',
  'COPILOT_OTEL_EXPORTER_TYPE',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_PROTOCOL',
  'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT'
)
$required | ForEach-Object { "$_=$([Environment]::GetEnvironmentVariable($_, 'User'))" }
```

Expected content capture value: `true`.

3. Start local runtime using existing repository scripts and open UI.
4. Launch fresh Copilot process after environment setup.
5. Exercise one session containing:
   - user prompt;
   - assistant response;
   - successful tool;
   - failed tool;
   - permission request;
   - subagent;
   - notification or compact event;
   - MCP call over stdio.
6. Verify APIs:

```powershell
Invoke-RestMethod http://127.0.0.1:14329/health
Invoke-RestMethod http://127.0.0.1:14329/api/sessions
```

7. For captured session, verify:
   - native trace, metric, log records exist;
   - all hook events exist;
   - transcript nodes exist;
   - MCP stdio peer exists;
   - field accounting reports 100%;
   - no field has silent/unknown disposition;
   - inspector exposes every section;
   - native and hook terminal evidence agree or conflict is explicit.
8. Record exact commands, session ID, counts, API excerpts, field-accounting result, and UI evidence in `live-validation.md`.
9. Update audit: each critical/high/medium finding gets status, implementation path, test, and UI target.
10. Update Mermaid diagram for canonical identity, lossless evidence store, detail API, and generic inspector.
11. Run documentation link check available in repository; if none exists, verify all new Markdown links by HTTP fetch during implementation and record failures explicitly.
12. Commit:

```powershell
git add docs\otel-remediation docs\otel-span-conversation-audit.md docs\otel-conversation-span-map.md
git commit -m "docs(otel): record complete replication deployment"
```

13. Push feature branch, merge into `development`, rerun package gates on merged branch, then push `development`.

## Rollback

Rollback deployment, not captured evidence:

1. Stop new bridge/MCP processes by recorded process ID.
2. Restart previous branch build.
3. Keep `.copilot/telemetry-live/` files untouched for forensic comparison.
4. Revert only remediation commits if needed; never delete telemetry evidence.
5. Record rollback reason and failing gate in `live-validation.md`.

## Research source ledger

All entries below must be copied into `docs/otel-remediation/2026-08-12-research-sources.md` with these descriptive active hyperlink names.

### OpenTelemetry normative sources

- [OpenTelemetry Protocol Specification 1.11.0](https://opentelemetry.io/docs/specs/otlp/)
- [OpenTelemetry Tracing API — Stable](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [OpenTelemetry OTLP Trace Protobuf v1.11.0](https://github.com/open-telemetry/opentelemetry-proto/blob/v1.11.0/opentelemetry/proto/trace/v1/trace.proto)
- [OpenTelemetry Specification — OTLP Trace Data Format OTEP 59](https://github.com/open-telemetry/opentelemetry-specification/blob/main/oteps/trace/0059-otlp-trace-data-format.md)
- [OpenTelemetry Specification — Telemetry Schemas OTEP 152](https://github.com/open-telemetry/opentelemetry-specification/blob/main/oteps/0152-telemetry-schemas.md)
- [OpenTelemetry Specification — Instrumentation Scope Attributes OTEP 201](https://github.com/open-telemetry/opentelemetry-specification/blob/main/oteps/0201-scope-attributes.md)
- [OpenTelemetry GenAI Semantic Conventions Repository](https://github.com/open-telemetry/semantic-conventions-genai)
- [OpenTelemetry GenAI Execute Tool Span Support Report](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/reference/reports/execute-tool-span.md)
- [OpenTelemetry GenAI Attribute Registry Migration Notice](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/registry/attributes/gen-ai.md)
- [Grafana Tempo Trace Structure and Attribute Classes](https://grafana.com/docs/tempo/latest/introduction/trace-structure/)

### GitHub Copilot sources

- [GitHub Copilot CLI Command Reference — OpenTelemetry Environment Variables](https://github.com/github/docs/blob/1d8dc3817bb74ef04d3ac2d5d49a2716dcc53ff9/content/copilot/reference/copilot-cli-reference/cli-command-reference.md)
- [GitHub Copilot SDK Node Telemetry Configuration](https://github.com/github/copilot-sdk/blob/a6d3ed1c844b39fad52af345b0ca401611becfbf/nodejs/src/types.ts)
- [GitHub Copilot SDK Node Telemetry Environment Injection](https://github.com/github/copilot-sdk/blob/a6d3ed1c844b39fad52af345b0ca401611becfbf/nodejs/src/client.ts)
- [VS Code Copilot Agent Monitoring Architecture](https://github.com/microsoft/vscode/blob/661f18fdeb7861d25e79df68b32af3a681eff7b2/extensions/copilot/docs/monitoring/agent_monitoring_arch.md)
- [VS Code Agent Host OpenTelemetry Configuration](https://github.com/microsoft/vscode/blob/661f18fdeb7861d25e79df68b32af3a681eff7b2/src/vs/platform/agentHost/OTEL.md)
- [VS Code Copilot Agent OTel Environment Mapping](https://github.com/microsoft/vscode/blob/661f18fdeb7861d25e79df68b32af3a681eff7b2/extensions/copilot/src/platform/otel/common/agentOTelEnv.ts)
- [VS Code Enterprise AI Telemetry Managed Settings](https://github.com/microsoft/vscode-docs/blob/95cc3b3b226823b70306b8b6ef118def6f3c1842/docs/enterprise/ai-settings.md)

### MCP and propagation sources

- [Model Context Protocol 2025-06-18 Transports Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [W3C Trace Context Recommendation](https://www.w3.org/TR/trace-context/)
- [MCP TypeScript SDK Tool Callback and Server Context](https://github.com/modelcontextprotocol/typescript-sdk/blob/cc4b41617ce3601b1290d67216ea0b194a3cd9ac/packages/server/src/server/mcp.ts)

### Trace UI references

- [Jaeger Frontend UI Configuration and Attribute Link Patterns](https://www.jaegertracing.io/docs/2.9/deployment/frontend-ui/)
- [Grafana Tempo Trace Structure and Span Intrinsics](https://grafana.com/docs/tempo/latest/introduction/trace-structure/)

### Repository evidence

- [Current Span and Conversation Audit](../../../docs/otel-span-conversation-audit.md)
- [Current OTel Span and Conversation Mermaid Map](../../../docs/otel-conversation-span-map.md)
- [Existing Research Vector Index](../../../docs/research-vectors/README.md)
- [Existing Copilot Research Corpus](../../../docs/copilot-research/)

## Final self-review

Spec coverage:

- incomplete native ID joins: Tasks 2, 4, 7;
- native metadata dropped before UI: Tasks 3, 4, 8, 9;
- OTel links absent: Tasks 3, 5, 7, 9;
- native-first hides hook events: Task 7;
- status divergence: Tasks 5, 6;
- MCP stdio gap: Task 10;
- every attribute across all lanes: Tasks 3, 5, 8, 9, 11;
- all research copied into docs with active named hyperlinks: Tasks 1 and 12;
- targeted deployment throughline: Task 12.

No placeholders remain. Type names used by later tasks are defined before use. Full sanitized evidence has one owner; summaries and references avoid payload duplication. Unknown fields remain preserved and test-accounted.
