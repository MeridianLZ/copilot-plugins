# Copilot OTel Local Sanitized Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security blocker by making the bridge, Collector, hooks, and UI operational path local/no-proxy and by producing sanitized operational derivatives without rewriting sealed incident evidence.

**Architecture:** Keep the historical transcript and failed evidence immutable. Add a versioned sanitizer and local-runtime policy at every persistence/export boundary, then record a new append-only verification run that scans all operational surfaces with a synthetic canary.

**Tech Stack:** Node.js 22, TypeScript, `node:test`, PowerShell, Bash, OpenTelemetry bridge, Docker/WSL.

---

## Files and responsibilities

- Modify `copilot-otel-bridge/src/security.ts`: add proxy-aware redaction, encoded-secret detection, and structured disposition metadata.
- Modify `copilot-otel-bridge/src/types.ts`: define redaction and operational-record types.
- Create `copilot-otel-bridge/src/local-runtime.ts`: validate local telemetry endpoints, construct proxy-free child environments, and post to explicit local URLs without proxy agents.
- Modify `copilot-otel-bridge/src/config.ts`: enforce local endpoint policy for the bridge runtime.
- Modify `copilot-otel-bridge/src/bridge.ts`: apply the operational sanitizer before ledger/API output and expose policy health.
- Modify `copilot-otel-bridge/src/hook-egress.ts`: ensure hook HTTP/spool execution cannot route local telemetry through an inherited proxy.
- Create `copilot-otel-bridge/src/operational-mirror.ts`: write derived records with source hash, policy version, and disposition.
- Create `copilot-otel-bridge/test/local-runtime.test.ts`: test endpoint and environment policy.
- Modify `copilot-otel-bridge/test/security.test.ts`: cover raw, base64, percent-encoded, and proxy-URI canaries.
- Create `copilot-otel-bridge/scripts/verify-local-runtime.ps1`.
- Create `copilot-otel-bridge/scripts/verify-local-runtime.sh`.
- Modify `copilot-otel-bridge/README.md` and `VALIDATION.md`: document local/no-proxy operation and the new gate.

### Task 1: Add failing security and local-runtime tests

**Files:**
- Modify: `copilot-otel-bridge/test/security.test.ts`
- Create: `copilot-otel-bridge/test/local-runtime.test.ts`

- [ ] **Step 1: Add the synthetic canary tests**

Use a non-production fixture only:

```ts
const canary = 'http://canary-user:canary-pass@proxy.invalid:8080';
const base64 = Buffer.from(canary, 'utf8').toString('base64');
const encoded = encodeURIComponent(canary);
```

Assert that `sanitizeSecrets` never returns any of the three forms, and that
`findSecretMatches` reports the encoding class without returning the value.
Assert that `validateLocalTelemetryEndpoint('http://127.0.0.1:27432')` and
`validateLocalTelemetryEndpoint('http://172.28.233.212:27432')` pass while an
external host and an endpoint containing userinfo fail.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/security.test.ts test/local-runtime.test.ts
```

Expected: FAIL because `sanitizeSecrets`, `findSecretMatches`, and
`validateLocalTelemetryEndpoint` do not exist.

### Task 2: Implement the structured redaction policy

**Files:**
- Modify: `copilot-otel-bridge/src/security.ts`
- Modify: `copilot-otel-bridge/src/types.ts`

- [ ] **Step 1: Add the policy types**

Add:

```ts
export type RedactionKind =
  | 'raw'
  | 'base64'
  | 'url_encoded'
  | 'proxy_uri'
  | 'secret_pattern';

export interface SecretMatch {
  kind: RedactionKind;
  start: number;
  end: number;
}

export interface RedactionDisposition {
  redacted: boolean;
  policy_version: string;
  kinds: RedactionKind[];
  bytes: number;
}
```

- [ ] **Step 2: Add proxy-aware matching without returning secret text**

Implement `findSecretMatches(input: string): SecretMatch[]` with these rules:

1. Detect authenticated HTTP/HTTPS URI userinfo.
2. Detect `HTTP_PROXY=` and `HTTPS_PROXY=` assignments without logging their
   values.
3. Detect base64 and percent-encoded forms only when the decoded candidate
   contains authenticated proxy URI syntax.
4. Retain only offsets and kinds.

Implement `sanitizeSecrets(input: string): { text: string; disposition:
RedactionDisposition }`. Replace matched ranges with
`[REDACTED_<kind>]`, never include the matched text in an exception or log,
and preserve the existing GitHub/AWS/Bearer/API-key patterns.

- [ ] **Step 3: Route existing sanitization through the new policy**

Keep `sanitizeJson` and `redactSecrets` public for existing callers, but make
them call `sanitizeSecrets` so hook payloads and native content share the same
policy version.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/security.test.ts test/local-runtime.test.ts
```

Expected: PASS with all security tests green.

- [ ] **Step 5: Commit**

```powershell
git add copilot-otel-bridge/src/security.ts copilot-otel-bridge/src/types.ts copilot-otel-bridge/test/security.test.ts copilot-otel-bridge/test/local-runtime.test.ts
git commit -m "feat(otel): centralize proxy-aware redaction"
```

### Task 3: Enforce a proxy-free local runtime

**Files:**
- Create: `copilot-otel-bridge/src/local-runtime.ts`
- Modify: `copilot-otel-bridge/src/config.ts`
- Modify: `copilot-otel-bridge/src/bridge.ts`
- Modify: `copilot-otel-bridge/src/hook-egress.ts`
- Modify: `copilot-otel-bridge/test/local-runtime.test.ts`

- [ ] **Step 1: Implement endpoint and environment helpers**

Export:

```ts
export function validateLocalTelemetryEndpoint(endpoint: string): URL;
export function buildLocalNoProxyList(endpoint: URL): string;
export function proxyFreeEnvironment(
  environment: NodeJS.ProcessEnv,
  endpoint: URL
): NodeJS.ProcessEnv;
export function postLocalJson(
  endpoint: URL,
  body: string,
  timeoutMs: number
): Promise<void>;
```

Allow loopback and private WSL IPv4 addresses only. Reject URL userinfo,
non-HTTP(S) schemes, public addresses, and malformed ports. The returned
environment must delete `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and lowercase
variants, then merge `NO_PROXY` with `localhost`, `127.0.0.1`, `::1`, the
endpoint hostname, and private WSL ranges.

- [ ] **Step 2: Validate configuration at startup**

In `loadConfig`, validate `otlpTracesEndpoint` and store the parsed endpoint
host in a non-secret `localTelemetry` field. Do not read any file, registry
key, Git config, npm config, or shell profile.

- [ ] **Step 3: Apply the no-proxy request path to hook egress**

Implement `postLocalJson` with Node's `http.request` or `https.request` using
the parsed local URL and no proxy agent. Do not use global `fetch`, which may
honor inherited proxy settings in Node configurations that enable environment
proxy support. Keep the existing fail-open behavior: a bridge failure writes a
sanitized spool record and exits zero.

- [ ] **Step 4: Add health fields**

Extend `/health` with:

```json
{
  "local_runtime": true,
  "proxy_mode": "disabled",
  "telemetry_host": "127.0.0.1"
}
```

Never include proxy variables, credential-bearing URLs, or process environment
contents.

- [ ] **Step 5: Run focused tests and build**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/local-runtime.test.ts test/envelope.test.ts
pnpm --dir .\copilot-otel-bridge typecheck
```

Expected: PASS and exit code 0.

### Task 4: Create the sanitized operational mirror

**Files:**
- Create: `copilot-otel-bridge/src/operational-mirror.ts`
- Modify: `copilot-otel-bridge/src/bridge.ts`
- Modify: `copilot-otel-bridge/src/io.ts`
- Create: `copilot-otel-bridge/test/operational-mirror.test.ts`

- [ ] **Step 1: Define the derived-record contract**

Implement:

```ts
export interface OperationalRecord {
  schema_version: '1.0.0';
  record_id: string;
  source_kind: 'hook' | 'native_transcript' | 'native_otel' | 'mcp' | 'evidence';
  source_id: string;
  source_hash: string;
  created_at: string;
  policy_version: string;
  disposition: RedactionDisposition;
  payload: JsonValue;
}

export async function appendOperationalRecord(
  filePath: string,
  record: OperationalRecord
): Promise<void>;
```

Hash the pre-sanitized source only in memory, sanitize the payload, and persist
the derived record with mode `0600`. The function must reject a payload when
`findSecretMatches(JSON.stringify(payload))` returns a match after sanitization.

- [ ] **Step 2: Test append-only and leak rejection**

Test two records append in order, source hashes differ, and a record containing
the synthetic raw/base64/encoded canary is rejected unless its payload is fully
redacted.

- [ ] **Step 3: Integrate bridge persistence and API output**

Write hook events to the operational mirror before they become visible to the
API/UI. Preserve the existing ledger for compatibility, but ensure all normal
runtime consumers use the mirror path.

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge test -- test/operational-mirror.test.ts test/security.test.ts
```

Expected: PASS with zero canary leakage.

### Task 5: Add the local verification command

**Files:**
- Create: `copilot-otel-bridge/scripts/verify-local-runtime.ps1`
- Create: `copilot-otel-bridge/scripts/verify-local-runtime.sh`
- Modify: `copilot-otel-bridge/README.md`
- Modify: `copilot-otel-bridge/VALIDATION.md`

- [ ] **Step 1: Implement the verifier**

The verifier must:

1. Generate a unique run ID and a synthetic canary in memory.
2. Start bridge/Collector/UI with proxy variables removed.
3. Run the existing hook smoke path.
4. Capture only sanitized stdout/stderr, health, listener addresses, API output,
   and file manifests.
5. Search all captured artifacts for raw, base64, percent-encoded, username,
   password, and URI forms.
6. Write an append-only `verification.json` and `RUNBOOK.md` containing only
   hashes, counts, policy version, and pass/fail reason.
7. Exit nonzero on any match or missing local-runtime assertion.

- [ ] **Step 2: Document the command**

Document:

```powershell
.\scripts\verify-local-runtime.ps1
```

and:

```bash
./scripts/verify-local-runtime.sh
```

State explicitly that the historical failed run is not rewritten.

- [ ] **Step 3: Run the package gate**

Run:

```powershell
pnpm --dir .\copilot-otel-bridge check
```

Expected: typecheck, tests, and build all pass.

- [ ] **Step 4: Commit**

```powershell
git add copilot-otel-bridge/src copilot-otel-bridge/test copilot-otel-bridge/scripts copilot-otel-bridge/README.md copilot-otel-bridge/VALIDATION.md
git commit -m "feat(otel): enforce local sanitized runtime"
```

### Task 6: Run and seal the blocker checkpoint

- [ ] **Step 1: Start a new shell with proxy variables absent**

Do not source `.env.local`, inspect registry values, or pass proxy variables to
the bridge/Collector/UI process tree.

- [ ] **Step 2: Run the verifier**

Run:

```powershell
.\copilot-otel-bridge\scripts\verify-local-runtime.ps1
```

Expected: `terminal_reason=pass`, `local_runtime=true`, and zero canary matches.

- [ ] **Step 3: Verify the historical run remains unchanged**

Compare the sealed incident artifact hashes with the values recorded in
`docs/security/incidents/2026-08-08-proxy-credential-exposure.md`. Do not edit
the original transcript or evidence directory.

- [ ] **Step 4: Record the continuity update**

Update `docs/continuity/CURRENT_TASK_STATE.md`, `TASKS.md`, `PLANS.md`,
`SESSION_LOG.md`, `REMEMBER.md`, and `INSTRUCTIONAL_INSIGHTS.md` with the new
run ID, result, policy version, and the fact that the blocker was closed by a
local/no-proxy proof.

- [ ] **Step 5: Commit the recorded checkpoint**

```powershell
git add docs/continuity
git commit -m "docs(otel): record local runtime checkpoint"
```
