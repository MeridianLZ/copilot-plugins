# GitHub Copilot CLI Hook → JSONL → OpenTelemetry Trace Bridge

An implementation-grade tutorial and runnable TypeScript reference stack for capturing the complete current GitHub Copilot CLI hook lifecycle, preserving every accepted hook payload as append-only JSONL, streaming the ledger to a live console, projecting lifecycle pairs into OpenTelemetry spans with attributes and links, and delivering both custom hook spans and Copilot's native GenAI telemetry to a detailed OTLP consumer.

Research and verification date: **2026-08-01**.

## Executive architecture decision

GitHub Copilot CLI should not be instrumented by recreating its entire execution trace from hooks. Its native telemetry already emits the authoritative GenAI execution tree and can write **all signals directly to JSONL**. The hook surface supplies a separate deterministic control-plane stream containing policy, mutation, notification, and lifecycle observations that native spans do not preserve as complete hook payloads.

This project therefore uses a **dual-lane architecture**:

```text
                                      ┌───────────────────────────────────────────┐
                                      │ GitHub Copilot CLI native OTel            │
                                      │                                           │
                                      │ invoke_agent                              │
                                      │ ├── chat                                  │
                                      │ ├── execute_tool                          │
                                      │ └── subagent invoke_agent                 │
                                      │                                           │
                                      │ GenAI attributes, tokens, cost, tool IDs  │
                                      └───────────────┬───────────────────────────┘
                                                      │ OTLP/HTTP or native JSONL
                                                      ▼
┌───────────────────────────────────┐       ┌──────────────────────────────────────┐
│ Copilot lifecycle hook            │       │ OpenTelemetry Collector              │
│ JSON stdin                        │       │                                      │
└─────────────────┬─────────────────┘       │ traces + metrics + logs              │
                  ▼                         │ detailed debug exporter               │
        hook-egress.ts                      └──────────────────────────────────────┘
        bounded and fail-open                         ▲
          │                                           │ OTLP/HTTP traces
          ├── POST /hooks/<event> ───────┐            │
          └── atomic spool on failure    ▼            │
                                      bridge.ts ───────┘
                                      │
                                      ├── append-only hook-events.jsonl
                                      ├── live pretty or JSON console
                                      ├── point span for every hook event
                                      └── reconstructed session/turn/tool/subagent spans
```

The inversion from the equivalent Claude Code implementation is intentional:

- **Copilot:** native OTel is the authoritative execution trace; hooks annotate and audit it.
- **Claude Code:** the hook/transcript file lane is often the authoritative lifecycle record; native traces remain a more conditional supplementary lane.

The detailed reasoning is in [`docs/claude-code-comparison.md`](docs/claude-code-comparison.md).

## What this repository delivers

- Coverage of all **14 current Copilot hook events**.
- Support for both native camelCase payloads and PascalCase/VS Code-compatible snake_case payloads.
- Additive and idempotent project or user hook installation.
- Local command-hook transport with atomic disk spooling.
- Direct HTTPS-hook generation for remote or cloud-agent deployments.
- Append-only hook JSONL with at-least-once delivery semantics.
- Read-only live console tailing of the custom hook ledger.
- Read-only tailing of Copilot's native all-signal OTel JSONL exporter.
- OpenTelemetry duration spans for sessions, turns, tools, and supported subagents.
- Point spans for every hook invocation.
- Explicit OTel links for relationships that are not valid single-parent relationships.
- Hash-by-default content handling and bounded attributes.
- Alpine Node container and built-in `docker compose` stack.
- Detailed OTel Collector debug output for traces, metrics, and logs.
- Strict TypeScript implementation with no `any` escape hatches.

## Current Copilot hook surface

The current official event inventory is:

```text
sessionStart
sessionEnd
userPromptSubmitted
userPromptTransformed
preToolUse
permissionRequest
postToolUse
postToolUseFailure
agentStop
subagentStart
subagentStop
preCompact
errorOccurred
notification
```

Each event is described field-by-field in [`docs/hook-map.md`](docs/hook-map.md).

### Reconstructed span model

Every accepted hook produces a point span:

```text
github.copilot.hook.<eventName>
```

The bridge also reconstructs bounded duration spans:

```text
github.copilot.hook.session     sessionStart → sessionEnd
github.copilot.hook.turn        userPromptSubmitted → agentStop
github.copilot.hook.tool        preToolUse → postToolUse | postToolUseFailure
github.copilot.hook.subagent    subagentStart → subagentStop
```

The tool and subagent duration spans are intentionally marked heuristic when exact identity is unavailable. The documented Copilot hook payload does not expose the native `gen_ai.tool.call.id`, while Copilot's native `execute_tool` span does. The bridge therefore never invents an exact identifier merely to produce a visually tidy waterfall.

## Why both lanes are necessary

### Native Copilot OpenTelemetry lane

Copilot CLI's native OTel runtime provides the information hooks cannot reliably reconstruct:

- authoritative `invoke_agent` / `chat` / `execute_tool` hierarchy;
- GenAI semantic-convention operation and model attributes;
- token usage, cache usage, reasoning usage, finish reasons, and time-to-first-chunk;
- tool call identity and exact tool durations;
- Copilot cost and AI-unit attributes;
- traces, metrics, and logs through one exporter configuration;
- an all-signal local JSONL file exporter.

Native content capture is disabled by default. Full prompts, responses, tool definitions, tool arguments, and tool results are emitted only when `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` is explicitly enabled.

### Custom hook lane

The hook lane supplies the deterministic lifecycle and governance record:

- final model-facing prompt transformation via `userPromptTransformed`;
- pre-tool permission decisions and argument rewrites;
- explicit permission-service interception;
- post-tool result replacement and context injection;
- agent-stop continuation decisions;
- subagent start/stop and response rewriting;
- pre-compaction observation;
- runtime errors and CLI notifications;
- exact raw hook payload shape before normalization and sanitization.

The bridge stores a durable, normalized ledger even when the OTLP backend is unavailable.

## Prerequisites

- Node.js 22 or newer
- pnpm 10 through Corepack
- Docker with built-in `docker compose`
- GitHub Copilot CLI with the current hook and OTel surfaces
- PowerShell 7 or newer when installing/running hooks on Windows
- Loopback ports `27431`, `27432`, and `14329` available

Verify the local environment:

```bash
node --version
pnpm --version
docker compose version
copilot --version
```

## Repository layout

```text
github-copilot-cli-otel-hook-bridge/
├── compose.yml
├── Dockerfile
├── package.json
├── .env.example
├── otel/
│   └── collector.yml
├── scripts/
│   ├── copilot-otel-env.sh
│   ├── copilot-otel-env.ps1
│   ├── copilot-otel-file.sh
│   ├── copilot-otel-file.ps1
│   ├── install-hooks.sh
│   ├── install-hooks.ps1
│   ├── smoke-test.sh
│   └── smoke-test.ps1
├── src/
│   ├── bridge.ts
│   ├── config.ts
│   ├── envelope.ts
│   ├── generate-hooks.ts
│   ├── hook-egress.ts
│   ├── io.ts
│   ├── normalize.ts
│   ├── otel.ts
│   ├── security.ts
│   ├── span-assembler.ts
│   ├── tail.ts
│   ├── tail-native.ts
│   └── types.ts
├── docs/
│   ├── hook-map.md
│   ├── attribute-link-contract.md
│   ├── state-of-the-art-research.md
│   └── claude-code-comparison.md
└── test/
```

## Installation and local OTLP tutorial

### 1. Install dependencies and run the validation gate

```bash
corepack enable
pnpm install
pnpm check
```

`pnpm check` runs strict typechecking, all tests, and the production build.

The first successful install produces `pnpm-lock.yaml`. Commit the lockfile before production deployment and switch container installs to `--frozen-lockfile` after it exists.

### 2. Copy the environment file

```bash
cp .env.example .env
```

The defaults are deliberately local-only:

```dotenv
COPILOT_TRACE_BRIDGE_HOST=0.0.0.0
COPILOT_TRACE_BRIDGE_PORT=14329
COPILOT_TRACE_CONTENT_MODE=hash
COPILOT_TRACE_CONSOLE_MODE=pretty
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:27432/v1/traces
```

The Docker port mappings bind to `127.0.0.1`, so setting the container process to `0.0.0.0` does not expose the host port externally.

### 3. Start the bridge and OTel Collector

```bash
docker compose up --build
```

The stack exposes:

| Component | Host endpoint | Purpose |
|---|---|---|
| OTel gRPC receiver | `127.0.0.1:27431` | Optional OTLP/gRPC producers |
| OTel HTTP receiver | `127.0.0.1:27432` | Copilot native signals and bridge traces |
| Hook bridge | `127.0.0.1:14329` | Hook ingestion, health, and flush |

Check health:

```bash
curl --fail --silent http://127.0.0.1:14329/health | jq
```

Expected fields include `accepted`, `duplicates`, `failed`, `events_file`, and `otlp_traces_endpoint`.

### Conversation viewer and export

Open the local UI:

```text
http://127.0.0.1:14329/ui
```

The viewer reconstructs a **verbatim chronological conversation** from the hook ledger:

- sidebar sort/filter (status, search, min tools, has-errors);
- nested session → turn → tool/subagent timeline with indentation;
- professional code blocks (hover: copy, line numbers, Aa font size);
- export: copy, Markdown, JSON conversation document, PDF via print.

Server APIs:

```bash
curl --fail --silent http://127.0.0.1:14329/api/sessions | jq
curl --fail --silent http://127.0.0.1:14329/api/sessions/<sessionId>/conversation | jq
curl --fail --silent http://127.0.0.1:14329/api/sessions/<sessionId>/conversation.md
```

Hook generator content mode is no longer hardcoded. Prefer:

```bash
pnpm hooks:generate -- --target /path/to/repo --content-mode hash --post-timeout-ms 250
```

### 4. Generate hook configuration without modifying the target repository

Run from this bridge repository:

```bash
pnpm hooks:generate -- --target /absolute/path/to/target-repository
```

This writes:

```text
/absolute/path/to/target-repository/.github/hooks/copilot-otel-bridge.generated.json
```

Review the generated file before applying it. The command transport contains absolute paths to this repository's built `hook-egress.js`, so moving this bridge afterward requires regenerating the hook file.

### 5. Apply the hook configuration additively

```bash
pnpm hooks:apply -- --target /absolute/path/to/target-repository
```

The applied file is:

```text
.github/hooks/copilot-otel-bridge.json
```

The generator is idempotent. It removes only handlers stamped with:

```json
{
  "env": {
    "COPILOT_OTEL_BRIDGE_HANDLER": "1"
  }
}
```

It preserves unrelated handlers and unrelated top-level fields in its own file. It does not rewrite other hook files or Copilot settings.

For a user-wide installation:

```bash
pnpm hooks:generate -- --scope user
pnpm hooks:apply -- --scope user
```

That writes under `$COPILOT_HOME/hooks/` or `~/.copilot/hooks/`.

### 6. Enable Copilot's native OTLP lane in the same shell that launches Copilot

macOS/Linux:

```bash
. ./scripts/copilot-otel-env.sh
copilot
```

PowerShell:

```powershell
. .\scripts\copilot-otel-env.ps1
copilot
```

Dot-sourcing is required because the variables must remain in the current process environment inherited by `copilot`.

The script configures:

```text
COPILOT_OTEL_ENABLED=true
COPILOT_OTEL_EXPORTER_TYPE=otlp-http
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:27432
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=false
```

### 7. Exercise the agent

From the target repository:

```bash
copilot
```

Submit a prompt that causes at least one tool execution and, preferably, one supported custom/YAML subagent. The built-in `general-purpose` agent does not emit `subagentStart` or `subagentStop`; other documented YAML-based agents and user-defined custom agents do.

### 8. Observe all four stages

#### A. Hook egress and bridge console

The `hook-bridge` container prints a live line for every accepted hook:

```bash
docker compose logs --follow hook-bridge
```

Example:

```text
2026-08-01T06:37:00.000Z preToolUse              session=... tool=bash
2026-08-01T06:37:01.200Z postToolUse             session=... tool=bash
2026-08-01T06:37:02.000Z agentStop               session=... reason=complete
```

#### B. Durable custom JSONL ledger

```bash
pnpm tail
```

The default file is:

```text
.copilot/telemetry/hook-events.jsonl
```

Each line is a normalized envelope containing a stable `event_id`, observation time, original source, payload dialect, W3C context when present, and sanitized payload.

#### C. Native Copilot trace, metrics, and logs at the collector

```bash
docker compose logs --follow otel-collector
```

The collector uses the detailed debug exporter. Native Copilot signals and custom bridge spans arrive through the same receiver but retain distinct `service.name` and instrumentation-scope attributes.

#### D. Force a deterministic flush

```bash
curl --fail --silent --request POST http://127.0.0.1:14329/flush | jq
```

The endpoint waits for serialized JSONL ingestion and calls `forceFlush()` on the trace provider.

### 9. Run the synthetic end-to-end smoke trace

macOS/Linux:

```bash
./scripts/smoke-test.sh
```

PowerShell:

```powershell
.\scripts\smoke-test.ps1
```

The smoke test sends a complete session with prompt transformation, tool use, permission request, subagent lifecycle, compaction, notification, stop, and session end, then flushes the exporter.

## Native Copilot JSONL mode

Copilot's native file exporter is valuable when no collector is available or when a replayable local execution ledger is preferred.

### macOS/Linux

```bash
. ./scripts/copilot-otel-file.sh
copilot
```

### PowerShell

```powershell
. .\scripts\copilot-otel-file.ps1
copilot
```

The scripts create a timestamped file under:

```text
.copilot/telemetry/native-otel-YYYYMMDD-HHMMSS.jsonl
```

Tail the selected file by exporting its path:

```bash
export COPILOT_TAIL_FILE="$COPILOT_OTEL_FILE_EXPORTER_PATH"
pnpm tail:native
```

PowerShell:

```powershell
$env:COPILOT_TAIL_FILE = $env:COPILOT_OTEL_FILE_EXPORTER_PATH
pnpm tail:native
```

This file is Copilot's native all-signal JSONL, not the custom hook ledger. Keep the two files distinct:

| File | Authoritative for |
|---|---|
| `hook-events.jsonl` | Full hook payloads, hook decisions, deterministic lifecycle observations |
| `native-otel-*.jsonl` | Agent/LLM/tool hierarchy, tokens, cost, model and exact tool-call telemetry |

## Remote HTTP and cloud-agent deployment

The generator can create HTTP hooks instead of local command hooks:

```bash
pnpm hooks:generate -- \
  --target /absolute/path/to/repository \
  --transport http \
  --url https://observability.example.com/hooks
```

Apply after review:

```bash
pnpm hooks:apply -- \
  --target /absolute/path/to/repository \
  --transport http \
  --url https://observability.example.com/hooks
```

For the cloud-agent-safe subset:

```bash
pnpm hooks:generate -- \
  --target /absolute/path/to/repository \
  --cloud \
  --transport http \
  --url https://observability.example.com/hooks
```

Cloud mode installs 12 events and omits CLI-only `notification` and `permissionRequest`.

Important deployment constraints:

- `preToolUse` and `permissionRequest` HTTP hooks must use HTTPS because their responses can grant permissions.
- Cloud agent has constrained outbound networking; the destination must be allowed by the cloud-agent firewall.
- Cloud jobs are ephemeral and non-interactive.
- Only repository `.github/hooks/*.json` configuration is present by default in cloud jobs.
- Cloud agent honors `bash` or cross-platform `command`; it does not run local user hook directories or local plugins from the developer machine.
- An observation endpoint must return `{}` for direct hook requests so it cannot accidentally allow, deny, block, or mutate the agent.

The included bridge follows that response rule.

## Command-hook failure semantics and why the egress is tiny

A logging hook must never become the reason an agent cannot execute a tool.

Copilot's current `preToolUse` behavior is asymmetric:

- a command hook crash or non-zero exit denies the tool;
- exit `2` denies even if stdout says `allow`;
- command-hook timeout fails open;
- HTTP failure, timeout, or non-2xx response fails open;
- malformed or multiple JSON objects on stdout can invalidate control output.

`hook-egress.ts` therefore:

1. reads one JSON value from stdin;
2. normalizes and sanitizes it;
3. attempts a local POST with a default 250 ms deadline;
4. writes one atomic spool file if forwarding fails;
5. catches every exception;
6. writes no stdout;
7. exits successfully.

The long-lived bridge, not the hook subprocess, initializes OpenTelemetry, writes the shared JSONL file, manages span state, and talks to the collector.

## Spooling and delivery semantics

The hook lane is **at least once**, not exactly once.

If the bridge accepts a POST but the hook process loses the response, the event may later be replayed from disk. Every envelope therefore has a deterministic `event_id`, and the bridge maintains a bounded recent-ID deduplication set.

Storage layout:

```text
.copilot/telemetry/
├── hook-events.jsonl
└── spool/
    └── <event-id>.json
```

The bridge drains the spool on startup and every two seconds. It deletes a spool file only after the event has been accepted by the serialized ingestion path.

Durable external consumers should also deduplicate on `event_id`; the in-memory bridge cache is intentionally bounded and does not claim permanent exactly-once semantics.

## Attributes and links

The complete contract is in [`docs/attribute-link-contract.md`](docs/attribute-link-contract.md).

Representative attributes:

```text
service.name=github-copilot-cli-hook-bridge
agent.harness.name=github-copilot-cli
agent.harness.hook.event=preToolUse
agent.harness.session.id=<sessionId>
github.copilot.hook.payload_format=camelCase
github.copilot.hook.event_id=<sha256-based-id>
github.copilot.hook.tool.name=bash
github.copilot.hook.relationship.heuristic=true|false
```

The bridge preserves native semantic-convention fields only when it actually possesses authoritative values. It does not copy structural hook guesses into `gen_ai.tool.call.id`.

### Parent rules

A reconstructed lifecycle span has one parent:

1. current turn for tool and subagent spans;
2. current session for turn spans;
3. extracted W3C parent only when there is no stronger local lifecycle parent;
4. root otherwise.

### Link rules

Links represent causality that cannot truthfully be represented by a single parent:

- inherited native `traceparent` when a local lifecycle parent already exists;
- a permission request linked to one unambiguous open tool;
- ambiguous FIFO tool/subagent completion correlation;
- asynchronous notification or compaction linked to the last completed turn.

Known links are supplied at span creation so head samplers can inspect them.

## Content and privacy policy

`COPILOT_TRACE_CONTENT_MODE` controls the custom hook lane independently of Copilot's native content-capture switch.

| Mode | Custom hook behavior | Appropriate use |
|---|---|---|
| `off` | Replaces content-bearing fields with a redaction marker | Strictest enterprise posture |
| `hash` | SHA-256 digest plus UTF-8 byte count | Default; correlation without content disclosure |
| `full` | Stores bounded content up to `COPILOT_TRACE_CONTENT_MAX_BYTES` | Trusted local development only |

Fields treated as content include prompts, transformed prompts, commands, tool arguments/results, errors/stacks, subagent responses, notification messages, and context-injection text.

The native Copilot lane has its own separate switch:

```text
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=false
```

Enabling either lane's full-content mode can expose source code, file contents, credentials, user prompts, generated responses, and tool payloads. Collector access, disk permissions, retention, and export destinations must be treated as production security controls.

## Console modes

Set in `.env`:

```dotenv
COPILOT_TRACE_CONSOLE_MODE=pretty
```

Available values:

- `pretty`: compact operator-readable event lines;
- `json`: one complete normalized envelope per console line;
- `silent`: no per-event output; health and errors remain available.

## Windows installation shortcuts

Run PowerShell 7 from this repository:

```powershell
.\scripts\install-hooks.ps1 -TargetRoot 'C:\dev\target-repository'
```

User scope:

```powershell
.\scripts\install-hooks.ps1 -Scope user
```

The generic pnpm generator is cross-platform and remains the source of truth. The PowerShell script only sequences install, build, preview, and apply.

## Manual local development without Docker

Start a collector separately on `127.0.0.1:27432`, then:

```bash
corepack enable
pnpm install
pnpm build
cp .env.example .env
pnpm dev
```

In another shell:

```bash
pnpm hooks:apply -- --target /absolute/path/to/target-repository
. ./scripts/copilot-otel-env.sh
cd /absolute/path/to/target-repository
copilot
```

To run the built bridge rather than watch mode:

```bash
pnpm start
```

## Troubleshooting

### No hook events arrive

1. Confirm the bridge is healthy:

   ```bash
   curl --fail http://127.0.0.1:14329/health
   ```

2. Confirm the installed file exists:

   ```bash
   cat .github/hooks/copilot-otel-bridge.json | jq
   ```

3. Confirm the bridge project has been built and the absolute `hook-egress.js` path in the JSON exists.
4. Confirm the target folder is trusted by Copilot CLI.
5. Inspect Copilot logs/debug output for dropped malformed hook entries.
6. Check `.copilot/telemetry/spool/`; spooled files prove the hook ran even when the bridge was unreachable.

### `preToolUse` unexpectedly denies every tool

A command observer that crashes or exits non-zero is a deny. Run the generated command manually with a sample payload:

```bash
printf '%s\n' '{"sessionId":"debug","timestamp":1800000000000,"cwd":"/tmp","toolName":"bash","toolArgs":{"command":"pwd"}}' \
  | node /absolute/path/to/github-copilot-cli-otel-hook-bridge/dist/src/hook-egress.js
printf 'exit=%s\n' "$?"
```

The command must produce no stdout and exit `0`. Inspect the spool and stderr if it does not.

### Native OTel does not arrive

The variables must exist in the process that starts `copilot`:

```bash
env | grep -E 'COPILOT_OTEL|OTEL_EXPORTER|OTEL_SERVICE|OTEL_INSTRUMENTATION'
```

The OTLP endpoint is a base URL:

```text
http://127.0.0.1:27432
```

The custom bridge's trace exporter uses the full traces path:

```text
http://127.0.0.1:27432/v1/traces
```

Do not interchange them.

### Native JSONL file does not exist yet

Copilot creates/emits after telemetry activity. Start Copilot and execute at least one prompt. Then set `COPILOT_TAIL_FILE` to the actual timestamped path before running `pnpm tail:native`.

### No subagent hooks appear

The built-in `general-purpose` agent does not emit them. Use a documented YAML-based agent or a user-defined custom agent. Native OTel may still show agent execution even where the hook boundary is absent.

### Tool duration spans are paired incorrectly

Hook payloads currently lack an exact tool-call ID. Parallel invocations of the same tool name are inherently ambiguous in the hook lane. Query Copilot's native `execute_tool` spans for the authoritative waterfall and use the hook spans as lifecycle annotations.

### Collector logs are overwhelming

The provided collector uses `debug` exporter verbosity `detailed` because this is a tutorial and verification stack. Replace the exporter with Tempo, Jaeger, Honeycomb, Datadog, OpenObserve, or another OTLP backend after validating the pipeline.

## Validation performed on the delivered source

The following checks passed in the assembly environment:

- strict TypeScript typecheck;
- production TypeScript compilation;
- **12/12 behavioral tests**;
- hook generator additive/idempotency test;
- preservation of unrelated hook handlers and fields;
- exactly one installed observer per selected event after repeated apply;
- Bash syntax validation;
- JSON parsing validation;
- YAML parsing validation.

The environment could not reach the npm registry and did not have Docker installed. The TypeScript and test gate was therefore executed with temporary local OpenTelemetry interface/runtime stubs and the globally installed TypeScript compiler. Those validation artifacts are excluded from this deliverable. A clean `pnpm install`, a real package-resolution build, `docker compose config`, and a live Copilot→Collector run remain mandatory target-environment acceptance tests.

No claim is made that stub validation substitutes for a real dependency and container integration run.

## Research basis

### Official sources

- [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
- [Using hooks with GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
- [Copilot CLI hooks tutorial](https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks)
- [GitHub Copilot CLI command reference and OpenTelemetry monitoring](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)
- [Copilot CLI configuration-directory reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference)
- [GitHub Copilot SDK](https://github.com/github/copilot-sdk)
- [OpenTelemetry JavaScript](https://github.com/open-telemetry/opentelemetry-js)
- [OpenTelemetry trace API specification](https://opentelemetry.io/docs/specs/otel/trace/api/)

### Informing repositories

| Repository | What informed this implementation |
|---|---|
| [github/copilot-cli](https://github.com/github/copilot-cli) | Changelog chronology, compatibility changes, native monitoring evolution, and product source of truth |
| [github/copilot-sdk](https://github.com/github/copilot-sdk) | Typed programmatic-hook contracts and native telemetry integration patterns |
| [microsoft/vscode-copilot-chat](https://github.com/microsoft/vscode-copilot-chat) | Cross-surface hooks and agent-monitoring implementation, including hook spans in the native trace tree |
| [junhoyeo/tokscale](https://github.com/junhoyeo/tokscale) | Proven consumption of Copilot's file-exported OTel JSONL and practical local usage-analysis workflow |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | Real-world Copilot customization packaging and portable instruction/agent/plugin patterns |
| [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) | Claude lifecycle-hook design precedent used only for contrast; official current inventories override stale examples |
| [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel) | Earlier Claude OTel Collector stack precedent and comparison point for the dual-lane design |

The complete source synthesis and uncertainty register are in [`docs/state-of-the-art-research.md`](docs/state-of-the-art-research.md).

## Claude Code comparison at a glance

Copilot's current hook surface has 14 events; Claude Code's current hook surface has 30. The difference is not merely quantity.

### Copilot capabilities that are extra or materially stronger

- `userPromptTransformed`: mutation of the final model-facing prompt after runtime transformation while leaving displayed user text unchanged.
- Native all-signal OTel JSONL file exporter.
- Native GenAI semantic-convention trace hierarchy as the default trace model.
- Stable native `invoke_agent` / `chat` / `execute_tool` execution telemetry without Claude's enhanced-tracing beta activation chain.
- One hook contract spanning local CLI and cloud agent, with documented event differences.
- Cross-platform `bash`, `powershell`, and `command` handler fields.
- PascalCase Claude/VS Code compatibility mode and Claude tool-name mapping.
- Machine-wide policy hook directories that cannot be disabled by user `disableAllHooks`.

### Features missing from Copilot hooks compared with Claude Code

```text
Setup
UserPromptExpansion
PermissionDenied
PostToolBatch
StopFailure
TeammateIdle
TaskCreated
TaskCompleted
InstructionsLoaded
ConfigChange
CwdChanged
FileChanged
WorktreeCreate
WorktreeRemove
PostCompact
Elicitation
ElicitationResult
MessageDisplay
```

Copilot also lacks documented hook-level tool-call IDs, a per-prompt UUID equivalent to Claude's `prompt.id`, and Claude's broader hook handler types (`mcp_tool`, model `prompt`, and tool-using `agent` evaluators). Copilot's native telemetry compensates for some execution-correlation gaps, but it does not create missing deterministic governance boundaries for context loading, filesystem changes, tasks, worktrees, batch fan-in, or MCP elicitation.

Read the full analysis: [`docs/claude-code-comparison.md`](docs/claude-code-comparison.md).

## Production hardening checklist

Before production rollout:

- generate and commit `pnpm-lock.yaml`;
- change Docker installs to `--frozen-lockfile`;
- replace the detailed debug exporter with the production OTLP backend;
- configure TLS and authentication for every non-loopback endpoint;
- keep `preToolUse` policy hooks separate from passive telemetry observers;
- run the passive observer as command transport only where local spool durability is required;
- run direct HTTPS transport for cloud agent or centrally managed collection;
- decide retention independently for custom hook JSONL and native OTel JSONL;
- keep content capture disabled unless there is a reviewed use case;
- add collector-side attribute allowlists/redaction for enterprise export;
- verify root ownership and permissions for policy-level hooks;
- load-test concurrent tool/subagent events and query native spans for exact IDs;
- alert on spool growth, hook egress failures, and collector export failures;
- run an acceptance session after every Copilot CLI upgrade because the product is evolving rapidly.

## License

This reference implementation is supplied as an educational and operational scaffold. Review dependency licenses, organizational policy, data-retention requirements, and security controls before production use.
