# Copilot OTel API UI and Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the evidence API, three-pane forensic UI, append-only run recorder, hook installation checks, and live end-to-end acceptance.

**Architecture:** The API serves sanitized projections only. The UI consumes conversation, native OTel, coverage, and evidence endpoints and renders explicit gap/redaction states. The recorder creates hash-chained run manifests and sanitized runbook projections for pass, failure, and abort outcomes.

**Tech Stack:** Node.js 22, TypeScript, Node HTTP server, vanilla HTML/CSS/JS UI, PowerShell, Bash, Docker Compose, SHA-256.

---

## Files and responsibilities

- Create `copilot-otel-bridge/src/evidence.ts`: append-only run records and SHA-256 chains.
- Create `copilot-otel-bridge/src/api-contract.ts`: validated API response types and ETag helpers.
- Modify `copilot-otel-bridge/src/bridge.ts`: pagination, ETags, source endpoints, and run endpoints.
- Create `copilot-otel-bridge/test/evidence.test.ts`.
- Create `copilot-otel-bridge/test/api-contract.test.ts`.
- Modify `copilot-otel-bridge/ui/index.html`: three-pane inspector, coverage cards, and live refresh.
- Create `copilot-otel-bridge/test/ui-contract.test.ts`.
- Modify `copilot-otel-bridge/src/generate-hooks.ts`: reproducible all-14-event install verification.
- Modify `copilot-otel-bridge/scripts/install-hooks.ps1` and `.sh`: no duplicate JSON configs and no proxy dependency.
- Create `copilot-otel-bridge/scripts/run-acceptance.ps1`.
- Create `copilot-otel-bridge/scripts/run-acceptance.sh`.
- Modify `copilot-otel-bridge/README.md`, `VALIDATION.md`, and continuity docs.

### Task 1: Build the append-only evidence recorder

**Files:**
- Create: `copilot-otel-bridge/src/evidence.ts`
- Create: `copilot-otel-bridge/test/evidence.test.ts`

- [ ] **Step 1: Define run records**

Implement:

```ts
export type RunTerminalReason = 'pass' | 'failure' | 'abort' | 'security_incident';

export interface RunRecord {
  schema_version: '1.0.0';
  run_id: string;
  sequence: number;
  created_at: string;
  terminal_reason?: RunTerminalReason;
  previous_hash: string;
  manifest_hash: string;
  artifacts: Array<{ path: string; sha256: string; bytes: number }>;
  facts: Record<string, string | number | boolean>;
}

export async function appendRunRecord(path: string, record: RunRecord): Promise<void>;
export async function verifyRunChain(path: string): Promise<{ valid: boolean; count: number; error?: string }>;
```

Reject sequence gaps, previous-hash mismatches, duplicate run IDs, raw secret
matches in facts, and non-sanitized artifact paths.

- [ ] **Step 2: Add red/green tests**

Test first append, second append with correct previous hash, tampered record,
sequence gap, deliberate failure, and abort. Assert no raw or encoded synthetic
canary is accepted.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/evidence.test.ts
```

Expected: FAIL before implementation and PASS after implementation.

- [ ] **Step 4: Commit**

```powershell
git add copilot-otel-bridge/src/evidence.ts copilot-otel-bridge/test/evidence.test.ts
git commit -m "feat(otel): add append-only evidence chain"
```

### Task 2: Add API contracts, pagination, and ETags

**Files:**
- Create: `copilot-otel-bridge/src/api-contract.ts`
- Create: `copilot-otel-bridge/test/api-contract.test.ts`
- Modify: `copilot-otel-bridge/src/bridge.ts`

- [ ] **Step 1: Define validated response contracts**

Add types for:

```ts
export interface Page<T> {
  items: T[];
  next_cursor?: string;
  total: number;
  generated_at: string;
}

export function encodeCursor(index: number): string;
export function decodeCursor(value: string | undefined, total: number): number;
export function etagFor(value: unknown): string;
```

Use base64url cursors containing only an integer offset. Reject invalid,
negative, or out-of-range cursors with HTTP 400.

- [ ] **Step 2: Add endpoints**

Implement:

```text
GET /api/sessions/:id/conversation?cursor=&limit=
GET /api/sessions/:id/sources?kind=&cursor=&limit=
GET /api/sessions/:id/coverage
GET /api/sessions/:id/native-otel
GET /api/runs/:runId
```

Return `ETag` from `etagFor` and return `304` when `If-None-Match` matches.
Default limit is 100 and maximum is 1000. Raw source content is never
returned by these endpoints; source metadata and sanitized payload only.

- [ ] **Step 3: Test endpoint contracts**

Use a temporary ledger and native OTel fixture. Assert pagination, cursor
validation, ETags, 304 behavior, exact session filtering, and absence of the
synthetic canary.

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/api-contract.test.ts test/correlation-api.test.ts test/native-otel-api.test.ts
```

Expected: PASS.

### Task 3: Complete the forensic UI

**Files:**
- Modify: `copilot-otel-bridge/ui/index.html`
- Create: `copilot-otel-bridge/test/ui-contract.test.ts`

- [ ] **Step 1: Add the inspector panes**

Keep the existing sidebar and conversation pane. Add:

1. Trace inspector with trace/span/parent IDs, model, usage, timing, and
   source lane.
2. Source coverage table with disposition, match method, reason, and related
   IDs.
3. MCP lineage section with peer request, transport, outer trace, inner
   session, and subagent links.
4. Explicit cards for redacted, unavailable, invalid, unmatched, heuristic,
   deduplicated, and late events.

- [ ] **Step 2: Keep rendering safe**

Render all server strings through the existing text/Markdown escaping path.
Never use `innerHTML` for record payloads. Render raw source access as disabled
unless the response explicitly marks it as locally permitted.

- [ ] **Step 3: Add live refresh**

Poll `/api/sessions` and the selected conversation/coverage endpoints using
ETags. Preserve the selected session and scroll position. Update only changed
panels.

- [ ] **Step 4: Add UI contract tests**

Read the HTML as text and assert the inspector IDs, disposition labels, ETag
polling code, and absence of direct filesystem paths/credential patterns.

- [ ] **Step 5: Run UI checks**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/ui-contract.test.ts
pnpm --dir .\copilot-otel-bridge build
```

Expected: PASS and a successful production build.

### Task 4: Harden hook installation and spool replay

**Files:**
- Modify: `copilot-otel-bridge/src/generate-hooks.ts`
- Modify: `copilot-otel-bridge/scripts/install-hooks.ps1`
- Modify: `copilot-otel-bridge/scripts/install-hooks.sh`
- Create: `copilot-otel-bridge/test/hook-installation.test.ts`

- [ ] **Step 1: Make preview files non-loadable**

Keep generated previews outside `.json` filenames. `--apply` must remove only
the bridge's own duplicate configuration and preserve unrelated hook entries.

- [ ] **Step 2: Add verification output**

The generator must report the target path, exactly 14 selected event names,
handler path, content mode, and local bridge URL without printing environment
values.

- [ ] **Step 3: Test idempotency**

Apply twice and assert one bridge handler per event, no duplicate JSON config,
and preservation of unrelated hooks. Disconnect the bridge, run a hook, and
assert one sanitized spool file; reconnect and assert replay deletes only the
successfully consumed file.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/hook-installation.test.ts test/dedupe.test.ts
```

Expected: PASS.

### Task 5: Automate full live acceptance

**Files:**
- Create: `copilot-otel-bridge/scripts/run-acceptance.ps1`
- Create: `copilot-otel-bridge/scripts/run-acceptance.sh`
- Modify: `copilot-otel-bridge/README.md`
- Modify: `copilot-otel-bridge/VALIDATION.md`

- [ ] **Step 1: Implement pass/failure/abort sealing**

The script must:

1. Generate a unique run ID.
2. Start the local stack with proxy variables removed.
3. Verify bridge, Collector, and UI health.
4. Apply and verify the 14 hooks.
5. Run hook smoke.
6. Run an outer-agent -> `copilot-mcp` -> inner-Copilot session.
7. Verify native transcript, native OTel, hook, MCP, coverage, API, and UI
   records.
8. Capture DOM/screenshot metadata without embedding raw source content.
9. Run the canary scanner over all captured artifacts.
10. Append a `pass`, `failure`, or `abort` run record and sanitized runbook.

- [ ] **Step 2: Add deliberate failure mode**

Support `-InjectFailure` / `--inject-failure` that stops the Collector or
submits malformed input. The script must seal `failure` and preserve evidence
without printing the canary.

- [ ] **Step 3: Run both outcomes**

Run:

```powershell
.\copilot-otel-bridge\scripts\run-acceptance.ps1
.\copilot-otel-bridge\scripts\run-acceptance.ps1 -InjectFailure
```

Expected: one pass run with zero matches and one failed run with an explicit
failure reason and zero matches.

### Task 6: Final package, restart, and documentation gates

- [ ] **Step 1: Run package checks**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge check
pnpm --dir .\copilot-mcp check
bash -n .\copilot-otel-bridge\scripts\*.sh
```

Expected: all existing checks pass.

- [ ] **Step 2: Run restart/replay**

Stop and restart bridge/Collector/MCP. Verify the UI still sees prior
sanitized records, spool replay is idempotent, and native OTel offsets do not
duplicate records.

- [ ] **Step 3: Update documentation and continuity**

Update `README.md`, `VALIDATION.md`, all six `docs/continuity/*.md` files, and
the session `plan.md` with exact run IDs, commit hashes, source health, and
remaining non-blocking follow-ups. Do not include secret values or encoded
forms.

- [ ] **Step 4: Run the independent review**

Use the read-only security/evidence reviewer on the final diff and acceptance
artifacts. Resolve every release-blocking finding before sealing completion.

- [ ] **Step 5: Commit final documentation**

```powershell
git add copilot-otel-bridge copilot-mcp docs/continuity
git commit -m "feat(otel): complete local conversation observability"
```

