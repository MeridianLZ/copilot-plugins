# Mapping OpenTelemetry Traces to Every GitHub Copilot CLI Hook

**A complete, runnable tutorial** — hook → span mapping for all 13 lifecycle events, with a datapipe that:

```
Copilot CLI hook fires
   → Node emitter (per-event process, hand-built OTLP/JSON)
   → appends one OTLP/JSON ResourceSpans line to ~/.copilot-otel/traces.jsonl   ← the egress boundary
   → tailer pretty-prints the live span stream to console
   → tailer POSTs each line to the Node consumer endpoint (:4319)
   → consumer dumps the fully decoded trace (attributes + links) and forwards to the OTel Collector (:4318)
```

Granularity is **verbatim-transcript grade**: full prompts, transformed prompts, tool args, complete tool result text, subagent responses, and error stacks are carried as span attributes. Pre/post tool events are **point-in-time spans**; the record of what happened *between* them is a **span link** on the post span pointing at the pre span, carrying interval attributes (`duration_ms`, outcome, result text).

The JSONL file being the egress boundary makes this harness-agnostic: on bare metal the tailer reads it directly; inside a container you volume-mount `~/.copilot-otel` and run the tailer/consumer on the host (or in a sidecar). Nothing in the emitter assumes an environment.

---

## 0. Prerequisites & layout

- Node ≥ 20, pnpm, Docker (compose v2), Copilot CLI ≥ GA (Feb 2026).
- Repo location: `/Volumes/MACDEV/copilot-otel-hooks`
- Runtime home: `~/.copilot-otel/` (`traces.jsonl`, `state/<sessionId>.json`)

```
copilot-otel-hooks/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── emit.ts          # hook-side emitter (bin: copilot-otel-emit)
│   ├── tail.ts          # tailer + shipper (bin: copilot-otel-tail)
│   ├── consumer.ts      # OTLP/JSON receiver + trace dumper (bin: copilot-otel-consumer)
│   └── otlp.ts          # shared OTLP/JSON construction + types
├── hooks/
│   └── otel.json        # → copy to ~/.copilot/hooks/otel.json
├── collector/
│   └── otel-collector-config.yaml
└── compose.yml
```

---

## 1. The hook surface being instrumented (ground truth, current docs)

All 13 events, their payload → span mapping, and link topology:

| Hook event | Span name | Span kind | Parent | Links |
|---|---|---|---|---|
| `sessionStart` | `copilot.session` (root, **pending**) + `copilot.hook.sessionStart` | INTERNAL | — / root | — |
| `userPromptSubmitted` | `copilot.hook.userPromptSubmitted` | INTERNAL | root | — |
| `userPromptTransformed` | `copilot.hook.userPromptTransformed` | INTERNAL | root | → last `userPromptSubmitted` (prompt lineage) |
| `preToolUse` | `copilot.hook.preToolUse` | INTERNAL | root | — (registered as pending interval origin) |
| `postToolUse` | `copilot.hook.postToolUse` | INTERNAL | root | **→ matching `preToolUse`** with interval attrs |
| `postToolUseFailure` | `copilot.hook.postToolUseFailure` | INTERNAL | root | **→ matching `preToolUse`** with interval attrs (`outcome=failure`) |
| `permissionRequest` | `copilot.hook.permissionRequest` | INTERNAL | root | — |
| `notification` | `copilot.hook.notification` | INTERNAL | root | — |
| `preCompact` | `copilot.hook.preCompact` | INTERNAL | root | — |
| `subagentStart` | `copilot.hook.subagentStart` | INTERNAL | root | — (registered as pending, keyed by `agentName`) |
| `subagentStop` | `copilot.hook.subagentStop` | INTERNAL | root | **→ matching `subagentStart`** with interval attrs |
| `agentStop` | `copilot.hook.agentStop` | INTERNAL | root | — |
| `errorOccurred` | `copilot.hook.errorOccurred` | INTERNAL | root | — |
| `sessionEnd` | `copilot.hook.sessionEnd` **+ root span finalized** with true start/end | INTERNAL | root | — |

Key mechanics from the hooks reference you must respect:

- Hooks receive the payload **on stdin** as JSON and are short-lived processes — trace continuity must live outside the process. We persist `{traceId, rootSpanId, rootStartUnixNano, pendingTools: [...], pendingSubagents: [...], lastPromptSpan}` in `~/.copilot-otel/state/<sessionId>.json`. `sessionId` appears in every payload and is the join key.
- **Matching pre↔post**: payloads carry no tool-call id, so matching is FIFO per `toolName`. Correct for serial tool use; concurrent same-name tools can cross-match (documented limitation — flagged with `copilot.link.match: "fifo"`).
- Stdout is parsed for decisions on `preToolUse`/`permissionRequest`/`agentStop`. **Our emitter must write nothing to stdout** (observe-only) — everything diagnostic goes to stderr. A stray stdout JSON object on `preToolUse` would be interpreted as a permission decision; a crash on `preToolUse` **fail-closes and denies the tool call**, so the emitter wraps everything in a top-level try/catch and always exits 0.
- We use the **camelCase** event names/payloads (native format; epoch-ms timestamps convert directly to OTLP nanos).

## 2. Verbatim-transcript attributes

We carry the *full* payload. Attribute table (all prefixed `copilot.` except GenAI semconv):

- Common: `copilot.session.id`, `copilot.cwd`, `copilot.hook.event`, `copilot.timestamp_ms`
- Prompts: `gen_ai.prompt` (full `prompt`), `copilot.prompt.transformed` (full `transformedPrompt`)
- Tools: `copilot.tool.name`, `copilot.tool.args` (full JSON string), `gen_ai.tool.name`
- Results: `copilot.tool.result.text` (full `textResultForLlm`), `copilot.tool.result.type`
- Failure: `copilot.tool.error` (full error text)
- Subagents: `copilot.agent.name`, `copilot.agent.display_name`, `copilot.agent.description`, `copilot.agent.id`, `copilot.agent.type`, `gen_ai.completion` = full `response`
- Stops: `copilot.stop.reason`, `copilot.stop.hook_active`, `copilot.transcript_path`
- Errors: `copilot.error.message`, `copilot.error.name`, `copilot.error.stack`, `copilot.error.context`, `copilot.error.recoverable`
- Session: `copilot.session.source` / `copilot.session.end_reason`, `copilot.session.initial_prompt`
- Notification: `copilot.notification.type`, `copilot.notification.title`, `copilot.notification.message`
- Compaction: `copilot.compact.trigger`, `copilot.compact.custom_instructions`
- Permission: full `toolArgs` again (this is the pre-permission-service view)

Because we hand-construct OTLP JSON (no OTel SDK in the emitter), **no default attribute-length limits apply** — nothing is truncated. Interval **link attributes**: `copilot.interval.duration_ms`, `copilot.interval.outcome` (`success|failure`), `copilot.interval.result_excerpt` is NOT used — the full result already lives on the post span; the link carries the timing + outcome + `copilot.link.match`.

For the *other half* of the verbatim transcript (model thinking, token counts, the CLI's own tool spans), we run the CLI's **native OTel export in parallel** into the same collector (§8): `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`. Correlate the two streams on the shared `copilot.session.id` / session-id attribute.

---

## 3. Package scaffolding

`package.json`
```json
{
  "name": "copilot-otel-hooks",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "copilot-otel-emit": "./dist/emit.js",
    "copilot-otel-tail": "./dist/tail.js",
    "copilot-otel-consumer": "./dist/consumer.js"
  },
  "scripts": {
    "build": "tsup",
    "link": "pnpm build && pnpm link --global"
  },
  "devDependencies": {
    "tsup": "^8.4.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.10.0"
  }
}
```

`tsup.config.ts`
```ts
import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/emit.ts", "src/tail.ts", "src/consumer.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

`tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

```bash
cd /Volumes/MACDEV/copilot-otel-hooks
pnpm install
pnpm build && pnpm link --global   # exposes the three bins on PATH
```

---

## 4. `src/otlp.ts` — OTLP/JSON construction (traces, attributes, links)

```ts
import { randomBytes } from "node:crypto";

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes: Record<string, unknown>;
}

export interface SpanInput {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startUnixNano: string;
  endUnixNano: string;
  attributes: Record<string, unknown>;
  links?: SpanLink[];
  statusCode?: 1 | 2; // 1=OK, 2=ERROR
  statusMessage?: string;
}

export const newTraceId = (): string => randomBytes(16).toString("hex");
export const newSpanId = (): string => randomBytes(8).toString("hex");
export const msToNano = (ms: number): string => (BigInt(ms) * 1_000_000n).toString();

/** OTLP/JSON AnyValue encoding — string/bool/int/double/json-serialized fallback */
function anyValue(v: unknown): Record<string, unknown> {
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  return { stringValue: JSON.stringify(v) };
}

function kvList(attrs: Record<string, unknown>): Array<Record<string, unknown>> {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => ({ key, value: anyValue(value) }));
}

/** Build one complete OTLP/JSON ExportTraceServiceRequest ({resourceSpans}) for N spans. */
export function buildResourceSpans(spans: SpanInput[]): Record<string, unknown> {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: kvList({
            "service.name": "copilot-cli-hooks",
            "service.namespace": "copilot-otel",
            "telemetry.sdk.name": "copilot-otel-hooks",
            "telemetry.sdk.language": "nodejs",
          }),
        },
        scopeSpans: [
          {
            scope: { name: "copilot-otel-hooks", version: "1.0.0" },
            spans: spans.map((s) => ({
              traceId: s.traceId,
              spanId: s.spanId,
              parentSpanId: s.parentSpanId ?? "",
              name: s.name,
              kind: 1, // SPAN_KIND_INTERNAL
              startTimeUnixNano: s.startUnixNano,
              endTimeUnixNano: s.endUnixNano,
              attributes: kvList(s.attributes),
              links: (s.links ?? []).map((l) => ({
                traceId: l.traceId,
                spanId: l.spanId,
                attributes: kvList(l.attributes),
              })),
              status:
                s.statusCode !== undefined
                  ? { code: s.statusCode, message: s.statusMessage ?? "" }
                  : {},
            })),
          },
        ],
      },
    ],
  };
}
```

---

## 5. `src/emit.ts` — the hook-side emitter

Invoked once per hook firing as `copilot-otel-emit <eventName>`; payload arrives on stdin. **Never writes to stdout.** Always exits 0 (a crash on `preToolUse` would deny the tool call, since command `preToolUse` hooks are fail-closed on non-timeout errors).

```ts
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildResourceSpans, msToNano, newSpanId, newTraceId,
  type SpanInput, type SpanLink,
} from "./otlp.js";

const HOME = process.env.COPILOT_OTEL_HOME ?? join(homedir(), ".copilot-otel");
const JSONL = join(HOME, "traces.jsonl");
const STATE_DIR = join(HOME, "state");

interface PendingSpan { spanId: string; traceId: string; startedAtMs: number; key: string; }
interface SessionState {
  traceId: string;
  rootSpanId: string;
  rootStartMs: number;
  pendingTools: PendingSpan[];      // FIFO, key = toolName
  pendingSubagents: PendingSpan[];  // FIFO, key = agentName
  lastPromptSpanId?: string;
}

function loadState(sessionId: string, nowMs: number): SessionState {
  const p = join(STATE_DIR, `${sessionId}.json`);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as SessionState;
  return { traceId: newTraceId(), rootSpanId: newSpanId(), rootStartMs: nowMs, pendingTools: [], pendingSubagents: [] };
}
function saveState(sessionId: string, s: SessionState): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, `${sessionId}.json`), JSON.stringify(s));
}
function takeFifo(list: PendingSpan[], key: string): PendingSpan | undefined {
  const i = list.findIndex((e) => e.key === key);
  return i >= 0 ? list.splice(i, 1)[0] : undefined;
}
function readStdin(): string {
  try { return readFileSync(0, "utf8"); } catch { return "{}"; }
}

function main(): void {
  const event = process.argv[2] ?? "unknown";
  const raw = readStdin();
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { /* keep {} */ }

  const sessionId = String(payload["sessionId"] ?? "unknown-session");
  const tsMs = typeof payload["timestamp"] === "number" ? (payload["timestamp"] as number) : Date.now();
  const state = loadState(sessionId, tsMs);

  const base: Record<string, unknown> = {
    "copilot.hook.event": event,
    "copilot.session.id": sessionId,
    "copilot.cwd": payload["cwd"],
    "copilot.timestamp_ms": tsMs,
  };

  const spanId = newSpanId();
  const links: SpanLink[] = [];
  const attrs: Record<string, unknown> = { ...base };
  let statusCode: 1 | 2 | undefined;
  let statusMessage: string | undefined;
  const extraSpans: SpanInput[] = [];

  switch (event) {
    case "sessionStart":
      attrs["copilot.session.source"] = payload["source"];
      attrs["copilot.session.initial_prompt"] = payload["initialPrompt"];
      state.rootStartMs = tsMs;
      break;

    case "userPromptSubmitted":
      attrs["gen_ai.prompt"] = payload["prompt"];
      state.lastPromptSpanId = spanId;
      break;

    case "userPromptTransformed":
      attrs["gen_ai.prompt"] = payload["prompt"];
      attrs["copilot.prompt.transformed"] = payload["transformedPrompt"];
      if (state.lastPromptSpanId) {
        links.push({
          traceId: state.traceId,
          spanId: state.lastPromptSpanId,
          attributes: { "copilot.link.kind": "prompt_lineage" },
        });
      }
      break;

    case "preToolUse": {
      const toolName = String(payload["toolName"] ?? "");
      attrs["copilot.tool.name"] = toolName;
      attrs["gen_ai.tool.name"] = toolName;
      attrs["copilot.tool.args"] = JSON.stringify(payload["toolArgs"] ?? null);
      state.pendingTools.push({ spanId, traceId: state.traceId, startedAtMs: tsMs, key: toolName });
      break;
    }

    case "postToolUse":
    case "postToolUseFailure": {
      const toolName = String(payload["toolName"] ?? "");
      attrs["copilot.tool.name"] = toolName;
      attrs["gen_ai.tool.name"] = toolName;
      attrs["copilot.tool.args"] = JSON.stringify(payload["toolArgs"] ?? null);
      const failure = event === "postToolUseFailure";
      if (failure) {
        attrs["copilot.tool.error"] = payload["error"];
        statusCode = 2; statusMessage = String(payload["error"] ?? "tool failure");
      } else {
        const result = payload["toolResult"] as Record<string, unknown> | undefined;
        attrs["copilot.tool.result.type"] = result?.["resultType"];
        attrs["copilot.tool.result.text"] = result?.["textResultForLlm"];
        statusCode = 1;
      }
      const pre = takeFifo(state.pendingTools, toolName);
      if (pre) {
        // THE interval record: link post → pre, carrying what happened in between.
        links.push({
          traceId: pre.traceId,
          spanId: pre.spanId,
          attributes: {
            "copilot.link.kind": "tool_interval",
            "copilot.link.match": "fifo",
            "copilot.interval.duration_ms": tsMs - pre.startedAtMs,
            "copilot.interval.outcome": failure ? "failure" : "success",
            "copilot.interval.tool": toolName,
          },
        });
      }
      break;
    }

    case "permissionRequest":
      attrs["copilot.tool.name"] = payload["toolName"];
      attrs["copilot.tool.args"] = JSON.stringify(payload["toolArgs"] ?? null);
      break;

    case "notification":
      attrs["copilot.notification.type"] = payload["notification_type"];
      attrs["copilot.notification.title"] = payload["title"];
      attrs["copilot.notification.message"] = payload["message"];
      break;

    case "preCompact":
      attrs["copilot.compact.trigger"] = payload["trigger"];
      attrs["copilot.compact.custom_instructions"] = payload["customInstructions"];
      attrs["copilot.transcript_path"] = payload["transcriptPath"];
      break;

    case "subagentStart": {
      const agentName = String(payload["agentName"] ?? "");
      attrs["copilot.agent.name"] = agentName;
      attrs["copilot.agent.display_name"] = payload["agentDisplayName"];
      attrs["copilot.agent.description"] = payload["agentDescription"];
      attrs["copilot.transcript_path"] = payload["transcriptPath"];
      state.pendingSubagents.push({ spanId, traceId: state.traceId, startedAtMs: tsMs, key: agentName });
      break;
    }

    case "subagentStop": {
      const agentName = String(payload["agentName"] ?? "");
      attrs["copilot.agent.name"] = agentName;
      attrs["copilot.agent.id"] = payload["agentId"];
      attrs["copilot.agent.type"] = payload["agentType"];
      attrs["copilot.agent.display_name"] = payload["agentDisplayName"];
      attrs["gen_ai.completion"] = payload["response"]; // full final subagent response text
      attrs["copilot.stop.reason"] = payload["stopReason"];
      attrs["copilot.transcript_path"] = payload["transcriptPath"];
      const start = takeFifo(state.pendingSubagents, agentName);
      if (start) {
        links.push({
          traceId: start.traceId,
          spanId: start.spanId,
          attributes: {
            "copilot.link.kind": "subagent_interval",
            "copilot.link.match": "fifo",
            "copilot.interval.duration_ms": tsMs - start.startedAtMs,
            "copilot.interval.outcome": "success",
            "copilot.interval.agent": agentName,
          },
        });
      }
      break;
    }

    case "agentStop":
      attrs["copilot.stop.reason"] = payload["stopReason"];
      attrs["copilot.stop.hook_active"] = payload["stop_hook_active"];
      attrs["copilot.transcript_path"] = payload["transcriptPath"];
      break;

    case "errorOccurred": {
      const err = payload["error"] as Record<string, unknown> | undefined;
      attrs["copilot.error.message"] = err?.["message"];
      attrs["copilot.error.name"] = err?.["name"];
      attrs["copilot.error.stack"] = err?.["stack"];
      attrs["copilot.error.context"] = payload["errorContext"];
      attrs["copilot.error.recoverable"] = payload["recoverable"];
      statusCode = 2; statusMessage = String(err?.["message"] ?? "error");
      break;
    }

    case "sessionEnd": {
      attrs["copilot.session.end_reason"] = payload["reason"];
      // Finalize the root session span with true start/end.
      extraSpans.push({
        traceId: state.traceId,
        spanId: state.rootSpanId,
        name: "copilot.session",
        startUnixNano: msToNano(state.rootStartMs),
        endUnixNano: msToNano(tsMs),
        attributes: {
          "copilot.session.id": sessionId,
          "copilot.session.end_reason": payload["reason"],
          "copilot.session.duration_ms": tsMs - state.rootStartMs,
        },
        statusCode: payload["reason"] === "error" ? 2 : 1,
      });
      break;
    }
  }

  const hookSpan: SpanInput = {
    traceId: state.traceId,
    spanId,
    parentSpanId: state.rootSpanId,
    name: `copilot.hook.${event}`,
    startUnixNano: msToNano(tsMs), // point-in-time span: start === end
    endUnixNano: msToNano(tsMs),
    attributes: attrs,
    links,
    statusCode,
    statusMessage,
  };

  const line = JSON.stringify(buildResourceSpans([hookSpan, ...extraSpans]));
  mkdirSync(HOME, { recursive: true });
  appendFileSync(JSONL, line + "\n");

  if (event === "sessionEnd") {
    try { unlinkSync(join(STATE_DIR, `${sessionId}.json`)); } catch { /* ignore */ }
  } else {
    saveState(sessionId, state);
  }
}

try { main(); } catch (e) {
  process.stderr.write(`copilot-otel-emit: ${String(e)}\n`);
}
process.exit(0); // NEVER fail — preToolUse command hooks are fail-closed on errors
```

---

## 6. Hooks configuration — `~/.copilot/hooks/otel.json` (all 13 events)

User-level so it applies to every project. `matcher` omitted everywhere = fire for everything.

```json
{
  "version": 1,
  "hooks": {
    "sessionStart":         [{ "type": "command", "bash": "copilot-otel-emit sessionStart", "timeoutSec": 10 }],
    "sessionEnd":           [{ "type": "command", "bash": "copilot-otel-emit sessionEnd", "timeoutSec": 10 }],
    "userPromptSubmitted":  [{ "type": "command", "bash": "copilot-otel-emit userPromptSubmitted", "timeoutSec": 10 }],
    "userPromptTransformed":[{ "type": "command", "bash": "copilot-otel-emit userPromptTransformed", "timeoutSec": 10 }],
    "preToolUse":           [{ "type": "command", "bash": "copilot-otel-emit preToolUse", "timeoutSec": 10 }],
    "postToolUse":          [{ "type": "command", "bash": "copilot-otel-emit postToolUse", "timeoutSec": 10 }],
    "postToolUseFailure":   [{ "type": "command", "bash": "copilot-otel-emit postToolUseFailure", "timeoutSec": 10 }],
    "permissionRequest":    [{ "type": "command", "bash": "copilot-otel-emit permissionRequest", "timeoutSec": 10 }],
    "notification":         [{ "type": "command", "bash": "copilot-otel-emit notification", "timeoutSec": 10 }],
    "preCompact":           [{ "type": "command", "bash": "copilot-otel-emit preCompact", "timeoutSec": 10 }],
    "subagentStart":        [{ "type": "command", "bash": "copilot-otel-emit subagentStart", "timeoutSec": 10 }],
    "subagentStop":         [{ "type": "command", "bash": "copilot-otel-emit subagentStop", "timeoutSec": 10 }],
    "agentStop":            [{ "type": "command", "bash": "copilot-otel-emit agentStop", "timeoutSec": 10 }],
    "errorOccurred":        [{ "type": "command", "bash": "copilot-otel-emit errorOccurred", "timeoutSec": 10 }]
  }
}
```

(That's 14 entries — `errorOccurred` rides along with the 13-event model above; both `postToolUse` and `postToolUseFailure` count as the post-side of the tool interval.)

Notes:
- Timeouts fail **open** in Copilot CLI, so a slow emitter can never block a tool call.
- `preToolUse` output-parsing hazard: our emitter is stdout-silent, so it never accidentally emits a permission decision.
- The `general-purpose` built-in agent does not emit subagent events; `explore`, `task`, `code-review`, `research`, custom agents, etc. do.

---

## 7. The datapipe

### 7.1 `src/tail.ts` — tailed console + shipper to the consumer

```ts
import { openSync, readSync, statSync, existsSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = process.env.COPILOT_OTEL_HOME ?? join(homedir(), ".copilot-otel");
const JSONL = join(HOME, "traces.jsonl");
const CONSUMER = process.env.COPILOT_OTEL_CONSUMER ?? "http://localhost:4319/v1/traces";
const C = { dim: "\x1b[2m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", green: "\x1b[32m", reset: "\x1b[0m" };

function attrsOf(span: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of (span["attributes"] as Array<Record<string, unknown>> | undefined) ?? []) {
    const v = kv["value"] as Record<string, unknown>;
    out[String(kv["key"])] = v["stringValue"] ?? v["intValue"] ?? v["boolValue"] ?? v["doubleValue"];
  }
  return out;
}

function prettyLine(line: string): void {
  let doc: Record<string, unknown>;
  try { doc = JSON.parse(line) as Record<string, unknown>; } catch { return; }
  const rs = (doc["resourceSpans"] as Array<Record<string, unknown>>) ?? [];
  for (const r of rs)
    for (const ss of (r["scopeSpans"] as Array<Record<string, unknown>>) ?? [])
      for (const span of (ss["spans"] as Array<Record<string, unknown>>) ?? []) {
        const a = attrsOf(span);
        const links = (span["links"] as Array<Record<string, unknown>>) ?? [];
        const linkNote = links.length
          ? ` ${C.yellow}⇠ link(${links.map((l) => {
              const la = attrsOf(l);
              return `${la["copilot.link.kind"]}${la["copilot.interval.duration_ms"] !== undefined ? ` ${la["copilot.interval.duration_ms"]}ms ${la["copilot.interval.outcome"]}` : ""}`;
            }).join(", ")})${C.reset}`
          : "";
        const status = (span["status"] as Record<string, unknown> | undefined)?.["code"];
        const mark = status === 2 ? `${C.red}✗${C.reset}` : `${C.green}●${C.reset}`;
        process.stdout.write(
          `${mark} ${C.cyan}${String(span["name"])}${C.reset}` +
          ` ${C.dim}sid=${String(a["copilot.session.id"] ?? "").slice(0, 8)} trace=${String(span["traceId"]).slice(0, 8)} span=${String(span["spanId"]).slice(0, 8)}${C.reset}` +
          (a["copilot.tool.name"] ? ` tool=${String(a["copilot.tool.name"])}` : "") +
          (a["copilot.agent.name"] ? ` agent=${String(a["copilot.agent.name"])}` : "") +
          linkNote + "\n",
        );
      }
}

async function ship(line: string): Promise<void> {
  try {
    await fetch(CONSUMER, { method: "POST", headers: { "content-type": "application/json" }, body: line });
  } catch (e) {
    process.stderr.write(`${C.red}ship failed:${C.reset} ${String(e)}\n`);
  }
}

async function tail(): Promise<void> {
  let offset = existsSync(JSONL) ? statSync(JSONL).size : 0;
  let carry = "";
  process.stdout.write(`${C.dim}tailing ${JSONL} → ${CONSUMER}${C.reset}\n`);
  setInterval(() => {
    if (!existsSync(JSONL)) return;
    const size = statSync(JSONL).size;
    if (size < offset) offset = 0; // rotated/truncated
    if (size === offset) return;
    const fd = openSync(JSONL, "r");
    const buf = Buffer.alloc(size - offset);
    readSync(fd, buf, 0, buf.length, offset);
    closeSync(fd);
    offset = size;
    carry += buf.toString("utf8");
    const parts = carry.split("\n");
    carry = parts.pop() ?? "";
    for (const line of parts.filter((l) => l.trim().length > 0)) {
      prettyLine(line);
      void ship(line);
    }
  }, 250);
}
void tail();
```

### 7.2 `src/consumer.ts` — the final endpoint: decode, dump, forward

Accepts OTLP/JSON POSTs on `:4319/v1/traces` (from the tailer *and* directly usable as an OTLP endpoint), dumps the complete decoded trace — every attribute, every link with its link-attributes — then forwards verbatim to the collector on `:4318`.

```ts
import { createServer } from "node:http";

const PORT = Number(process.env.COPILOT_OTEL_CONSUMER_PORT ?? 4319);
const FORWARD = process.env.COPILOT_OTEL_FORWARD ?? "http://localhost:4318/v1/traces";

function decodeAttrs(list: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of (list as Array<Record<string, unknown>>) ?? []) {
    const v = kv["value"] as Record<string, unknown>;
    out[String(kv["key"])] = v["stringValue"] ?? v["intValue"] ?? v["boolValue"] ?? v["doubleValue"];
  }
  return out;
}

function dump(doc: Record<string, unknown>): void {
  for (const r of (doc["resourceSpans"] as Array<Record<string, unknown>>) ?? []) {
    const res = decodeAttrs((r["resource"] as Record<string, unknown> | undefined)?.["attributes"]);
    for (const ss of (r["scopeSpans"] as Array<Record<string, unknown>>) ?? []) {
      for (const span of (ss["spans"] as Array<Record<string, unknown>>) ?? []) {
        const a = decodeAttrs(span["attributes"]);
        console.log("━".repeat(100));
        console.log(`SPAN ${String(span["name"])}`);
        console.log(`  service=${String(res["service.name"])} trace=${String(span["traceId"])} span=${String(span["spanId"])} parent=${String(span["parentSpanId"] || "-")}`);
        console.log(`  start=${String(span["startTimeUnixNano"])} end=${String(span["endTimeUnixNano"])} status=${JSON.stringify(span["status"])}`);
        console.log(`  ATTRIBUTES:`);
        for (const [k, v] of Object.entries(a)) console.log(`    ${k} = ${String(v)}`);
        const links = (span["links"] as Array<Record<string, unknown>>) ?? [];
        if (links.length) {
          console.log(`  LINKS:`);
          for (const l of links) {
            const la = decodeAttrs(l["attributes"]);
            console.log(`    → trace=${String(l["traceId"])} span=${String(l["spanId"])}`);
            for (const [k, v] of Object.entries(la)) console.log(`        ${k} = ${String(v)}`);
          }
        }
      }
    }
  }
}

createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/v1/traces")) {
    res.writeHead(404); res.end(); return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    try { dump(JSON.parse(body) as Record<string, unknown>); } catch (e) { console.error("decode failed:", e); }
    fetch(FORWARD, { method: "POST", headers: { "content-type": "application/json" }, body })
      .catch((e: unknown) => console.error("forward failed:", String(e)));
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
}).listen(PORT, () => console.log(`copilot-otel-consumer on :${PORT} → forwarding to ${FORWARD}`));
```

### 7.3 Collector — `compose.yml` + config

`compose.yml` (config offloaded to the yml per your convention; note: the official collector image is distroless — there is no Alpine variant, which is the explicit reason for deviating from Alpine here):

```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.116.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./collector/otel-collector-config.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "4318:4318"   # OTLP HTTP (json + protobuf) — native CLI export AND consumer forwarding land here
    healthcheck:
      test: ["CMD", "/otelcol-contrib", "--version"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
```

`collector/otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch: {}

exporters:
  debug:
    verbosity: detailed   # dumps every span, attribute, and link to collector stdout

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
```

Swap/add an exporter (Jaeger, Langfuse, Honeycomb, Grafana Tempo) later without touching anything upstream — that's the point of the collector being terminal.

---

## 8. Native CLI OTel in parallel (the other half of the verbatim transcript)

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/json"        # CLI supports http/json + http/protobuf only, no gRPC
export OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT="true"  # prompts, responses, tool content
# COPILOT_OTEL_ENABLED=true is implied once the endpoint is set
```

Now the collector receives **two resource streams**: `service.name=copilot-cli-hooks` (ours, hook-lifecycle spans + interval links) and the CLI's native GenAI-semconv spans (model calls, token counts, its own tool/permission/hook spans). Correlate them on the session-id attribute. If you later drive the CLI via the Copilot SDK, enable trace-context propagation (`traceparent`/`tracestate` on JSON-RPC) to fuse them into a single distributed trace instead of two correlated ones.

---

## 9. Run it end to end

Terminal A — collector: `docker compose up`
Terminal B — consumer: `copilot-otel-consumer`
Terminal C — tailer: `copilot-otel-tail`
Terminal D — the session:

```bash
mkdir -p ~/.copilot/hooks && cp hooks/otel.json ~/.copilot/hooks/otel.json
copilot   # run any prompt that triggers tool use, e.g. "list the files here and summarize package.json"
```

Expected, in order:
1. Terminal C: `● copilot.hook.sessionStart …`, `● copilot.hook.userPromptSubmitted …`, `● copilot.hook.preToolUse … tool=bash`, `● copilot.hook.postToolUse … tool=bash ⇠ link(tool_interval 412ms success)` — the link annotation *is* your interval record.
2. Terminal B: full decoded dumps — every attribute (including the complete `copilot.tool.result.text` and full prompts) and every link with its attributes.
3. Terminal A: the collector's `debug` exporter printing both your hook spans and the CLI's native GenAI spans.
4. `~/.copilot-otel/traces.jsonl`: one OTLP/JSON document per line — replayable into any OTLP endpoint verbatim: `while read -r l; do curl -sS -X POST -H 'content-type: application/json' -d "$l" http://localhost:4318/v1/traces; done < ~/.copilot-otel/traces.jsonl`

## 10. Containerized-harness variant

Nothing in the emitter changes. Mount the runtime home out of the container and run the tail/consumer wherever you like:

```yaml
# fragment for any harness compose.yml
services:
  agent-harness:
    volumes:
      - copilot-otel:/root/.copilot-otel
    environment:
      COPILOT_OTEL_HOME: /root/.copilot-otel
volumes:
  copilot-otel:
```

The JSONL file crossing the volume boundary **is** the egress; the host-side tailer picks it up identically. (Cloud agent caveat: its sandbox filesystem is ephemeral and its firewall blocks arbitrary hosts — there, switch the same events to `type: "http"` hooks pointed at an allow-listed receiver instead of the file pipe.)

## 11. Known limitations (documented, not hidden)

1. **FIFO pre↔post matching** — payloads carry no tool-call id; concurrent identical tool names can cross-match (`copilot.link.match: "fifo"` flags every such link).
2. **Point-span + link model** means backends render pre/post as zero-duration events; the duration lives in the link attributes and the (optional) native CLI tool spans. If you ever want rendered duration bars from the hook stream too, emit an additional `copilot.tool.execution` span at post-time using `pre.startedAtMs → tsMs` — the state file already contains everything needed.
3. **Verbatim capture is verbatim** — secrets in tool args/results land in the JSONL and the collector. Gate with a collector `redaction`/`attributes` processor before shipping anywhere shared.
4. Root session span arrives only at `sessionEnd`; before that, child spans reference a parent the backend hasn't seen (normal for OTLP; UIs show it as pending/orphan until finalized). A crash that skips `sessionEnd` leaves the root unfinalized and the state file behind — safe to delete.

## References — Annotated Bibliography

### Primary references (GitHub official documentation)

1. **[GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)** — GitHub Docs. The ground-truth document for this entire tutorial. Enumerates every hook event with full camelCase and VS Code-compatible payload schemas, the three hook types (command/HTTP/prompt), matcher regex semantics, exit-code behavior (including the fail-closed `preToolUse` / fail-open timeout rules the emitter is designed around), stdout decision parsing, policy hooks, and cloud-agent divergences. The attribute mapping table in §1–2 is derived line-by-line from this page.

2. **[Using hooks with GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)** — GitHub Docs. The how-to companion to the reference: hook file locations (`~/.copilot/hooks/`, `.github/hooks/`), load order, and configuration walkthroughs. Basis for choosing user-level placement of `otel.json`.

3. **[OpenTelemetry instrumentation for Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/observability/opentelemetry)** — GitHub Docs. Documents `TelemetryConfig`, the CLI's `otlp-http` exporter (http/json default, http/protobuf optional, no gRPC), and W3C trace-context propagation (`traceparent`/`tracestate` over JSON-RPC) for fusing app spans with CLI spans. Source for §8's parallel-native-export setup and the future single-distributed-trace path.

4. **[GitHub Copilot CLI is now generally available](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)** — GitHub Changelog, Feb 25, 2026. Establishes GA status and the headline hook capabilities (preToolUse deny/modify, postToolUse post-processing), plus skills/custom agents context. Basis for the "Copilot CLI ≥ GA" version floor in §0.

5. **[Enterprise-managed OpenTelemetry export for VS Code and CLI](https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/)** — GitHub Changelog, Jul 8, 2026. Managed-settings `telemetry` block: org-mandated OTLP endpoint, protocol, resource attributes, headers, and content-capture policy, overriding env vars. Relevant for enterprise deployment — a managed value would silently win over the `OTEL_*` exports in §8.

6. **[Using GitHub Copilot CLI — overview](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/overview)** — GitHub Docs. General CLI usage (autopilot, custom agents, steering); background context for which agent behaviors generate `subagentStart`/`subagentStop` traffic.

### Exemplar implementations

7. **[o11y-dev/opentelemetry-hooks](https://github.com/o11y-dev/opentelemetry-hooks)** — GitHub repository. The strongest prior art: a cross-agent (Copilot, Claude Code, Codex, Cursor, Gemini CLI, Windsurf, OpenCode) hook-target that converts every hook event into OTLP spans using GenAI semantic conventions. Validates the hooks-as-span-emitters architecture and warns about duplicate telemetry when native OTel and hook-based OTel cover the same events — the reason §8 keeps the two streams as separate resource services rather than merging.

8. **[Trace GitHub Copilot with Langfuse](https://langfuse.com/integrations/developer-tools/github-copilot)** — Langfuse docs, Jun 2026. Documents Copilot's built-in OTel export end-to-end: GenAI semconv compliance, default no-content export, `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` for content capture, and the http/json-only transport for the CLI. Also a candidate terminal exporter behind the collector in §7.3.

9. **[Collect GitHub Copilot CLI's prompts and responses through OTel](https://logicojp.medium.com/collect-github-copilot-clis-prompts-and-responses-through-otel-2cd84cfb6f48)** — Akihiro Nishikawa, Medium, Jun 24, 2026. Practitioner walkthrough confirming `COPILOT_OTEL_ENABLED` auto-enables when the OTLP endpoint is set, the gRPC prohibition, and the exact env-var set used verbatim in §8.

### Community & secondary sources

10. **[GitHub Copilot CLI Tips & Tricks — Part 4: Automating and enforcing policies with hooks](https://bartwullems.blogspot.com/2026/03/github-copilot-cli-tips-tricks-part-4.html)** — Bart Wullems, Mar 12, 2026. Clear articulation of the hooks value proposition (deterministic guarantees vs. prompt-based guidance) and practical stdin-JSON/stdout-JSON patterns; informed the emitter's I/O discipline in §5.

11. **[GitHub Copilot Hooks Complete Guide](https://smartscope.blog/en/generative-ai/github-copilot/github-copilot-hooks-guide/)** — SmartScope, Feb 27, 2026. Covers the shared CLI/cloud-agent configuration model, first-deny-wins hook chaining, and a Copilot-vs-Claude-Code hooks comparison. Useful for the cloud-agent variant notes in §10.

12. **[Automating with Hooks — Awesome GitHub Copilot Learning Hub](https://awesome-copilot.github.com/learning-hub/automating-with-hooks/)** — GitHub's awesome-copilot project. Community-curated hook patterns, including `permissionRequest` auto-approval caveats that shaped the decision to keep the emitter strictly observe-only.

13. **[Hooks and Event-Driven Automation — awesome-copilot](https://deepwiki.com/github/awesome-copilot/7-hooks-and-event-driven-automation)** — DeepWiki rendering of the same repository. Architecture-level framing of hooks vs. agents vs. skills and `hooks.json` organization conventions.

14. **[How to use hooks in the GitHub Copilot CLI (demo)](https://tech.hub.ms/github-copilot/videos/how-to-use-hooks-in-the-github-copilot-cli-demo)** — GitHub video via Tech Hub, Apr 30, 2026. Walks the agent loop and situates each hook event inside it — the mental model behind the root-session-span-with-child-hook-spans topology in §1.

15. **[Export traces, metrics, and events via OpenTelemetry — copilot-cli #1911](https://github.com/github/copilot-cli/issues/1911)** — GitHub issue, Mar 2026. The community feature request that preceded native CLI OTel; documents the CLI/VS Code parity motivation and tool-name divergence concerns.

16. **[Monitor agent usage with OpenTelemetry](https://code.visualstudio.com/docs/agents/guides/monitoring-agents)** — VS Code docs. Confirms that native instrumentation produces a trace hierarchy including subagents, permissions, hooks, and tool calls, and documents the policy → env var → user setting → default resolution order.

*Excluded as off-topic during research:* [AWS Copilot CLI Observability](https://aws.github.io/copilot-cli/docs/developing/observability/) (name collision — AWS's unrelated container tool) and the [GitHub Copilot Wikipedia entry](https://en.wikipedia.org/wiki/GitHub_Copilot) (historical background only).
