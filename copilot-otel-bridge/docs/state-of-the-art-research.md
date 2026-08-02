# State-of-the-art research: GitHub Copilot CLI hooks and OpenTelemetry

Research date: **2026-08-01** (America/Denver).

The implementation in this repository was derived from current official documentation first, then checked against independent OSS implementations and consumers. Historical KB-prime material was used as a lead set, not as the source of truth: its July comparison listed 13 Copilot events, while the live reference now documents 14 because `userPromptTransformed` has been added.

## Research questions

1. What is the complete current hook surface?
2. Which events are available in local CLI versus Copilot cloud agent?
3. What can each event block, modify, inject, or merely observe?
4. How does hook transport behave under failure?
5. What does Copilot's native OTel stream already provide?
6. What information is present only in hooks, only in native OTel, or in neither?
7. How should a durable JSONL/console/OTLP bridge preserve causality without inventing identifiers?
8. Which community repositories demonstrate production-worthy patterns or expose integration limitations?

## Official sources

### 1. GitHub Copilot hooks reference

Source: [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)

Load-bearing findings:

- The current event set is 14: `agentStop`, `errorOccurred`, `notification`, `permissionRequest`, `postToolUse`, `postToolUseFailure`, `preCompact`, `preToolUse`, `sessionEnd`, `sessionStart`, `subagentStart`, `subagentStop`, `userPromptSubmitted`, and `userPromptTransformed`.
- Hook files use `{ "version": 1, "hooks": { ... } }`.
- Command hooks support `bash`, `powershell`, or cross-platform `command`, plus `cwd`, `env`, and `timeoutSec`.
- HTTP hooks POST the event payload. `preToolUse` and `permissionRequest` require HTTPS because their response can grant permissions. Loopback HTTP additionally requires `COPILOT_HOOK_ALLOW_LOCALHOST=1`.
- Prompt handlers exist only on `sessionStart` and only reliably for a new interactive CLI session.
- camelCase event names yield camelCase payloads. PascalCase names yield VS Code-compatible snake_case payloads; `PreToolUse` and `PermissionRequest` also use Claude-compatible matcher/tool aliases.
- `preToolUse` command hooks are fail-closed on crash/non-zero exit but fail-open on timeout. HTTP errors/timeouts are fail-open.
- `agentStop` and `subagentStop` can force continuation, but an eight-block guard prevents infinite looping.
- `postToolUse` can replace a successful result and inject additional context; combined context is bounded.
- `userPromptTransformed` is a mutation-only point after runtime transformation and immediately before model-facing content is persisted/emitted.
- Cloud agent runs in an ephemeral Linux sandbox with restricted network egress. It does not fire `notification`; `permissionRequest` is absent or ineffective because tools are pre-approved.

Architectural consequence: a local observer should use a minimal, zero-stdout, always-exit-zero command handler with its own durable spool. A cloud observer should use an allow-listed HTTPS endpoint and cannot treat local files as durable.

### 2. GitHub Copilot CLI command reference — OpenTelemetry monitoring

Source: [GitHub Copilot CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring)

Load-bearing findings:

- Native OTel is off by default and activates when `COPILOT_OTEL_ENABLED=true`, `OTEL_EXPORTER_OTLP_ENDPOINT` is set, or `COPILOT_OTEL_FILE_EXPORTER_PATH` is set.
- Exporter choices are `otlp-http` and `file`.
- Native file export writes **all signals** as JSON Lines.
- Supported OTLP protocols are HTTP JSON and HTTP protobuf.
- The native span tree follows OpenTelemetry GenAI semantic conventions and centers on `invoke_agent`, `chat`, and `execute_tool` spans.
- Native telemetry carries model, token usage, cache/reasoning categories, cost/AIU information where available, tool-call IDs, durations, and other facts absent from hook payloads.
- Full message/tool content capture is opt-in through `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`; the safe default is false.

Architectural consequence: unlike the Claude implementation, the Copilot version should not convert hooks into a substitute GenAI trace. The right design is a **dual lane**: native GenAI telemetry plus custom hook-lifecycle telemetry.

### 3. Copilot CLI configuration directory and policy model

Source: [Copilot CLI configuration directory](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference)

Load-bearing findings:

- Default personal home is `~/.copilot`; `COPILOT_HOME` replaces it.
- User settings, repository settings, local settings, environment variables, and CLI flags have documented precedence.
- Hooks can live in personal, repository, local/inline, plugin, or machine policy locations.
- Policy hook files load before user/project/plugin hooks and cannot be disabled by normal `disableAllHooks` controls.
- Repository hooks are subject to folder trust; policy hooks are not.

Architectural consequence: the installer writes a standalone `.github/hooks/copilot-otel-bridge.json` rather than rewriting a general settings file. It removes/replaces only its own marked handlers and preserves unrelated handlers in the same file.

### 4. GitHub Copilot CLI changelog

Source: [github/copilot-cli changelog](https://github.com/github/copilot-cli/blob/main/changelog.md)

Why it matters:

- Hook and telemetry behavior has moved quickly through 2026: permission hooks, notification, subagent start, post-tool context, GenAI semantic alignment, hook progress, and prompt transformation appeared incrementally.
- The changelog is necessary to detect behavior that a stale tutorial or repository may not include.
- It confirms that relying on a fixed hook count from even one month earlier is unsafe.

Architectural consequence: event names are centralized in a strict tuple and documented with a verification date. Unknown events are rejected rather than silently mapped to a guessed semantic.

### 5. OpenTelemetry JavaScript documentation through Context7

Context7 library IDs:

- `/open-telemetry/opentelemetry-js`
- `/open-telemetry/opentelemetry-specification`

Load-bearing findings:

- Initialize the SDK before other instrumented modules.
- Use a batch processor for a long-running bridge and call `forceFlush()` before controlled shutdown.
- End every span; attributes cannot be meaningfully added after end.
- Supply links at span creation when possible so a head sampler can inspect them.
- Links may reference spans in the same trace or another trace and are appropriate for batch, fan-in/fan-out, and causal relationships that are not a single parent-child hierarchy.
- W3C trace context extraction must validate trace and span identifiers.

Architectural consequence: reconstructed local containment uses a parent; ambiguous or cross-plane relationships use links created up front. The bridge never gives a span multiple conceptual parents by arbitrarily selecting one.

## Informing exemplar repositories

### A. `github/awesome-copilot`

Repository: [github/awesome-copilot](https://github.com/github/awesome-copilot)

Relevant material:

- official/curated hook examples and a guide for observing Copilot activity;
- realistic command-hook configuration shapes;
- cross-platform shell considerations;
- evidence that hook payload details and examples evolve with CLI releases.

What was adopted:

- repository-level `.github/hooks/*.json` packaging;
- cross-platform `bash` and `powershell` entries;
- minimal observer handlers rather than embedding large logic in hook JSON.

What was not copied blindly:

- assumptions about older `toolArgs` string shapes. The bridge accepts either parsed JSON or a JSON-looking string and normalizes defensively.

### B. `github/copilot-sdk`

Repository: [github/copilot-sdk](https://github.com/github/copilot-sdk)

Relevant material:

- programmatic session/agent APIs;
- OTel configuration and lifecycle considerations for SDK consumers;
- proof that Copilot observability is designed as a platform surface, not merely a CLI log format.

What was adopted:

- separation between agent-native telemetry and integration-specific spans;
- GenAI semantic conventions where fields are exact;
- explicit shutdown/flush handling.

### C. `microsoft/vscode-copilot-chat`

Repository: [microsoft/vscode-copilot-chat](https://github.com/microsoft/vscode-copilot-chat)

Relevant material:

- monitoring guidance and enterprise configuration lineage shared with Copilot tooling;
- VS Code-compatible hook payload vocabulary;
- evidence that PascalCase/snake_case support is a deliberate compatibility layer, not an accidental second schema.

What was adopted:

- normalization of both native camelCase and VS Code-compatible payloads;
- preservation of `payload_format` as provenance rather than erasing the source dialect.

### D. `junhoyeo/tokscale`

Repository: [junhoyeo/tokscale](https://github.com/junhoyeo/tokscale)

Relevant material:

- a real consumer of Copilot's native OTel JSONL under `~/.copilot/otel/*.jsonl` or an explicit `COPILOT_OTEL_FILE_EXPORTER_PATH`;
- practical parsing of `chat` spans as the source of truth for token accounting;
- recommendation to use timestamped native OTel files instead of one unbounded file;
- an observed limitation: stable workspace attribution is not consistently available in native payloads.

What was adopted:

- a separate `tail:native` command;
- timestamped-file helper for the native file exporter;
- explicit statement that native `chat` spans, not hook spans, own token/cost accounting.

### E. `github/copilot-cli`

Repository: [github/copilot-cli](https://github.com/github/copilot-cli)

Relevant material:

- authoritative changelog and release artifacts;
- current behavior changes that are newer than many blog posts and examples;
- Alpine/musl release support, useful for the reference container choice.

What was adopted:

- Node 22 Alpine container compatibility;
- current hook names and newly documented behavior rather than older 6/8/13-event examples.

## Claude exemplars used for contrast

These did not determine Copilot behavior, but they informed the compare/contrast and prevented regressing useful patterns from the preceding Claude implementation:

- [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) — hook JSON logging, lifecycle diagrams, flow-control demonstrations.
- [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel) — collector configuration and Claude OTel deployment precedent.
- [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) — multi-agent event visualization patterns.

The current Claude documentation now lists 30 events, so older repositories describing 13 events are useful implementation precedents but not authoritative inventories.

## Three current architectural approaches

### Approach 1 — Native OTel only

```text
Copilot CLI → OTLP collector or native JSONL file
```

Strengths:

- lowest operational complexity;
- standard GenAI span hierarchy;
- exact model/token/tool-call/cost data;
- traces and metrics already correlated;
- native all-signal JSONL mode.

Weaknesses:

- does not preserve every hook input as a durable custom event contract;
- cannot prove that each configured hook boundary fired with the payload expected by policy;
- does not provide a local spool under collector outage;
- native file data is optimized for telemetry, not a stable hook audit schema.

Best for: ordinary usage/cost/performance monitoring.

### Approach 2 — Hook JSONL only

```text
Copilot hook → local JSONL → tail/dashboard
```

Strengths:

- deterministic lifecycle/control-plane record;
- inspectable raw or redacted payloads;
- easy local debugging;
- can continue through OTLP outage.

Weaknesses:

- 14-event ceiling;
- no model/token/cost facts in most payloads;
- no documented tool-call ID, weakening parallel correlation;
- no post-compaction event;
- risks interfering with `preToolUse` if the observer crashes.

Best for: compliance/audit of hook invocation and custom policy actions, not full agent tracing.

### Approach 3 — Dual lane (selected)

```text
                         ┌→ native OTLP / native JSONL: GenAI truth
Copilot CLI ─────────────┤
                         └→ hooks → spool → hook JSONL → custom OTel: lifecycle truth
```

Strengths:

- preserves standard native telemetry;
- adds deterministic hook audit data;
- local outage tolerance;
- clear ownership of attributes;
- supports a console waterfall without forcing a backend.

Weaknesses:

- two data streams must be joined by session/time and opportunistic context;
- hook/native correlation is not guaranteed because hook subprocess propagation is undocumented;
- more storage and retention policy work.

Best for: production agent-harness observability, regulated environments, and deep debugging.

## Key uncertainty register

### 1. Hook subprocess trace-context propagation

The bridge reads `TRACEPARENT`/`TRACESTATE` if present. Current Copilot hook documentation does not promise these variables. Therefore the feature is opportunistic, not a contract.

Resolution: local hook spans form a valid independent trace tree and use links when inherited context exists. Backend joins should also use `gen_ai.conversation.id`/session ID and timestamps.

### 2. Tool identity

Native `execute_tool` spans expose a tool-call ID; hook inputs do not document one.

Resolution: no fabricated ID. FIFO correlation is labeled heuristic. Native spans remain authoritative.

### 3. `general-purpose` subagent visibility

The reference explicitly says the built-in `general-purpose` agent does not emit `subagentStart`/`subagentStop` while YAML/custom agents do.

Resolution: dashboards must not equate “no subagent hook” with “no subagent activity.” Native `invoke_agent` spans are required to close that gap.

### 4. Native file schema stability

The file exporter is documented as all-signal JSONL, but OTel JSON representations and vendor attributes may evolve.

Resolution: treat native JSONL as an OTel signal stream and parse defensively by signal/name/semantic attributes, not by a monolithic frozen TypeScript interface.

### 5. Cloud durability

Cloud-agent filesystem is ephemeral and network is allow-listed.

Resolution: cloud mode generates direct HTTPS hooks for supported events and requires an externally durable endpoint. It omits CLI-only `notification` and `permissionRequest` from the generated subset.

## Decision summary

1. Keep native Copilot OTel enabled.
2. Use command hooks locally for durable spooling and HTTPS hooks in cloud.
3. Install all 14 current local events.
4. Normalize both supported payload dialects.
5. Write one append-only hook envelope per event.
6. Hash content by default.
7. Build a separate lifecycle trace projection without pretending it is the native GenAI tree.
8. Use links for ambiguous/cross-plane relationships.
9. Preserve exact uncertainty in attributes and documentation.
10. Re-verify the official hook reference before upgrading the event tuple in future releases.
