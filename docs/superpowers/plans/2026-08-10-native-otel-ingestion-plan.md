# Copilot Native OTel Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Copilot native traces, metrics, and logs locally, sanitize them before persistence, and expose normalized records for correlation and the forensic UI.

**Architecture:** Copilot uses its exclusive local OTLP HTTP exporter. The Collector receives all three signals, writes durable local JSON records, and forwards no signal externally. The bridge tails normalized Collector output incrementally and stores source records in the sanitized operational mirror.

**Tech Stack:** OpenTelemetry Collector Contrib, OTLP HTTP, JSONL, Node.js 22, TypeScript, `node:test`, Docker Compose.

---

## Files and responsibilities

- Modify `copilot-otel-bridge/otel/collector.yml`: durable local file exporters and signal pipelines.
- Modify `copilot-otel-bridge/compose.yml`: mount the sanitized OTel output and keep endpoints local.
- Create `copilot-otel-bridge/src/native-otel.ts`: parse, normalize, and incrementally tail Collector JSON records.
- Create `copilot-otel-bridge/test/native-otel.test.ts`: parser, malformed-record, and incremental-tail tests.
- Modify `copilot-otel-bridge/src/config.ts`: configure native OTel directory and retention bounds.
- Modify `copilot-otel-bridge/src/bridge.ts`: start the native OTel cache and expose normalized records.
- Modify `copilot-otel-bridge/src/operational-mirror.ts`: persist sanitized native OTel records.
- Modify `copilot-otel-bridge/scripts/copilot-otel-env.ps1` and `.sh`: local OTLP endpoint and explicit content-capture mode.
- Create `copilot-otel-bridge/scripts/copilot-otel-local.ps1` and `.sh`: no-proxy local full-content session launcher.
- Modify `copilot-otel-bridge/README.md` and `VALIDATION.md`: document the native lane and exclusive exporter rule.

### Task 1: Add native OTel fixtures and failing parser tests

**Files:**
- Create: `copilot-otel-bridge/test/fixtures/native-otel-traces.jsonl`
- Create: `copilot-otel-bridge/test/fixtures/native-otel-metrics.jsonl`
- Create: `copilot-otel-bridge/test/fixtures/native-otel-logs.jsonl`
- Create: `copilot-otel-bridge/test/native-otel.test.ts`

- [ ] **Step 1: Add fixture records**

Each fixture must include a valid record with resource attributes, scope,
trace/span IDs where applicable, timestamps, model metadata, usage fields, and
one content-bearing attribute containing the synthetic canary.

- [ ] **Step 2: Add failing tests**

Test:

```ts
assert.equal(records[0].signal, 'trace');
assert.equal(records[0].trace_id, '4bf92f3577b34da6a3ce929d0e0e4736');
assert.equal(records[0].content_disposition.redacted, true);
assert.equal(JSON.stringify(records).includes('canary-pass'), false);
```

Also test malformed JSON produces an `invalid` record with line number and
source hash instead of throwing.

- [ ] **Step 3: Run the focused tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/native-otel.test.ts
```

Expected: FAIL because the native OTel parser does not exist.

### Task 2: Implement normalized native OTel records

**Files:**
- Create: `copilot-otel-bridge/src/native-otel.ts`
- Modify: `copilot-otel-bridge/src/types.ts`
- Modify: `copilot-otel-bridge/src/security.ts`

- [ ] **Step 1: Define normalized signal types**

Add:

```ts
export type NativeSignal = 'trace' | 'metric' | 'log';

export interface NativeOtelRecord {
  record_id: string;
  source_file: string;
  line_number: number;
  signal: NativeSignal;
  observed_at_unix_ms: number;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  session_id?: string;
  turn_id?: string;
  tool_call_id?: string;
  model?: string;
  usage?: Record<string, number>;
  attributes: Record<string, JsonValue>;
  resource: Record<string, JsonValue>;
  instrumentation_scope: Record<string, JsonValue>;
  content_disposition: RedactionDisposition;
  validity: 'valid' | 'invalid';
  source_hash: string;
}
```

- [ ] **Step 2: Parse signal files**

Implement `parseNativeOtelLines(lines, sourceFile)` using defensive JSON
parsing. Normalize snake_case and camelCase OTLP JSON fields, preserve IDs,
extract known GenAI fields, and sanitize every attribute value through the
shared policy. Never retain reasoning ciphertext or raw secret-bearing
attributes.

- [ ] **Step 3: Add incremental tailing**

Implement:

```ts
export class NativeOtelCache {
  constructor(private readonly directory: string, private readonly maxRecords: number);
  async getRecords(): Promise<NativeOtelRecord[]>;
}
```

Track byte offsets and partial final lines per file. On truncation, restart the
file with an invalidation record. Evict files not touched for 10 minutes and
cap total records at `maxRecords`.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/native-otel.test.ts
```

Expected: PASS with valid, redacted, malformed, and incremental-tail cases.

- [ ] **Step 5: Commit**

```powershell
git add copilot-otel-bridge/src/native-otel.ts copilot-otel-bridge/src/types.ts copilot-otel-bridge/src/security.ts copilot-otel-bridge/test/native-otel.test.ts copilot-otel-bridge/test/fixtures
git commit -m "feat(otel): normalize native signal records"
```

### Task 3: Persist Collector signals locally

**Files:**
- Modify: `copilot-otel-bridge/otel/collector.yml`
- Modify: `copilot-otel-bridge/compose.yml`
- Modify: `copilot-otel-bridge/src/config.ts`

- [ ] **Step 1: Add file exporters**

Configure separate trace, metric, and log file exporters under the mounted
sanitized output directory. Use JSON output, bounded flush intervals, and
file rotation/retention that stays inside the local data directory. Keep the
existing debug exporter only for development diagnostics, not as the durable
source.

- [ ] **Step 2: Wire the three pipelines**

Each pipeline must use `memory_limiter` and `batch`, then its matching file
exporter. Do not add an external exporter. The Collector health endpoint and
ports remain loopback-bound.

- [ ] **Step 3: Mount the output**

Mount a repository-local `.copilot/telemetry-live/native-otel` directory into
the Collector and bridge with mode restrictions. The bridge reads only the
sanitized Collector output.

- [ ] **Step 4: Validate configuration**

Run:

```powershell
wsl.exe -e sh -lc "cd /c/Users/lzautke/dev/fintech-marketplace/copilot-otel-bridge && docker compose config"
```

Expected: exit code 0 and no external bind address.

### Task 4: Integrate the bridge native lane

**Files:**
- Modify: `copilot-otel-bridge/src/bridge.ts`
- Modify: `copilot-otel-bridge/src/config.ts`
- Modify: `copilot-otel-bridge/src/operational-mirror.ts`
- Create: `copilot-otel-bridge/test/native-otel-api.test.ts`

- [ ] **Step 1: Add config**

Add `nativeOtelDirectory` and `nativeOtelMaxRecords` to `BridgeConfig`, defaulting
to `<dataDir>/native-otel` and `100000`.

- [ ] **Step 2: Start the cache**

Instantiate `NativeOtelCache` once in `main` and read it on API requests. Do
not create a background tailer; the UI poll remains the tick.

- [ ] **Step 3: Add source endpoint**

Expose:

```text
GET /api/sessions/:sessionId/native-otel
```

Filter records by exact `session_id`, preserve source file/line and IDs, and
return `{ records, count, generated_at }`. Every returned record is already
sanitized and carries validity/disposition.

- [ ] **Step 4: Test the endpoint contract**

Use a temporary fixture directory and assert exact filtering, malformed-record
visibility, and absence of the synthetic canary.

- [ ] **Step 5: Run package checks**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge check
```

Expected: exit code 0.

### Task 5: Add explicit local full-content launchers

**Files:**
- Modify: `copilot-otel-bridge/scripts/copilot-otel-env.ps1`
- Modify: `copilot-otel-bridge/scripts/copilot-otel-env.sh`
- Create: `copilot-otel-bridge/scripts/copilot-otel-local.ps1`
- Create: `copilot-otel-bridge/scripts/copilot-otel-local.sh`

- [ ] **Step 1: Keep generic env scripts safe**

Leave `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=false` as the
generic default. Add a `-CaptureMessageContent` switch or
`COPILOT_OTEL_CAPTURE_MESSAGE_CONTENT=true` opt-in that is rejected unless the
endpoint passes the local-runtime validator.

- [ ] **Step 2: Add local launchers**

The launchers must:

1. Remove all proxy variables from the child environment.
2. Set `NO_PROXY` for bridge/Collector/Aspire/private WSL addresses.
3. Set `COPILOT_OTEL_ENABLED=true`,
   `COPILOT_OTEL_EXPORTER_TYPE=otlp-http`,
   `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, and the local endpoint.
4. Set `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`.
5. Print only endpoint, protocol, and capture mode.

- [ ] **Step 3: Test shell syntax and PowerShell parsing**

Run:

```powershell
bash -n .\copilot-otel-bridge\scripts\copilot-otel-local.sh
```

Run the PowerShell script with `-WhatIf` or a test child process and assert
proxy variables are absent from the child environment.

### Task 6: Run native OTel acceptance

- [ ] **Step 1: Start the local Collector and bridge**

Use the local runtime plan's no-proxy startup command.

- [ ] **Step 2: Launch a real session**

Use the local full-content launcher in a trusted repository and issue one
prompt that creates a model response, a read-only tool call, and a recoverable
error.

- [ ] **Step 3: Verify all three signals**

Assert trace, metric, and log files contain records for the session and that
the bridge API returns matching sanitized records.

- [ ] **Step 4: Seal evidence**

Record the run ID, source files, record counts, correlation IDs, content
dispositions, hashes, and terminal reason in the append-only evidence plan.

- [ ] **Step 5: Commit documentation**

```powershell
git add copilot-otel-bridge/README.md copilot-otel-bridge/VALIDATION.md
git commit -m "docs(otel): document native signal acceptance"
```

