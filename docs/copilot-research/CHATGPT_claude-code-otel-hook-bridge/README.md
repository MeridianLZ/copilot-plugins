# Claude Code Hook → JSONL → OpenTelemetry Trace Bridge

An implementation-grade tutorial and runnable reference stack for capturing the complete Claude Code hook lifecycle, preserving it as append-only JSONL, streaming it to a console, translating lifecycle pairs into OpenTelemetry spans with attributes and links, and finally dumping the completed traces at an OTLP consumer.

Research and verification date: **2026-07-31**.

## What this delivers

```text
Claude Code harness
  │
  │ command hook: JSON on stdin
  ▼
hook-egress.ts                    fast, fail-open, no stdout
  │
  ├── HTTP POST /hooks ──────────────────────────────────────┐
  │                                                         │
  └── atomic local spool on failure                         │
                                                            ▼
                                              hook-bridge.ts
                                                │    │    │
                                                │    │    ├── pretty or JSON console stream
                                                │    ├─────── append-only events.jsonl
                                                │
                                                └──────────── OTLP/HTTP spans
                                                               │
                                                               ▼
                                                OpenTelemetry Collector
                                                               │
                                                               └── debug exporter, detailed trace dump
```

The bridge uses a **hybrid capture model**:

1. Claude Code's native OpenTelemetry exporter remains enabled for its interaction, LLM-request, tool, permission-wait, and execution spans.
2. A custom hook egress captures every documented hook payload because native hook spans are not a complete, stable substitute for hook-level lifecycle data.
3. `prompt_id` is the deterministic join key between the hook stream and Claude's native telemetry. Claude's official hook reference states that it matches the native OTel `prompt.id` attribute.
4. An inherited W3C `TRACEPARENT`, when Claude supplies one, is preserved. The bridge uses it as a parent when there is no stronger local lifecycle parent, or as an OTel link when both contexts exist.

## Why a custom bridge is still necessary

Claude Code can export traces natively when all of the following are enabled:

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
OTEL_TRACES_EXPORTER=otlp
```

The native hierarchy is useful:

```text
claude_code.interaction
├── claude_code.llm_request
├── claude_code.hook                  detailed beta only
└── claude_code.tool
    ├── claude_code.tool.blocked_on_user
    └── claude_code.tool.execution
```

However, the native `claude_code.hook` span has a separate detailed-beta gate. It requires `ENABLE_BETA_TRACING_DETAILED=1` and `BETA_TRACING_ENDPOINT`; interactive CLI sessions also require an organization allowlist. Its content-bearing attributes are explicitly unstable. The custom bridge therefore treats native telemetry as a complementary plane, not the sole system of record.

Official references:

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code monitoring and OpenTelemetry](https://code.claude.com/docs/en/monitoring-usage)
- [Claude Agent SDK observability](https://code.claude.com/docs/en/agent-sdk/observability)
- [OpenTelemetry JavaScript](https://github.com/open-telemetry/opentelemetry-js)
- [OpenTelemetry trace API specification](https://opentelemetry.io/docs/specs/otel/trace/api/)

### KB-prime material incorporated

The implementation also applies the existing internal field evidence from KB-prime rather than treating this as a greenfield observability design:

- `reference/claude-code/claude-code-internal-variables-open-telemetry-sota-july-2026` supplied the native Claude span hierarchy, content-gate behavior, batching/flush failure modes, and W3C propagation context.
- `tracecap/tracecap-architecture` supplied the control-plane/data-plane split, append-only JSONL envelope, bounded hook work, atomic spill fallback, and transcript-independent lifecycle ledger.
- `projects/tracedeck/tracedeck-important-insights` supplied two implementation constraints proven in production: fail-open hooks can hide total capture failure, and subagent lineage is a join rather than a single guaranteed field surface.
- `runbooks/langfuse-leverage-guide-otel-first-maximization` informed the decision to keep the emitted attributes vendor-neutral and postpone backend-specific remapping to the collector.

The resulting bridge is therefore an additive evolution of the existing tracecap/TraceDeck work: it does not replace Claude's transcript or native OTel lane; it adds a normalized, durable hook lifecycle lane with explicit span/link semantics.

## Research findings applied to this design

### 1. Current hook surface: 30 events

The current official hook surface is substantially larger than older nine-hook examples. This project models all 30 events:

```text
SessionStart             Setup                    InstructionsLoaded
UserPromptSubmit         UserPromptExpansion      MessageDisplay
PreToolUse               PermissionRequest        PostToolUse
PostToolUseFailure       PostToolBatch            PermissionDenied
Notification             SubagentStart            SubagentStop
TaskCreated              TaskCompleted            Stop
StopFailure              TeammateIdle             ConfigChange
CwdChanged               FileChanged              WorktreeCreate
WorktreeRemove           PreCompact               PostCompact
SessionEnd               Elicitation              ElicitationResult
```

The generator installs **29 passive observers**. It deliberately omits `WorktreeCreate`, because registering that event replaces Claude Code's default `git worktree` behavior and requires the hook to return the created directory. The event is fully mapped in [`docs/hook-map.md`](docs/hook-map.md), but it is not safe to install as a logging-only observer.

### 2. Hooks are a control-plane signal, not a place for heavy work

A command hook is on Claude Code's execution path. The hook subprocess in this project performs only four bounded operations:

1. Read and validate stdin.
2. Sanitize the payload.
3. Attempt a short local HTTP POST.
4. Atomically spool the event if the bridge is unavailable.

It never initializes an OTel SDK, tails a transcript, waits for a remote backend, or prints to stdout. This prevents telemetry from becoming a reliability dependency for the harness.

### 3. `OTEL_*` variables are stripped from hook subprocesses

Claude Code explicitly removes `OTEL_*` exporter variables from spawned subprocesses, including hooks. The hook egress therefore uses independent `TRACE_*` configuration variables and posts to a long-lived bridge process. The bridge owns the OTel SDK and exporter.

### 4. OTel links are not a second parent

A span has one parent, but it may have many links. This project uses links for relationships that are causally relevant but are not a strict parent-child chain:

- A `PostToolBatch` point span links to every member tool span.
- A permission event without a stable `tool_use_id` links to the only unambiguous matching open tool and marks the link heuristic.
- A custom lifecycle span links to an inherited native `TRACEPARENT` when its local lifecycle parent is different.
- Session-level or asynchronous events may link to the last completed turn rather than pretending they occurred inside it.

Links are supplied at span creation, not added afterward, because head samplers must be able to inspect them when the span starts.

### 5. The durable truth is append-only JSONL

The bridge writes accepted envelopes to `events.jsonl` with **at-least-once** delivery semantics. A lost HTTP response can cause the same `event_id` to arrive again through spool replay, so durable downstream consumers must deduplicate by `event_id`. The tail command is read-only. If the bridge is unavailable, each hook writes one atomic spool file; the bridge replays and removes those files on startup.

This is intentionally separate from Claude's own transcript JSONL. The hook file is a normalized event ledger; the transcript remains the rich conversational record.

## Exemplar repositories and what was borrowed

The implementation combines several disparate patterns rather than cloning one project wholesale.

| Exemplar | Useful pattern | Deliberate difference here |
|---|---|---|
| [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel) | OTLP Collector + observability stack configuration for Claude Code metrics and events | This project adds full hook-envelope capture, lifecycle span reconstruction, links, JSONL durability, and current trace support |
| [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Real-time hook event collection and live UI-oriented streaming | This project emits vendor-neutral OTLP and keeps console output intentionally simple |
| [kaiser-data/claude-code-langfuse-tracing](https://github.com/kaiser-data/claude-code-langfuse-tracing) and [Langfuse's current Claude Code integration](https://langfuse.com/integrations/developer-tools/claude-code) | Incremental transcript processing, persisted offsets, backdated spans, and fail-open hook behavior | This bridge captures every hook immediately and does not wait until `Stop` to reconstruct the entire turn |
| [daaain/claude-code-log](https://github.com/daaain/claude-code-log) | Robust handling and rendering of Claude transcript JSONL | The local hook ledger is kept structurally independent from the transcript parser |
| [Rossini402/Claude-Code-Observability](https://github.com/Rossini402/Claude-Code-Observability) | Pairing `PreToolUse`/`PostToolUse` and subagent lifecycle events for real-time timelines | This project expresses those pairs as OTel duration spans and uses formal links for batch and cross-plane relationships |

## Prerequisites

- Node.js 22 or newer
- pnpm 10
- Docker with the built-in `docker compose`
- Claude Code new enough to expose `prompt_id` on hooks; the official documentation states this requires v2.1.196 or later
- Ports `4317`, `4318`, and `4319` available on loopback

Check versions:

```bash
node --version
pnpm --version
docker compose version
claude --version
```

## Repository layout

```text
claude-code-otel-hook-bridge/
├── compose.yml
├── Dockerfile
├── otel/
│   └── collector.yml
├── scripts/
│   ├── install-hooks.sh
│   ├── smoke-test.sh
│   └── smoke-test.ps1
├── src/
│   ├── bridge.ts               HTTP consumer, JSONL writer, console sink
│   ├── config.ts               TRACE_* and OTLP configuration
│   ├── envelope.ts             normalized envelope creation
│   ├── generate-hooks.ts       additive settings.local.json installer
│   ├── hook-egress.ts          tiny fail-open hook subprocess
│   ├── io.ts                   append and atomic spool operations
│   ├── otel.ts                 provider, exporter, traceparent parsing
│   ├── security.ts             redaction, hashing, truncation, flattening
│   ├── span-assembler.ts       lifecycle span and link state machine
│   ├── tail.ts                 read-only JSONL tail
│   └── types.ts                all 30 hook names and JSON guards
├── docs/
│   ├── hook-map.md
│   └── attribute-link-contract.md
└── test/
```

## Installation

### 1. Install and build

```bash
corepack enable
pnpm install
pnpm build
```

The first successful install generates `pnpm-lock.yaml`. Commit that lockfile before production deployment.

### 2. Configure optional content handling

Copy the environment example:

```bash
cp .env.example .env
```

Default behavior is `TRACE_CONTENT_MODE=hash`. Content-bearing fields are represented by a SHA-256 digest and byte count, while structural fields such as event names, IDs, tool names, timings, paths, and statuses remain queryable.

Available modes:

| Mode | Behavior | Recommended use |
|---|---|---|
| `off` | Replaces content-bearing values with `{redacted: true}` | Strict enterprise default |
| `hash` | Stores SHA-256 + UTF-8 byte count | Recommended development and production default |
| `full` | Stores truncated content after secret-pattern redaction | Isolated debugging only |

### 3. Start the consumer pipeline

```bash
docker compose up --build
```

This starts:

- `hook-bridge` on `127.0.0.1:4319`
- OTLP/gRPC collector receiver on `127.0.0.1:4317`
- OTLP/HTTP collector receiver on `127.0.0.1:4318`
- Collector `debug` exporter at `verbosity: detailed`

Watch the whole pipeline:

```bash
docker compose logs -f hook-bridge otel-collector
```

### 4. Install the hooks into a target project

From this bridge repository:

```bash
pnpm hooks:apply -- --target /absolute/path/to/instrumented-project
```

On Windows PowerShell:

```powershell
pnpm hooks:apply -- --target 'C:\absolute\path\to\instrumented-project'
```

The installer:

- writes `.claude/otel-hooks.generated.json` for inspection;
- additively merges its handlers into `.claude/settings.local.json`;
- preserves unrelated settings and hook groups;
- uses Claude Code's exec-form handler (`command` plus `args`) instead of shell interpolation;
- installs 29 passive observers;
- omits `WorktreeCreate` by design.

The generated handler resembles:

```json
{
  "type": "command",
  "command": "/absolute/path/to/node",
  "args": ["/absolute/path/to/claude-code-otel-hook-bridge/dist/src/hook-egress.js"],
  "timeout": 2,
  "async": false
}
```

### 5. Verify Claude sees the configuration

Start Claude Code in the instrumented project, then run:

```text
/hooks
```

Claude's `/hooks` browser is read-only and shows the event, matcher, source settings file, and handler command for each registered hook.

Verify the bridge:

```bash
curl -fsS http://127.0.0.1:4319/health | jq
```

Expected shape:

```json
{
  "ok": true,
  "accepted": 0,
  "failed": 0,
  "events_file": "/data/events.jsonl",
  "otlp_traces_endpoint": "http://otel-collector:4318/v1/traces"
}
```

## End-to-end smoke test

The smoke test sends a synthetic turn containing a prompt, tool lifecycle, permission event, parallel-batch event, streamed message, and stop event.

macOS/Linux:

```bash
./scripts/smoke-test.sh
```

Windows PowerShell:

```powershell
./scripts/smoke-test.ps1
```

Then inspect all three outputs.

### JSONL ledger

```bash
tail -n 20 .claude/telemetry/events.jsonl | jq
```

PowerShell:

```powershell
Get-Content .claude\telemetry\events.jsonl -Tail 20 | ForEach-Object { $_ | ConvertFrom-Json }
```

### Live tailed console

The bridge already prints each event. A separate file-tail consumer is included for validating the durable lane:

```bash
pnpm tail
```

PowerShell native tail:

```powershell
Get-Content .claude\telemetry\events.jsonl -Wait -Tail 20
```

### Final OTel consumer dump

```bash
docker compose logs --since=2m otel-collector
```

Search for:

```text
claude.turn
claude.tool.lifecycle
claude.hook.UserPromptSubmit
claude.hook.PreToolUse
claude.hook.PostToolBatch
claude.message.display
claude.hook.Stop
```

Force an immediate exporter flush before checking:

```bash
curl -fsS -X POST http://127.0.0.1:4319/flush | jq
```

## Trace model

### Why traces are turn-rooted, not session-rooted

An OTel span should represent a bounded operation. A Claude session can remain open for hours or days, cross process restarts, and contain many user turns. The bridge therefore emits one bounded `claude.turn` duration span per `prompt_id` and uses `claude.session.id` as a grouping attribute.

```text
claude.turn  session=S prompt=P
├── claude.hook.UserPromptSubmit
├── claude.tool.lifecycle  tool_use_id=T1
│   ├── claude.hook.PreToolUse
│   ├── claude.hook.PermissionRequest
│   └── claude.hook.PostToolUse
├── claude.tool.lifecycle  tool_use_id=T2
├── claude.hook.PostToolBatch
│   ├── link → T1
│   └── link → T2
├── claude.message.display
│   ├── claude.hook.MessageDisplay index=0
│   ├── claude.hook.MessageDisplay index=1
│   └── claude.hook.MessageDisplay final=true
└── claude.hook.Stop
```

### Point spans

Every accepted hook creates an instantaneous span named:

```text
claude.hook.<HookEventName>
```

Examples:

```text
claude.hook.ConfigChange
claude.hook.PermissionDenied
claude.hook.ElicitationResult
```

A point span has the same start and end timestamp. It records the invocation as an observable lifecycle fact even when there is no meaningful duration pair.

### Duration spans

The bridge creates duration spans for natural start/end pairs:

| Start | End | Duration span | Correlation key |
|---|---|---|---|
| `UserPromptSubmit` | `Stop` or `StopFailure` | `claude.turn` | `session_id + prompt_id` |
| `PreToolUse` | `PostToolUse`, `PostToolUseFailure`, or `PermissionDenied` | `claude.tool.lifecycle` | `tool_use_id` |
| first `MessageDisplay` (`index=0`) | final `MessageDisplay` | `claude.message.display` | `session_id + prompt_id + message_id` |
| `SubagentStart` | `SubagentStop` | `claude.subagent` | `agent_id` |
| `TaskCreated` | `TaskCompleted` | `claude.task` | `task_id` |
| `PreCompact` | `PostCompact` | `claude.compaction` | session + prompt/trigger fallback |
| `Elicitation` | `ElicitationResult` | `claude.elicitation` | `elicitation_id`, otherwise prompt fallback |

Unclosed spans are recovered after `TRACE_OPEN_SPAN_TIMEOUT_MS` and marked:

```text
claude.lifecycle.recovered_end=true
claude.lifecycle.recovered_reason=timeout
```

### Parent selection rules

The state machine uses the strongest deterministic parent available:

1. Exact open duration span by stable ID, such as `tool_use_id`, `agent_id`, or `task_id`.
2. Current turn by `session_id + prompt_id`.
3. Inherited valid W3C `TRACEPARENT`.
4. Root span, with a link to the last completed turn for asynchronous session-level events.

A parent means **this operation happened inside that operation**. A link means **this operation is related but is not structurally inside it**.

### Link contract

Every link carries a reason:

```text
claude.link.reason=native_traceparent
claude.link.reason=post_tool_batch_member
claude.link.reason=permission_to_open_tool
claude.link.reason=probable_agent_spawn_tool
claude.link.reason=logical_turn
claude.link.reason=last_completed_turn
```

Heuristic links also carry:

```text
claude.link.heuristic=true
```

The bridge creates a permission-to-tool heuristic link only when exactly one open tool matches the same session, current prompt, and tool name. Ambiguous candidates produce no link rather than a false relationship.

## Attribute model

All point and duration spans receive a stable bridge namespace plus a sanitized flattened copy of the hook payload.

### Stable common attributes

```text
claude.hook.event.name
claude.hook.event.id
claude.hook.source
claude.hook.schema_version
claude.hook.observed_at_unix_ms
claude.session.id
claude.prompt.id
claude.cwd
claude.permission.mode
claude.effort.level
claude.agent.id
claude.agent.type
claude.transcript.path
```

### Correlation attributes

```text
claude.tool.name
claude.tool.use_id
claude.task.id
claude.elicitation.id
claude.message.id
claude.turn.id
claude.worktree.path
claude.file.path
```

### Lifecycle-span attributes

```text
claude.lifecycle.kind
claude.lifecycle.correlation_key
claude.lifecycle.start_event
claude.lifecycle.end_event
claude.lifecycle.recovered_end
claude.lifecycle.recovered_reason
```

### Full sanitized payload namespace

Every remaining scalar or scalar array is flattened beneath:

```text
claude.hook.payload.<field>
```

Nested objects that exceed the flattening depth are serialized to:

```text
claude.hook.payload.<field>.json
```

The flattening layer is bounded by depth and count to prevent unbounded attribute cardinality.

See [`docs/attribute-link-contract.md`](docs/attribute-link-contract.md) for the complete contract.

## JSONL envelope

Each line in `events.jsonl` has this shape:

```json
{
  "schema_version": "1.0.0",
  "event_id": "c03af6f1-c56b-45f0-942a-e1fd9b7c86e5",
  "observed_at": "2026-07-31T22:00:00.000Z",
  "observed_at_unix_ms": 1785535200000,
  "source": "command-hook",
  "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "payload": {
    "session_id": "session-123",
    "prompt_id": "550e8400-e29b-41d4-a716-446655440000",
    "cwd": "/repo",
    "hook_event_name": "PreToolUse",
    "tool_name": "Bash",
    "tool_use_id": "toolu_01ABC",
    "tool_input": {
      "redacted": true,
      "sha256": "...",
      "bytes": 68
    }
  }
}
```

### Ordering

- `observed_at_unix_ms` is when the hook subprocess accepted the event.
- Each line has a unique `event_id`.
- Spool filenames begin with the observed timestamp and are replayed lexically.
- The bridge does not claim total ordering across multiple concurrently executing hook processes beyond the append order in `events.jsonl`.
- Use event IDs and domain correlation IDs, not line numbers, for idempotency.

## Hook registration behavior

### Command hooks instead of direct HTTP hooks

Claude Code supports direct HTTP hooks, but this project uses a local command hook because it needs a durable fallback when the endpoint is unavailable. HTTP connection failures are non-blocking, but a direct HTTP hook has no local spool unless another process supplies it.

### Synchronous with a very short budget

The generated handler uses:

```json
{
  "timeout": 2,
  "async": false
}
```

The subprocess normally returns in a few milliseconds after a loopback POST. If the bridge is down, the POST aborts after `TRACE_POST_TIMEOUT_MS=250` and writes one local file. The process always exits zero.

An asynchronous hook was not chosen because Claude Code's async mode is command-only, output is ignored, and the observable delivery boundary would become less deterministic. The expensive work is already offloaded to the long-lived bridge.

### `FileChanged` matchers are literal filenames

The official hook docs state that `FileChanged.matcher` is split on `|` into literal basenames; regular expressions are not useful for building the watch list. The generator installs explicit watched files:

```text
.env
.envrc
package.json
pnpm-lock.yaml
compose.yml
compose.env.yml
```

Extend `hookGroupsForEvent()` for organization-specific files.

## Security and privacy

Hook payloads can contain source code, commands, prompts, tool output, credentials, file paths, MCP schemas, and user responses. Treat the capture directory and collector as sensitive.

### Default protections

- Data directory mode: `0700` where supported
- JSONL and spool files: `0600` where supported
- Content mode: `hash`
- Input maximum: 4 MiB per hook
- Arrays capped at 256 entries during sanitization
- Attribute count and nesting bounded
- Secret patterns redacted even in `full` mode
- Collector bound to loopback only
- No stdout from the hook subprocess

### Content-bearing fields

The default content-key list includes:

```text
prompt, delta, message, title, last_assistant_message,
tool_input, tool_response, command, command_args,
compact_summary, custom_instructions, requested_schema, content,
error, error_details, description, task_description, session_title, globs,
ruleContent, url
```

Add organization-specific keys in `src/security.ts` before enabling `full` mode.

### Cardinality warning

Do not promote arbitrary prompt text, commands, responses, or full paths to metric labels. These are trace attributes only. Even for traces, high-cardinality values increase index and storage cost. The hash mode preserves equality checks without retaining plaintext.

## Failure semantics

Observability is fail-open by design.

| Failure | Behavior |
|---|---|
| Bridge unavailable | Hook writes atomic spool file and exits zero |
| Collector unavailable | OTel BatchSpanProcessor queues within configured bounds; JSONL continues |
| Invalid payload | Egress writes a synthetic local error notification if possible and exits zero |
| JSONL append failure | HTTP request returns error; hook-side caller spools the original envelope |
| Process crash during spool write | Temporary `.tmp` remains; it is not mistaken for a complete event |
| Duplicate duration start | Existing span is recovered and marked `duplicate_start` before replacement |
| Missing lifecycle end | Span expires and is marked `timeout` |
| Ambiguous relationship | No heuristic link is emitted |

The bridge never disables Claude hooks, changes permission decisions, or emits blocking JSON.

## Troubleshooting

### Claude does not show the hooks

1. Run `/hooks`.
2. Confirm the handlers are sourced from `.claude/settings.local.json`.
3. Confirm the compiled egress path exists.
4. Rebuild and reapply:

```bash
pnpm build
pnpm hooks:apply -- --target /absolute/project/path
```

### Hooks appear, but `events.jsonl` is empty

Check spool files:

```bash
find .claude/telemetry/spool -type f -maxdepth 1 -print
```

Check bridge health:

```bash
curl -v http://127.0.0.1:4319/health
```

Check the path in the target project's `.claude/settings.local.json`. It must point to this project's compiled `dist/src/hook-egress.js`.

### JSONL works, but collector shows no spans

```bash
curl -fsS -X POST http://127.0.0.1:4319/flush
docker compose logs --since=5m otel-collector
```

Confirm the bridge container uses:

```text
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector:4318/v1/traces
```

### Native Claude spans are absent

Confirm the target project settings contain:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1",
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318"
  }
}
```

Restart Claude Code after environment changes. Tracing remains a beta surface; span names and attributes may change.

### Native and bridge spans are in separate traces

That is possible in interactive sessions. The stable join is:

```text
native prompt.id == bridge claude.prompt.id
native session.id == bridge claude.session.id
```

An inherited `TRACEPARENT` is opportunistic in this hook bridge. The official monitoring docs guarantee it for Bash and PowerShell tool subprocesses and for Agent SDK/non-interactive caller propagation; do not assume every interactive hook invocation receives it. Use the IDs for backend-side correlation when contexts are separate.

### Windows bind-mount or file-watch issues

The bridge writes the JSONL inside its mounted `/data` directory. The included `pnpm tail` performs polling by repeatedly reading appended bytes; it does not depend on cross-filesystem native watch events.

## Production hardening

Before enterprise deployment:

1. Commit a generated `pnpm-lock.yaml` and change Docker builds to `--frozen-lockfile`.
2. Replace the collector debug exporter with authenticated production exporters while retaining debug in a local profile.
3. Add TLS or keep the bridge strictly loopback-only.
4. Add disk quotas and retention for `events.jsonl` and spool files.
5. Rotate JSONL with an external, lossless log-rotation policy; do not truncate an actively written file without coordinating the writer.
6. Add an ingestion idempotency key using `event_id` if the downstream endpoint can retry.
7. Add backend transforms from `claude.*` to your chosen GenAI semantic convention fields only where the semantics actually match.
8. Keep `WorktreeCreate` unregistered unless you implement and test the full creation contract.
9. Version the envelope and mapping contract additively.
10. Validate the live Claude Code version against the hook reference whenever upgrading.

## Validation commands

```bash
pnpm typecheck
pnpm test
bash -n scripts/install-hooks.sh scripts/smoke-test.sh
docker compose config
```

A complete live validation additionally requires:

```bash
docker compose up --build
./scripts/smoke-test.sh
curl -fsS -X POST http://127.0.0.1:4319/flush
docker compose logs --since=2m otel-collector
```

### Validation status of this supplied artifact

Completed in the build environment:

- strict TypeScript compilation and no-emit typecheck;
- 10/10 Node test cases;
- Bash syntax validation for both shell scripts;
- JSON parsing for `package.json` and `tsconfig.json`;
- YAML parsing for `compose.yml` and `otel/collector.yml`;
- additive hook-generator idempotency against an existing settings file, including preservation of unrelated hooks and omission of `WorktreeCreate`.

The environment could not reach the npm registry (`EAI_AGAIN`) and did not have Docker installed, so a clean real-package `pnpm install`, `docker compose config`, and live OTLP collector smoke test were not executable here. The TypeScript checks used temporary local declaration/runtime stubs solely for validation; those stubs and compiled output are excluded from the delivered project. Run the commands above in the target environment before installing the hooks globally.

## Source bibliography

### Primary documentation

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage)
- [Claude Agent SDK observability](https://code.claude.com/docs/en/agent-sdk/observability)
- [OpenTelemetry JavaScript repository](https://github.com/open-telemetry/opentelemetry-js)
- [OpenTelemetry trace API](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)

### Exemplar implementations

- [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel)
- [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
- [Rossini402/Claude-Code-Observability](https://github.com/Rossini402/Claude-Code-Observability)
- [kaiser-data/claude-code-langfuse-tracing](https://github.com/kaiser-data/claude-code-langfuse-tracing)
- [Langfuse Claude Code integration](https://langfuse.com/integrations/developer-tools/claude-code)
- [daaain/claude-code-log](https://github.com/daaain/claude-code-log)
- [mcrilo33/ai-toolkit](https://github.com/mcrilo33/ai-toolkit)

## Design boundary

This project traces the **harness lifecycle**. It does not attempt to replace Claude's transcript, reconstruct private model reasoning, or claim that hook time equals LLM time. Native Claude telemetry remains the source for model-request latency, tokens, cache use, retries, and tool execution timing; the hook bridge provides deterministic lifecycle coverage and durable payload evidence.
