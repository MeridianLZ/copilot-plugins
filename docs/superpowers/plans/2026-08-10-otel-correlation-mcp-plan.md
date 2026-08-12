# Copilot OTel Correlation and MCP Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correlate native OTel, native transcript, hook, MCP, and evidence records and propagate W3C trace context across the Copilot peer boundary without duplicate authoritative spans.

**Architecture:** Use exact IDs first, then bounded deterministic heuristics, with a coverage ledger that accounts for every source record. Carry W3C context in MCP JSON-RPC `_meta`, extract it at the server boundary, and link the outer peer span to the authoritative inner Copilot span.

**Tech Stack:** TypeScript, OpenTelemetry API, MCP SDK 2.0, custom JSON-RPC/WebSocket transport, `node:test`.

---

## Files and responsibilities

- Create `copilot-otel-bridge/src/correlation.ts`: exact/heuristic matching and dispositions.
- Create `copilot-otel-bridge/src/coverage.ts`: source record ledger and balanced totals.
- Create `copilot-otel-bridge/test/correlation.test.ts`.
- Create `copilot-otel-bridge/test/coverage.test.ts`.
- Create `copilot-otel-bridge/test/correlation-api.test.ts`.
- Modify `copilot-otel-bridge/src/conversation-projector.ts`: attach correlation explanations and gap nodes.
- Modify `copilot-otel-bridge/src/bridge.ts`: expose coverage and correlation data.
- Create `copilot-mcp/src/telemetry-context.ts`: W3C carrier validation, injection, and extraction.
- Modify `copilot-mcp/src/server.ts`: capture request metadata and create peer spans.
- Modify `copilot-mcp/src/transports/http.ts`: pass request metadata to server instances.
- Modify `copilot-mcp/src/transports/ws.ts`: capture `_meta` and connection identity.
- Modify `copilot-mcp/src/bridge/copilot-bridge.ts`: associate inner session IDs with peer context.
- Create `copilot-mcp/test/telemetry-context.test.ts`.
- Create `copilot-mcp/test/mcp-propagation.test.ts`.

### Task 1: Add the coverage and correlation contracts

**Files:**
- Create: `copilot-otel-bridge/src/coverage.ts`
- Create: `copilot-otel-bridge/src/correlation.ts`
- Create: `copilot-otel-bridge/test/coverage.test.ts`
- Create: `copilot-otel-bridge/test/correlation.test.ts`

- [ ] **Step 1: Define source and disposition types**

Use:

```ts
export type SourceKind = 'native_otel' | 'native_transcript' | 'hook' | 'mcp' | 'evidence';
export type CoverageDisposition =
  | 'rendered'
  | 'represented'
  | 'redacted'
  | 'unavailable'
  | 'unmatched'
  | 'heuristic'
  | 'deduplicated'
  | 'invalid'
  | 'late_out_of_order';

export interface SourceRecord {
  source_kind: SourceKind;
  source_id: string;
  timestamp_ms: number;
  trace_id?: string;
  span_id?: string;
  turn_id?: string;
  tool_call_id?: string;
  session_id?: string;
}

export interface CoverageEntry extends SourceRecord {
  disposition: CoverageDisposition;
  canonical_id?: string;
  matched_by?: 'trace_id' | 'span_id' | 'turn_id' | 'tool_call_id' | 'session_id' | 'fifo_timestamp';
  related_ids: string[];
  reason: string;
}
```

- [ ] **Step 2: Add failing exact-match tests**

Test trace ID, tool call ID, turn ID, and session ID matches. Test that
`parentId` is not used. Test two same-timestamp candidates resolve in input
order and receive `heuristic`.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/coverage.test.ts test/correlation.test.ts
```

Expected: FAIL because the functions are not implemented.

### Task 2: Implement deterministic correlation and coverage accounting

**Files:**
- Modify: `copilot-otel-bridge/src/correlation.ts`
- Modify: `copilot-otel-bridge/src/coverage.ts`
- Modify: `copilot-otel-bridge/test/correlation.test.ts`
- Modify: `copilot-otel-bridge/test/coverage.test.ts`

- [ ] **Step 1: Implement exact-first matching**

Export:

```ts
export function correlateSources(
  records: readonly SourceRecord[],
  nowMs?: number
): CoverageEntry[];
```

Index candidates by exact trace, span, tool-call, turn, and session IDs. Use
the strongest available key and record `matched_by`.

- [ ] **Step 2: Implement bounded FIFO fallback**

Only compare records in the same session and within 2 seconds. Use source
priority `native_otel`, `native_transcript`, `hook`, `mcp`, `evidence`.
Consume a candidate once. Mark fallback matches as `heuristic`; leave
unmatched records explicit.

- [ ] **Step 3: Implement coverage totals**

Export:

```ts
export interface CoverageTotals {
  by_source: Record<SourceKind, number>;
  by_disposition: Record<CoverageDisposition, number>;
  total: number;
  balanced: boolean;
}

export function summarizeCoverage(entries: readonly CoverageEntry[]): CoverageTotals;
```

`balanced` is true only when every input source record has exactly one entry
and every entry has one disposition.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/coverage.test.ts test/correlation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add copilot-otel-bridge/src/correlation.ts copilot-otel-bridge/src/coverage.ts copilot-otel-bridge/test/correlation.test.ts copilot-otel-bridge/test/coverage.test.ts
git commit -m "feat(otel): add source coverage correlation"
```

### Task 3: Add W3C context carrier utilities to copilot-mcp

**Files:**
- Create: `copilot-mcp/src/telemetry-context.ts`
- Create: `copilot-mcp/test/telemetry-context.test.ts`

- [ ] **Step 1: Define the carrier**

Implement:

```ts
export interface TelemetryCarrier {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
}

export function validateCarrier(value: unknown): TelemetryCarrier;
export function injectCarrier(
  params: Record<string, unknown>,
  carrier: TelemetryCarrier
): Record<string, unknown>;
export function extractCarrier(params: unknown): TelemetryCarrier;
```

Accept only valid W3C traceparent/tracestate/baggage syntax, reject all-zero
IDs, preserve unrelated `_meta` fields, and never throw a secret-bearing
value in an error.

- [ ] **Step 2: Test valid, invalid, and preservation behavior**

Test a valid sampled carrier, invalid/all-zero traceparent, unrelated `_meta`
keys, and absence of carrier.

- [ ] **Step 3: Run tests**

Run:

```powershell
pnpm --dir .\copilot-mcp test -- test/telemetry-context.test.ts
```

Expected: PASS.

### Task 4: Instrument MCP request boundaries

**Files:**
- Modify: `copilot-mcp/src/server.ts`
- Modify: `copilot-mcp/src/transports/http.ts`
- Modify: `copilot-mcp/src/transports/ws.ts`
- Modify: `copilot-mcp/src/bridge/copilot-bridge.ts`
- Create: `copilot-mcp/test/mcp-propagation.test.ts`

- [ ] **Step 1: Add a request-context parameter to server construction**

Extend `BuildServerOptions` with:

```ts
requestCarrier?: TelemetryCarrier;
peerRequestId?: string;
```

Create an internal peer span only when a valid carrier is present. Record
server name, tool name, transport, request ID, and status. Do not put prompt,
response, proxy, or credential content in span attributes.

- [ ] **Step 2: Capture request metadata in HTTP**

Wrap the `createMcpHandler` factory so request `_meta` is extracted and passed
to `buildServer`. Preserve stateless request handling and the shared
`CopilotBridge`/`BlastTimer`.

- [ ] **Step 3: Capture request metadata in WebSocket**

Extend `WsServerTransport` with a connection carrier set from each JSON-RPC
request's `_meta`. Pass the carrier to the server factory without changing the
one-message-per-frame protocol.

- [ ] **Step 4: Associate inner sessions**

Add an optional carrier/session linkage map in `CopilotBridge`. `ask` and
`session_create` accept a carrier, store the peer trace ID with the inner
session, and return only stable IDs and non-sensitive status.

- [ ] **Step 5: Test propagation**

Assert that a request carrier reaches the peer span and the inner session
linkage, that absent/invalid metadata creates no parent link, and that
duplicate authoritative Copilot spans are not emitted.

- [ ] **Step 6: Run package checks**

Run:

```powershell
pnpm --dir .\copilot-mcp check
```

Expected: exit code 0.

### Task 5: Attach correlation and coverage to the bridge

**Files:**
- Modify: `copilot-otel-bridge/src/bridge.ts`
- Modify: `copilot-otel-bridge/src/conversation-projector.ts`
- Create: `copilot-otel-bridge/test/correlation-api.test.ts`

- [ ] **Step 1: Build source records**

Convert hook envelopes, native transcript events, native OTel records, and MCP
link records into `SourceRecord` values using exact IDs when present.

- [ ] **Step 2: Add coverage endpoint**

Expose:

```text
GET /api/sessions/:sessionId/coverage
```

Return `{ entries, totals, generated_at }`, with all reasons and IDs sanitized.

- [ ] **Step 3: Add gap nodes**

When a coverage entry is `unmatched`, `invalid`, `unavailable`, or
`late_out_of_order`, attach a visible event node to the conversation document.
Do not invent a parent or tool identity.

- [ ] **Step 4: Test API behavior**

Use fixtures from the previous plans and assert balanced totals, explicit gaps,
and no secret canary in JSON output.

- [ ] **Step 5: Commit**

```powershell
git add copilot-mcp/src copilot-mcp/test copilot-otel-bridge/src copilot-otel-bridge/test
git commit -m "feat(otel): propagate MCP context and expose coverage"
```
