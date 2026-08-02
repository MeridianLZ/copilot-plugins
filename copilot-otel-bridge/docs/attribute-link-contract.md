# Attribute and link contract

Research/verification date: **2026-08-01**.

This contract is intentionally split between:

- **standard OpenTelemetry GenAI attributes**, used where the Copilot hook payload has a semantically valid value; and
- **`github.copilot.*` bridge attributes**, used for hook-specific facts that have no stable standard convention.

The bridge does not rename a hook field into a GenAI field merely because the names are similar. Standard attributes are reserved for exact semantic matches.

## Resource attributes

| Attribute | Value/source | Purpose |
|---|---|---|
| `service.name` | `OTEL_SERVICE_NAME`, default `github-copilot-cli-hook-bridge` | Distinguishes the custom hook lane from native `github-copilot` telemetry. |
| `service.version` | bridge package version | Schema/runtime provenance. |
| `service.namespace` | `agent-observability` unless overridden | Groups agent instrumentation. |
| `host.name` | local hostname | Host-level debugging. |
| `os.type` | Node platform | Windows/macOS/Linux diagnosis. |
| `github.copilot.telemetry.lane` | `hook-bridge` | Prevents confusion with native Copilot spans. |
| additional | `OTEL_RESOURCE_ATTRIBUTES` | Team, environment, repo classification, collector routing. |

Recommended production resource additions:

```text
deployment.environment.name=development|staging|production
service.namespace=developer-platform
team.name=<non-sensitive-team-slug>
repository.visibility=private|internal|public
telemetry.policy.version=<policy-version>
```

Do not place user prompts, commands, repository secrets, email addresses, tokens, or full local paths into resource attributes. Resource attributes are repeated on every exported signal and often indexed globally.

## Common point-span attributes

Every `github.copilot.hook.<event>` point span contains:

| Attribute | Type | Source |
|---|---:|---|
| `github.copilot.hook.event.name` | string | canonical camelCase event name |
| `github.copilot.hook.event.id` | string | bridge-generated UUID; stable through spool replay |
| `github.copilot.hook.source` | string | `command-hook`, `http-hook`, or `spool-replay` |
| `github.copilot.hook.payload_format` | string | `camelCase` or `vscode-compatible` |
| `github.copilot.hook.schema_version` | string | envelope schema version |
| `github.copilot.hook.observed_at_unix_ms` | integer | observer acceptance time |
| `github.copilot.session.id` | string | Copilot `sessionId`/`session_id` |
| `gen_ai.conversation.id` | string | same session identifier, because it is the native conversation identity |
| `github.copilot.cwd` | string | current working directory, when supplied |
| `github.copilot.transcript.path` | string | transcript path, when supplied and content policy permits |

The normalized payload is also flattened under `github.copilot.hook.payload.*`, bounded to:

- maximum depth: 3 for span attributes;
- maximum flattened attributes: 96 per point span;
- maximum scalar/string size: 16 KiB;
- maximum JSONL content value size: configurable, 32 KiB by default.

Complex or heterogeneous arrays become a bounded `.json` string. OpenTelemetry attribute arrays must be homogeneous primitive arrays.

## Standard GenAI attributes used by the bridge

| Attribute | Applied to | Source | Caveat |
|---|---|---|---|
| `gen_ai.conversation.id` | all hook spans | Copilot session ID | Exact. |
| `gen_ai.operation.name=execute_tool` | reconstructed tool spans | lifecycle role | Exact operation category, but bridge span is not the native provider/tool span. |
| `gen_ai.tool.name` | point/tool spans | `toolName`/`tool_name` | Exact name supplied by the selected Copilot payload dialect. |
| `gen_ai.tool.type=function` | reconstructed tool span | constant | Copilot tools are represented as callable tools; native Copilot span remains authoritative. |
| `gen_ai.operation.name=invoke_agent` | reconstructed subagent spans | lifecycle role | Exact operation category. |
| `gen_ai.agent.name` | point/subagent spans | `agentName` | Exact where present. |
| `gen_ai.agent.id` | subagent stop/closed span | `agentId` | ID is unavailable at `subagentStart`; it is stamped at close. |

The bridge deliberately does **not** fabricate:

- `gen_ai.tool.call.id` — absent from documented hook payloads;
- model name — absent from most hook payloads;
- token usage or monetary cost — use native Copilot `chat` spans/metrics;
- provider request/response identifiers — use native Copilot telemetry;
- workspace/repository identity — not stable in the current native file payload and not guaranteed in hooks.

## Lifecycle attributes

Duration spans add:

| Attribute | Description |
|---|---|
| `github.copilot.hook.lifecycle.kind` | `session`, `turn`, `tool`, or `subagent` |
| `github.copilot.hook.lifecycle.correlation_key` | internal correlation key; never presented as a native tool-call ID |
| `github.copilot.hook.lifecycle.start_event` | event that opened the span |
| `github.copilot.hook.lifecycle.end_event` | event that closed it, when available |
| `github.copilot.hook.lifecycle.recovered_end` | true when timeout/shutdown/session end had to close an incomplete span |
| `github.copilot.hook.lifecycle.recovered_reason` | `timeout`, `bridge_shutdown`, `session_end`, or `duplicate_start` |
| `github.copilot.hook.correlation.limit` | explicit reason exact identity is unavailable |
| `github.copilot.hook.relationship.heuristic` | true when the point event used a non-exact relationship |

Recovered spans receive OTel error status. This does not claim that Copilot itself failed; it reports that the observer could not see the expected closing hook.

## Content modes

Set `COPILOT_TRACE_CONTENT_MODE`:

### `off`

Every content-bearing field becomes:

```json
{ "redacted": true }
```

Use for the strictest enterprise environments where even deterministic hashes are undesirable.

### `hash` — default

Content-bearing values become:

```json
{
  "redacted": true,
  "sha256": "...",
  "bytes": 1234
}
```

This supports equality/change analysis without storing prompt/tool/response bodies. Hashes are **not anonymization**: a party that can guess the original value can hash the guess. Treat them as sensitive pseudonymous telemetry.

### `full`

Bodies are retained after:

- common GitHub, Anthropic, generic API, AWS, and bearer token redaction;
- password/token/key assignment redaction;
- UTF-8 byte truncation.

Regex redaction is defense in depth, not a data-loss-prevention proof. Full mode should be enabled only after explicit security/privacy approval and collector retention review.

## Fields classified as content

The current classifier includes:

```text
prompt
initial_prompt
transformed_prompt
last_assistant_message
response
message
additional_context
tool_input
tool_result
text_result_for_llm
custom_instructions
stack
error
description
agent_description
command
url
```

Structural identity such as `session_id`, event name, tool name, agent name/ID, reason, trigger, and recoverable flags is retained. For `errorOccurred`, the normalizer promotes `error.name` to `error_type` before hashing the error object.

## Parent-selection rules

The bridge chooses a single parent only when the relationship is a genuine containment relationship:

1. hook point for `preToolUse` → its newly opened hook-tool span;
2. hook point for an unambiguous `postToolUse*` → its hook-tool span;
3. subagent point → its unambiguous hook-subagent span;
4. general in-turn hooks → active hook-turn span;
5. session-scoped hooks → active hook-session span;
6. no local parent → inherited W3C context, when supplied.

The custom session/turn/tool/subagent tree is not a replacement for Copilot's native `invoke_agent → chat/execute_tool` hierarchy. It is a separate lifecycle projection.

## Link rules

OpenTelemetry links represent causal relationships that are not valid single-parent containment, including cross-trace references and ambiguous fan-in/fan-out. Links are supplied at span creation so head samplers can inspect them.

### Native W3C context link

When a hook process inherits a valid `TRACEPARENT` and a local reconstructed parent already exists, the point span remains under the local lifecycle parent and links to the native context:

```text
github.copilot.link.reason = native_traceparent
```

Copilot's current hook documentation does not guarantee that config-file hook subprocesses receive native OTel context. This is opportunistic and must not be relied on for correctness.

### Tool FIFO link

When multiple same-name tool invocations are open and a closing hook lacks an ID, the point span is parented to the turn/session and linked to the oldest compatible open tool:

```text
github.copilot.link.reason = fifo_tool_name_match
github.copilot.link.heuristic = true
```

The lifecycle span is closed by FIFO because leaving it open would be less useful, but its correlation limitation remains explicit.

### Subagent FIFO link

Equivalent behavior for same-name subagents:

```text
github.copilot.link.reason = fifo_agent_name_match
github.copilot.link.heuristic = true
```

### Sole-open-tool permission link

`permissionRequest` does not document a tool-call ID. When exactly one hook-tool span is open in the session, the permission point links to it:

```text
github.copilot.link.reason = sole_open_tool
github.copilot.link.heuristic = true
```

With zero or multiple candidates, no relationship is invented.

### Last-completed-turn link

Out-of-band `notification`, `errorOccurred`, or `preCompact` events may occur after the turn span ended. The point span can link to the last completed turn:

```text
github.copilot.link.reason = last_completed_turn
```

This is causal association, not containment.

## Deduplication and delivery semantics

Each envelope receives an `event_id` before forwarding. If forwarding fails, the same envelope is written atomically to a spool file. Replay preserves the ID and changes only `source` to `spool-replay`.

The bridge maintains a bounded in-memory set of the most recent 10,000 IDs. This protects against common at-least-once replay duplicates during one bridge process lifetime. It is not a persistent exactly-once ledger. Production deployments requiring exactly-once indexing should deduplicate on `github.copilot.hook.event.id` at the collector/storage layer.

## Native versus custom attribute ownership

| Question | Authoritative lane |
|---|---|
| What model was called? | Native Copilot `chat` span |
| How many input/output/cache/reasoning tokens? | Native Copilot `chat` span/metrics |
| What was the exact native tool call ID? | Native Copilot `execute_tool` span |
| How long did provider inference take? | Native Copilot telemetry |
| Did a particular hook event fire and what payload did it provide? | Custom hook JSONL/point span |
| What control opportunity existed at `userPromptTransformed`? | Custom hook lane |
| Was a hook payload lost during collector downtime? | Custom spool/JSONL lane |
| Did compaction complete? | Native Copilot compaction span events; there is no `postCompact` hook |
