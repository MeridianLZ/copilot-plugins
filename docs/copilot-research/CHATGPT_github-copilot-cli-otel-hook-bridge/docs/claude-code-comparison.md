# GitHub Copilot CLI versus Claude Code: hooks and OpenTelemetry

State of the art as of **2026-08-01**.

Primary official sources:

- [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
- [GitHub Copilot CLI OpenTelemetry monitoring](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#opentelemetry-monitoring)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage)

## Executive conclusion

GitHub Copilot CLI and Claude Code have converged on a broadly compatible hook model—JSON input, deterministic lifecycle triggers, command and HTTP handlers, structured decisions, permission interception, tool result rewriting, and agent-stop continuation—but they are not equivalent observability platforms.

**Claude Code has the richer deterministic hook surface.** The current official Claude reference exposes 30 named events, compared with Copilot CLI's 14. Claude lets an observer or policy engine see setup, prompt expansion, classifier denial, parallel tool-batch completion, explicit API stop failure, task lifecycle, teammate idle, instruction loading, configuration changes, working-directory changes, watched file changes, worktree creation/removal, post-compaction, MCP elicitation and result handling, and streamed message display. Those are not cosmetic additions: they create explicit control and audit boundaries for environment mutation, context composition, multi-agent scheduling, filesystem observation, and MCP human-in-the-loop workflows.

**Copilot CLI has the stronger native telemetry baseline.** Its current OTel implementation is enabled with standard-looking environment variables, uses OpenTelemetry GenAI semantic conventions, emits a native `invoke_agent → chat / execute_tool` hierarchy, includes token/cache/reasoning usage and tool-call identity, supports traces and metrics without Claude's trace beta gate, and can write all signals directly to JSONL. That means a production Copilot deployment can obtain a useful, standard agent trace without reconstructing the model/tool waterfall from hooks.

The result is an inversion:

- With **Claude Code**, the hook/file lane is often the most complete lifecycle record and native traces are a supplementary/beta lane.
- With **Copilot CLI**, native OTel is the most complete execution trace and hooks are a supplementary deterministic control/audit lane.

A correct architecture therefore should not copy the Claude implementation mechanically. The Copilot design in this repository keeps both lanes and assigns each one explicit ownership.

## Summary matrix

| Dimension | GitHub Copilot CLI | Claude Code | Practical winner |
|---|---|---|---|
| Documented hook events | 14 | 30 | Claude |
| Stable native GenAI trace hierarchy | Yes: `invoke_agent`, `chat`, `execute_tool` | Trace mode is enhanced telemetry beta; detailed hook spans have a further gate | Copilot |
| Native all-signal JSONL exporter | Yes | No equivalent single documented all-signal file exporter | Copilot |
| Standard GenAI semantic conventions | Broad native alignment | Partial: some `gen_ai.*`, many custom `claude_code.*` fields | Copilot |
| Exact tool-call ID in native telemetry | Yes | Yes in appropriate native telemetry/events | Tie |
| Exact tool-call ID in hook payload | Not documented | `tool_use_id` is present on core tool hooks | Claude |
| Parallel tool-batch boundary | No hook | `PostToolBatch` | Claude |
| Post-compaction boundary | No hook; native span events can indicate completion | `PostCompact` | Claude |
| Prompt transform boundary | `userPromptTransformed`, after runtime transformation and before persistence | `UserPromptExpansion`, before slash/MCP prompt expansion; different point | Different strengths |
| Environment/config/file lifecycle hooks | Very limited | Setup, instructions, config, cwd, file watch, worktrees | Claude |
| MCP elicitation hooks | Notification only for dialog; no structured elicitation hook pair | `Elicitation`, `ElicitationResult` | Claude |
| Agent-team/task hooks | Basic subagent start/stop; notification can report idle | Task create/complete, teammate idle, subagent start/stop | Claude |
| Cloud-agent hook support | Same general format, explicitly documented with cloud differences | Remote/headless environments exist, but no direct equivalent unified cloud-agent hook contract | Copilot |
| Enterprise machine policy hooks | Explicit policy directories; un-disableable by ordinary settings | Managed settings and policy controls, but different layering | Copilot clarity |
| Cross-tool hook compatibility | PascalCase events provide VS Code/Claude-compatible payloads and matcher aliases | Native schema; increasingly broad handler types | Copilot interoperability |
| Handler types | command, HTTP, session-start prompt | command, HTTP, MCP tool, prompt, agent | Claude |
| Async observer support | Notification is intrinsically async; no general async flag | General async command hooks supported where applicable | Claude |
| Programmatic permission interception | `preToolUse` and earlier `permissionRequest` | `PreToolUse`, `PermissionRequest`, plus `PermissionDenied` retry | Claude depth |
| Hook crash behavior for pre-tool command | Fail closed; timeout fail open | Blocking semantics vary by exit/decision; observer must also be carefully fail-open | Neither is trivial |
| Built-in subagent visibility | `general-purpose` does not emit start/stop | Broader hook visibility, plus agent IDs/types | Claude |
| Hook-result mutation | Tool args/results, subagent response, transformed prompt | Broad decisions/context/tool controls across more events | Claude overall |

## 1. Lifecycle surface: 14 versus 30 is a qualitative difference

A raw event count can be misleading if many events are aliases. Here, however, the missing Copilot events cover distinct architectural layers.

### Shared core events

Both systems expose the core interactive agent loop:

```text
session start
user prompt
pre-tool
permission request
post-tool success/failure
subagent start/stop
agent/response stop
notification
pre-compaction
session end
```

This shared core is sufficient for:

- command/tool policy checks;
- audit logs of prompts and tool calls;
- context injection at session/subagent/tool completion boundaries;
- basic turn, tool, and subagent waterfalls;
- session lifecycle metrics;
- stop guards that force an agent to continue when validation is incomplete.

That convergence is intentional. Copilot even supports PascalCase event names that yield VS Code-compatible snake_case fields and Claude-like tool aliases/matcher behavior for `PreToolUse` and `PermissionRequest`. A portable policy engine can therefore reuse a substantial core across ecosystems.

### Claude-only lifecycle categories

Claude's additional events fall into several meaningful groups.

#### Bootstrap and environment lifecycle

- `Setup`
- `CwdChanged`
- `FileChanged`
- `WorktreeCreate`
- `WorktreeRemove`

These events let Claude hooks participate in one-time CI preparation, react to directory transitions, watch environment/config files, and implement or audit isolated worktree lifecycle. Copilot has no deterministic equivalents. A Copilot observer can see related tool calls in native telemetry, but that is not the same as a pre/post control point owned by the harness.

Operational consequence: a Claude hook system can implement environment activation, dynamic watch paths, and worktree provisioning as first-class harness behavior. In Copilot, the same outcomes require tool interception, external filesystem watchers, wrapper scripts, or plugin/extension surfaces outside hooks.

#### Context provenance and mutation

- `InstructionsLoaded`
- `ConfigChange`
- `UserPromptExpansion`
- `PostCompact`

Claude can tell you exactly when instruction files enter context, why they were loaded, when configuration changes during a session, when a slash/MCP prompt expands, and when compaction has completed. Copilot provides `userPromptTransformed`, which is powerful but solves a different problem, and only a pre-compaction hook.

Operational consequence: Claude can build a detailed context-provenance timeline from deterministic hooks. Copilot needs native span events, session artifacts, or external configuration/file monitoring to achieve comparable attribution.

#### Permission and failure resolution

- `PermissionDenied`
- `StopFailure`

Copilot has the broad `errorOccurred` event and a pre-permission `permissionRequest`, but no post-classifier denial event with a retry contract and no exact “turn terminated because the API failed” hook. Claude's events separate policy denial from execution failure and normal stop from API stop failure.

Operational consequence: Claude can distinguish “user/policy rejected this action,” “classifier rejected it,” “tool failed,” and “model/API turn failed” using dedicated boundaries. Copilot's hook lane must infer some of this from broader error context or defer to native telemetry.

#### Parallelism and orchestration

- `PostToolBatch`
- `TaskCreated`
- `TaskCompleted`
- `TeammateIdle`

These events matter in a modern agent harness. `PostToolBatch` gives a precise fan-in point after parallel tool calls. Task and teammate events expose scheduler state, not merely child-agent completion.

Operational consequence: Claude hooks can model orchestration as a graph with explicit batch/task/idle transitions. Copilot hooks expose subagents, but the native OTel tree—not the hook surface—is the better source for parallel execution. There is no hook-level batch completion marker.

#### MCP human-in-the-loop

- `Elicitation`
- `ElicitationResult`

Copilot notifications can announce an elicitation dialog, but Claude exposes structured pre- and post-elicitation events with accept/decline/cancel and form content controls.

Operational consequence: Claude can enforce or audit MCP elicitation policy deterministically. Copilot can observe a notification but cannot implement the same structured hook-level governance.

#### Output streaming

- `MessageDisplay`

Claude can observe rendered message display increments/finality. Copilot does not expose an equivalent hook. Its native/programmatic JSON output and telemetry provide other ways to observe responses, but not the same hook boundary.

Operational consequence: Claude can build a hook-driven live output lane; Copilot needs its programmatic output, SDK, session stream, or native instrumentation.

## 2. Copilot's genuinely extra hook feature: model-facing prompt transformation

`userPromptTransformed` is not merely a rename of Claude's `UserPromptExpansion`.

Copilot's event fires after the runtime has transformed the submitted prompt into the content the model will receive, immediately before that content is emitted and persisted. It can replace that model-facing content while leaving the user's displayed timeline prompt unchanged. The replacement is persisted and replayed on resume.

Claude's `UserPromptExpansion` fires when a typed slash command, skill, or MCP prompt expands. It can block the expansion and add context, but it observes an earlier, command-specific transformation boundary.

The distinction can be expressed as:

```text
Copilot:
user-visible prompt
  → userPromptSubmitted
  → runtime transformations
  → userPromptTransformed  [inspect/replace final model-facing content]
  → persist/send

Claude:
user types slash/MCP prompt
  → UserPromptExpansion    [inspect/block expansion, add context]
  → expanded prompt
  → UserPromptSubmit
  → model processing
```

Copilot is stronger for final prompt canonicalization, redaction, policy stamping, or deterministic rewriting after runtime context assembly. Claude is stronger for governing command/skill/MCP expansion and for blocking an expansion before it becomes an ordinary prompt.

A cross-tool policy cannot treat these as interchangeable. It needs two policy stages:

1. expansion governance;
2. final model-facing transformation governance.

Today, Claude exposes the first and Copilot exposes the second.

## 3. Native telemetry: Copilot is ahead where it matters most for traces

### Copilot's native model

Copilot's official command reference describes a hierarchical GenAI trace:

```text
invoke_agent
├── chat
├── execute_tool
├── chat
└── execute_tool
```

Subagents also use `invoke_agent`. Provider inference is represented by child client spans. The native stream reports GenAI-standard operation names and attributes, model identity, token categories, cache/reasoning usage, tool call identity, tool duration/count, and additional GitHub Copilot metrics.

Crucially, Copilot also supports:

```text
COPILOT_OTEL_EXPORTER_TYPE=file
COPILOT_OTEL_FILE_EXPORTER_PATH=...jsonl
```

That exporter writes all signals as JSON Lines. It is immediately usable by local tools such as Tokscale and is ideal for disconnected debugging, replay, and cost analysis.

### Claude's native model

Claude exports stable metrics and log/events after `CLAUDE_CODE_ENABLE_TELEMETRY=1`, but distributed traces require `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`. Detailed `claude_code.hook` spans require additional detailed-beta variables and, for interactive CLI sessions, an organization allowlist. Claude's trace schema contains useful `claude_code.interaction`, LLM, tool, permission-wait, execution, and hook spans, but the maturity and activation story is more complex.

Claude does use some GenAI semantic attributes, but its native schema remains primarily Claude-specific. That is not inherently bad—vendor-specific fields are necessary—but it increases collector transform and backend portability work.

### Consequence for architecture

For Copilot:

- native spans are the authoritative execution trace;
- hook spans annotate lifecycle/control points;
- native file JSONL can be the local telemetry ledger;
- the custom hook JSONL exists for audit durability and hook payload fidelity.

For Claude:

- the hook/transcript file lane is often the authoritative lifecycle/content record;
- native OTel is a supplementary operational lane;
- a custom bridge has to reconstruct more of the trace tree.

This is why the Copilot implementation in this repository creates a separate `github.copilot.hook.*` trace projection instead of trying to recreate `invoke_agent` and `execute_tool` as if the native stream did not exist.

## 4. Correlation granularity: hooks are stronger in Claude, native OTel is stronger in Copilot

### Tool identity

Copilot's native `execute_tool` telemetry includes a GenAI tool-call ID. Its documented hook payloads provide `toolName` and `toolArgs`, but no tool-call ID. That creates a correlation gap precisely where parallel same-name calls occur.

Claude's core tool hooks expose `tool_use_id`, enabling exact pairing across `PreToolUse`, permission, success/failure, and batch events.

The correct Copilot hook mapping therefore uses:

- exact session ID;
- active turn containment;
- FIFO pairing by `sessionId + toolName` only when needed;
- explicit `heuristic=true` attributes;
- links rather than false parentage for ambiguous closures;
- native `execute_tool` spans as the authoritative identity graph.

### Subagent identity

Copilot `subagentStart` supplies name/display/description but not ID. `subagentStop` supplies the ID. Same-name concurrent subagents therefore require FIFO or another external join. Additionally, the built-in `general-purpose` agent does not emit subagent hooks.

Claude's subagent hook and on-disk lineage surfaces provide richer, more consistent identity. In the preceding Claude implementation, subagent lineage could be joined with sidechain files and metadata.

### Prompt/turn identity

Copilot hooks key primarily on `sessionId`; there is no documented per-prompt UUID in the hook payload. The bridge therefore models one active turn per session from `userPromptSubmitted` to `agentStop`.

Claude native events use `prompt.id`, and the hook/file ecosystem provides stronger turn/tool identifiers. That makes exact event-to-turn joins easier.

### Inherited W3C context

Claude documents W3C trace context propagation into Bash/PowerShell subprocesses under its tracing configuration. Copilot's hook reference does not guarantee that config-file hook commands inherit active `TRACEPARENT`/`TRACESTATE`.

The Copilot bridge reads them if present but treats them as opportunistic. This is another reason session/time/native semantic joins remain necessary.

## 5. Hook handler capability: Claude offers a broader execution engine

### Copilot handler types

Copilot supports:

- command;
- HTTP;
- prompt, only for `sessionStart` and primarily new interactive sessions.

Command entries have excellent cross-platform ergonomics: distinct `bash` and `powershell` fields, a fallback `command`, `cwd`, `env`, and timeout aliases. HTTP handlers support headers and controlled environment expansion.

### Claude handler types

Claude supports:

- command;
- HTTP;
- MCP tool;
- prompt-based LLM evaluation;
- agent-based verification with tool access.

It also supports conditional `if` filtering and general asynchronous hook execution in appropriate contexts.

### Practical difference

Claude hooks can invoke an MCP tool directly or delegate a decision to an LLM/agent inside the hook framework. Copilot requires a command/HTTP integration or an external plugin/SDK service to achieve the same behavior.

For deterministic compliance, this may actually be an advantage for Copilot: fewer embedded nondeterministic handler types make policy review simpler. For adaptive validation, Claude is more expressive.

A sensible enterprise posture is:

- use deterministic command/HTTP hooks for enforcement in both systems;
- reserve prompt/agent hooks for advisory validation where nondeterminism is accepted;
- never rely on a model-based hook as the sole security boundary.

## 6. Failure semantics: Copilot is explicit but has a dangerous observer footgun

Copilot's current reference is unusually explicit:

- command `preToolUse` crash or non-zero exit: deny;
- exit `2`: deny, even if stdout says allow;
- timeout: fail open;
- HTTP error/timeout/non-2xx: fail open;
- most other hook failures: log and continue.

This is reasonable for security enforcement, but dangerous for observability. A missing Node binary, syntax error, path move, or transient hook wrapper failure can deny every tool call.

The bridge's egress process therefore:

- reads stdin;
- normalizes and redacts;
- attempts a bounded local POST;
- atomically spools on failure;
- emits no stdout;
- catches all errors;
- always exits zero.

The two-second Copilot timeout is intentionally much larger than the egress's 250 ms network budget. Timeout is the last-resort fail-open behavior, not the normal reliability mechanism.

Claude has an analogous operational risk: exit code 2 can block at many control points, and a renamed/missing hook entrypoint can hard-block the session. The exact semantics differ, but both systems require observers to be engineered as production-critical code rather than casual shell snippets.

## 7. Enterprise governance and trust

### Copilot strengths

Copilot documents a clear hook source order and machine policy locations. Policy hooks:

- load before user/project/plugin hooks;
- are machine-wide;
- are available regardless of folder trust;
- cannot be disabled by ordinary `disableAllHooks` settings.

Repository hooks load only after folder trust. Cloud agent also reads repository hook files but runs them in an ephemeral sandbox with restricted egress.

This is a strong governance story for a Microsoft/GitHub enterprise: the same hook schema can be applied locally, by machine policy, in plugins, and in cloud agent, with differences called out explicitly.

### Claude strengths

Claude provides managed settings and extensive policy/configuration hooks, including `ConfigChange` and `InstructionsLoaded`, which let the runtime itself be audited for policy/context changes. Its hook surface can react to more governance-relevant lifecycle events.

### Trade-off

Copilot is stronger in **deployment hierarchy and cloud continuity**. Claude is stronger in **runtime introspection of governance-relevant changes**.

For an enterprise standard, use:

- Copilot policy hooks for un-disableable machine enforcement;
- repository hooks for shared project automation;
- local hooks only for personal observability;
- collector-side tenant/team/resource stamping;
- separate retention policies for content-bearing hook JSONL and native aggregate telemetry.

## 8. Cloud-agent behavior is a first-class Copilot feature

Copilot's hook reference explicitly identifies which events fire in cloud agent and how behavior changes:

- Linux only;
- `/workspace` or `/root` working directory;
- ephemeral filesystem;
- restricted outbound network;
- only `bash` or fallback `command` is relevant;
- `notification` does not fire;
- `permissionRequest` is absent/ineffective because calls are pre-approved;
- `preToolUse ask` becomes deny;
- manual compaction does not occur;
- session start/end fire once per job.

That makes direct local-file logging an invalid cloud architecture. The generated cloud mode in this project uses HTTPS hook entries for the 12 relevant events and assumes an allow-listed external endpoint.

Claude has remote/headless/SDK execution, but its hook documentation does not present the same unified “local CLI versus cloud agent” matrix. Copilot's explicit continuity is an extra feature for organizations that use both developer terminals and GitHub-hosted agents.

## 9. JSONL capabilities: Copilot has two clean file lanes

The requested data path is:

```text
harness egress
→ append-only JSONL
→ live tailed console
→ consumer endpoint
→ detailed trace dump
```

Copilot can fulfill this in two complementary ways.

### Native OTel JSONL

```text
Copilot runtime
→ COPILOT_OTEL_FILE_EXPORTER_PATH
→ all-signal OTel JSONL
→ native tail/parser
```

This is the best local source for:

- chat/model spans;
- token/cache/reasoning usage;
- tool-call IDs;
- native durations;
- metrics;
- native lifecycle span events.

### Custom hook JSONL

```text
Copilot hook subprocess
→ durable local egress/spool
→ hook-events.jsonl
→ pretty tail
→ custom OTLP spans
```

This is the best source for:

- proof that a hook event fired;
- normalized input payload;
- policy/control opportunity;
- redaction audit;
- hook source/dialect;
- retry/spool provenance.

Claude typically requires a more custom file capture system because it does not expose the same simple documented all-signal native JSONL exporter. That is a substantial Copilot advantage.

## 10. Exact extra and missing features

### Features Copilot has that Claude lacks or does not match directly

#### 1. `userPromptTransformed`

A deterministic post-runtime, pre-persistence model-facing prompt rewrite point.

#### 2. Native all-signal OTel JSONL exporter

One environment variable can create an append-only local OTel signal file usable by independent consumers.

#### 3. Stable native GenAI-semantic trace baseline without a trace beta gate

Copilot's official monitoring path is directly framed around GenAI semantic conventions.

#### 4. Unified local CLI and cloud-agent hook contract

The same reference documents both surfaces and exact behavioral differences.

#### 5. Cross-platform command fields in one hook entry

`bash`, `powershell`, and fallback `command` are first-class fields rather than requiring shell dispatch logic inside one command string.

#### 6. Explicit Claude/VS Code compatibility mode

PascalCase event names select snake_case payloads, Claude tool aliases, and Claude-like matcher rules for key events.

#### 7. Un-disableable machine policy hook directories

The policy hierarchy and interaction with `disableAllHooks` are explicit.

### Features Claude has that Copilot lacks

#### 1. Sixteen additional named events plus `MessageDisplay` (18 distinct names beyond shared core)

Claude exposes setup, expansion, denial, batch, failure, task/team, context/config/filesystem/worktree, compaction completion, elicitation, and message display events.

#### 2. Exact tool hook correlation

`tool_use_id` and `PostToolBatch` make parallel tool traces significantly more reliable.

#### 3. Structured post-denial retry

`PermissionDenied` can tell Claude the denied call may be retried.

#### 4. Explicit API/model stop failure

`StopFailure` distinguishes terminal API errors from normal response completion.

#### 5. Full context provenance hooks

`InstructionsLoaded`, `ConfigChange`, and `PostCompact` expose why context changed.

#### 6. Filesystem/environment reactive hooks

`CwdChanged`, `FileChanged`, and worktree hooks allow deterministic environment orchestration.

#### 7. Agent-team/task scheduling hooks

`TaskCreated`, `TaskCompleted`, and `TeammateIdle` expose scheduler state.

#### 8. Structured MCP elicitation governance

Dedicated request/result hook pair with action/content controls.

#### 9. More handler types

MCP tool, prompt evaluator, and agent verifier hooks are part of the framework.

#### 10. General async and conditional hook configuration

Claude has more built-in ways to keep observers off the critical path and filter them based on permission rules.

## 11. Recommended production architecture for both tools

A single normalized observability platform should not force both CLIs into one lowest-common-denominator schema. Use a layered model.

### Layer A — Native traces

```text
Copilot native OTel → collector
Claude native OTel  → collector
```

Normalize common fields in the collector:

```text
service.name
gen_ai.system
gen_ai.operation.name
gen_ai.conversation.id
gen_ai.request/response.model
gen_ai.usage.*
gen_ai.tool.name
gen_ai.tool.call.id
```

Retain vendor attributes under their namespaces.

### Layer B — Normalized hook envelope

Common envelope:

```json
{
  "schema_version": "1.0.0",
  "event_id": "uuid",
  "platform": "github-copilot-cli | claude-code",
  "canonical_event": "pre_tool_use",
  "native_event": "preToolUse | PreToolUse",
  "session_id": "...",
  "observed_at": "...",
  "source": "command-hook | http-hook | spool-replay",
  "payload_format": "camelCase | vscode-compatible | claude",
  "raw_or_redacted_payload": {}
}
```

Do not erase platform-specific events. Map shared events to a common category while retaining the native event.

### Layer C — Platform-specific lifecycle projections

Copilot:

```text
session → turn → hook-tool/subagent
```

Claude:

```text
session → turn/prompt → exact tool/batch/subagent/task/team/context/filesystem events
```

Do not claim feature parity where the event is absent.

### Layer D — Consumer joins

Join by strongest available identity:

1. native trace/span IDs;
2. tool-call ID;
3. prompt/turn ID;
4. agent ID/parent tool use ID;
5. session/conversation ID + bounded timestamp window;
6. explicitly labeled heuristic correlation.

## 12. Migration from the Claude bridge to this Copilot bridge

The reusable pieces are:

- append-only JSONL writer;
- atomic spool/replay;
- content modes and secret redaction;
- bounded attribute flattening;
- OTel exporter/flush lifecycle;
- point-span-per-hook pattern;
- parent-versus-link discipline;
- tail console;
- detailed collector debug exporter;
- additive installer principles.

The pieces that must change are:

1. **Event inventory:** 14 camelCase events, not 30 PascalCase Claude events.
2. **Config format:** standalone `{version:1,hooks:{...}}` file with command fields, not Claude's nested matcher/groups schema.
3. **Payload normalization:** accept camelCase and VS Code-compatible variants.
4. **Failure safety:** command `preToolUse` must never crash/non-zero.
5. **Correlation:** no hook-level tool-call ID; use FIFO/links and native trace authority.
6. **Native lane:** keep Copilot GenAI OTel enabled; do not rebuild model/tool spans.
7. **File exporter:** document and tail Copilot's own all-signal JSONL.
8. **Cloud mode:** generate HTTPS observers and omit CLI-only events.
9. **Compaction:** no reconstructed duration from hooks; use native compaction events.
10. **Prompt semantics:** include `userPromptTransformed` as a distinct audit boundary.

## 13. Which platform is “better” for observability?

The answer depends on what “observability” means.

### For standardized performance, token, cost, and tool traces

**Copilot CLI is better out of the box.** Its native OTel path is easier to enable, convention-aligned, and directly exportable to JSONL.

### For deterministic harness introspection and lifecycle policy

**Claude Code is better.** Its hook surface is more than twice as large and exposes context, scheduler, filesystem, worktree, batch, denial, failure, and elicitation boundaries.

### For a portable enterprise policy core

The shared `preToolUse`, permission, post-tool, stop, session, and subagent core is viable across both. Copilot's PascalCase compatibility helps. But parity ends at the core; advanced policy must be platform-specific.

### For cloud-hosted coding-agent continuity

**Copilot has the clearer unified story.** Repository hooks and the same event reference apply to cloud agent with documented constraints.

### For forensic completeness

Neither hook surface alone is sufficient:

- Copilot hooks miss identifiers and many lifecycle categories;
- Claude hooks do not contain all transcript/model content and native timing;
- both require native telemetry and/or session artifacts for a complete reconstruction.

## Final recommendation

Use the following rule:

> **Native telemetry describes what the agent runtime executed. Hooks describe what deterministic control boundaries the harness exposed. Preserve both, and never infer one from the other when the source platform does not provide the identifier or event.**

For GitHub Copilot CLI specifically:

1. enable native OTel to OTLP for traces/metrics;
2. optionally enable native OTel JSONL for local replay/cost tools;
3. install all 14 hook observers locally;
4. hash content by default;
5. use durable command egress and a local spool;
6. keep hook spans under a separate service name;
7. join native and hook lanes by conversation ID/time/context when available;
8. label FIFO/sole-candidate joins as heuristic;
9. use HTTPS-only direct hooks for cloud agent;
10. re-verify the official event table on every Copilot CLI upgrade.

For Claude Code:

1. preserve the broader hook/file capture plane as the lifecycle system of record;
2. enable native metrics/logs and beta traces where approved;
3. use exact tool, prompt, subagent, and batch IDs;
4. take advantage of configuration/context/filesystem/worktree/elicitation hooks rather than flattening them into generic events;
5. treat detailed native hook spans as supplementary until their gating and schema stabilize.
