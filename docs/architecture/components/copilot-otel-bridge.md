# Component: copilot-otel-bridge

**Responsibility:** Receives GitHub Copilot CLI (and Claude Code) hook events over HTTP or stdin, normalizes them into a versioned `HookEnvelope`, redacts/truncates sensitive content, assembles them into an OpenTelemetry span tree (session → turn → tool/subagent), and exports spans to an OTLP collector. It also serves a local read-only UI that projects the append-only event ledger and Copilot's own native session state into browsable session traces.

**Boundary:** in — hook payload normalization, secret redaction, envelope spooling/replay, span lifecycle assembly, OTLP export, ledger/native-session projection, hook installation into `~/.copilot`; out — the Copilot CLI itself, the collector's downstream backends (the shipped collector config exports to `debug` only), and any MCP protocol concern (that is `copilot-mcp`).

## Constituent files

| File | Role |
|------|------|
| `copilot-otel-bridge/src/bridge.ts` | Long-lived HTTP server: `/hooks`, `/health`, `/flush`, `/api/sessions`, `/ui`; owns assembler + spool replay loop |
| `copilot-otel-bridge/src/types.ts` | `HookEnvelope`/`NormalizedHookPayload` schema + runtime type guards |
| `copilot-otel-bridge/src/normalize.ts` | camelCase ↔ vscode-compatible payload unification, event/timestamp normalization |
| `copilot-otel-bridge/src/security.ts` | Secret redaction, stable JSON, UTF-8-safe truncation, OTEL attribute flattening |
| `copilot-otel-bridge/src/envelope.ts` | Normalize → sanitize → stamp `event_id`/`observed_at`/traceparent |
| `copilot-otel-bridge/src/config.ts` | Single env-var-driven config surface (`COPILOT_TRACE_*`, `OTEL_*`, `COPILOT_HOME`) |
| `copilot-otel-bridge/src/otel.ts` | SDK init, traceparent parsing, point-span helper |
| `copilot-otel-bridge/src/span-assembler.ts` | Stateful open-span registry turning point events into a span tree |
| `copilot-otel-bridge/src/dedupe.ts` | Windowed payload de-duplication (dual-lane hook delivery) |
| `copilot-otel-bridge/src/io.ts` | Spool write/drain, ledger append, stdin read |
| `copilot-otel-bridge/src/hook-egress.ts` | One-shot CLI: stdin payload → envelope → POST to bridge |
| `copilot-otel-bridge/src/tail.ts`, `src/tail-native.ts` | Ledger / native-session tail CLIs |
| `copilot-otel-bridge/src/trace-projector.ts` | Ledger envelopes → `SessionSummary[]` / `SessionTrace` for the UI |
| `copilot-otel-bridge/src/native-session.ts`, `src/native-cache.ts` | Parse + project `~/.copilot/session-state/<id>/events.jsonl` |
| `copilot-otel-bridge/src/conversation-projector.ts` | Envelope stream → conversation document / markdown |
| `copilot-otel-bridge/src/generate-hooks.ts` | Emits repo/user-scope Copilot hook config (command + HTTP handlers) |
| `copilot-otel-bridge/scripts/*.sh` | `install-hooks.sh`, env/file egress shims, `smoke-test.sh` |
| `copilot-otel-bridge/otel/collector.yml`, `compose.yml`, `Dockerfile` | Collector pipeline (OTLP 4317/4318) and two-service compose stack |
| `copilot-otel-bridge/ui/index.html` | Static session-trace UI served at `/ui` |

## Lynchpin symbols

| Symbol | Location | Why load-bearing |
|--------|----------|------------------|
| `isHookEnvelope` | `copilot-otel-bridge/src/types.ts:61` | Decides whether an inbound POST is already an envelope (relay) or a raw hook payload needing normalization |
| `normalizeHookPayload` | `copilot-otel-bridge/src/normalize.ts:79` | Single point where both payload dialects collapse; throws when `sessionId`/`session_id` is absent |
| `sanitizeJson` | `copilot-otel-bridge/src/security.ts:82` | Applies `contentMode` (`off`/`hash`/`full`) + byte cap before anything leaves the process |
| `flattenAttributes` | `copilot-otel-bridge/src/security.ts:95` | Bounded (depth 4 / 128 attrs / 16 KiB) JSON → OTEL attribute projection; prevents unbounded span payloads |
| `createEnvelope` | `copilot-otel-bridge/src/envelope.ts:8` | Normalize→sanitize→stamp; fails closed if sanitization strips required fields |
| `loadConfig` | `copilot-otel-bridge/src/config.ts:46` | Config SSoT: bridge host/URL (`:14329`), OTLP endpoint (`:27432`), data dir, `COPILOT_HOME` |
| `initializeTelemetry` | `copilot-otel-bridge/src/otel.ts:44` | Builds the tracer/exporter runtime the assembler writes into |
| `SpanAssembler.process` | `copilot-otel-bridge/src/span-assembler.ts:176` | Per-envelope entry: expire stale, open/close lifecycle spans, emit the point span |
| `SpanAssembler.shutdown` | `copilot-otel-bridge/src/span-assembler.ts:205` | Closes every open span as `recovered/bridge_shutdown` — no orphaned traces |
| `writeSpoolFile` / `drainSpool` | `copilot-otel-bridge/src/io.ts:19`, `:33` | Atomic 0600 temp+rename spool and replay loop — durability when the collector is down |
| `createPayloadDeduper` | `copilot-otel-bridge/src/dedupe.ts:18` | Suppresses duplicates from command-hook + HTTP-hook dual delivery |
| `projectSessions` / `projectSessionTrace` | `copilot-otel-bridge/src/trace-projector.ts:97`, `:162` | Ledger → UI session list and per-session span tree |
| `projectNativeConversation` | `copilot-otel-bridge/src/native-session.ts:162` | Reconstructs conversation + usage from Copilot's own `events.jsonl` for sessions the hooks never saw |

## Dependencies

- **Inbound (who uses this):** GitHub Copilot CLI / Claude Code hook runners (via `scripts/copilot-otel-env.sh`, `copilot-otel-file.sh`, or the generated HTTP handlers from `generate-hooks.ts`); the browser UI (`ui/index.html`); `copilot-plugin` hook scripts emit the same event shapes.
- **Outbound (what this uses):** `@opentelemetry/*` SDK → OTLP/HTTP collector (`otel/collector.yml`, `compose.yml`); the filesystem (`.copilot/telemetry/` ledger + spool); `$COPILOT_HOME/session-state/*/events.jsonl` (read-only).

## Data flow

See [copilot-otel-bridge-dataflow.mmd](copilot-otel-bridge-dataflow.mmd). Output payload summary:
Raw hook JSON becomes a sanitized `HookEnvelope` (append-only JSONL ledger + spool file) and a parented OTLP span tree exported to the collector; the same ledger is re-projected into `SessionSummary[]`/`SessionTrace` JSON for the UI.
