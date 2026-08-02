# Attribute and Link Contract

Contract version: **1.0.0**

The JSONL envelope and trace namespace are intended to evolve additively. Consumers should ignore unknown fields and should not assume every optional field is present.

## Resource attributes

The bridge emits:

```text
service.name=claude-code-hook-bridge
service.version=1.0.0
host.name=<hostname>
os.type=<Node platform>
```

Additional values are parsed from `OTEL_RESOURCE_ATTRIBUTES`.

## Span names

```text
claude.hook.<EventName>       one point span per accepted hook
claude.turn                   UserPromptSubmit → Stop/StopFailure
claude.tool.lifecycle         PreToolUse → success/failure/denial
claude.message.display        first display chunk → final display chunk
claude.subagent               SubagentStart → SubagentStop
claude.task                   TaskCreated → TaskCompleted
claude.compaction             PreCompact → PostCompact
claude.elicitation            Elicitation → ElicitationResult
```

## Common point-span attributes

| Attribute | Type | Cardinality | Notes |
|---|---|---:|---|
| `claude.hook.event.name` | string | low | One of the 30 documented event names |
| `claude.hook.event.id` | string | unique | Envelope UUID; downstream idempotency key |
| `claude.hook.source` | string | low | `command-hook`, `http-hook`, or `spool-replay` |
| `claude.hook.schema_version` | string | low | Envelope contract version |
| `claude.hook.observed_at_unix_ms` | integer | high | Hook acceptance time |
| `claude.session.id` | string | high | Claude session correlation |
| `claude.prompt.id` | string | high | Matches native OTel `prompt.id` when present |
| `claude.cwd` | string | high | Sensitive path; trace-only |
| `claude.permission.mode` | string | low | Current Claude permission mode |
| `claude.effort.level` | string | low | Effective effort level |
| `claude.agent.id` | string | high | Subagent/teammate ID when supplied |
| `claude.agent.type` | string | medium | Agent name/type |
| `claude.transcript.path` | string | high | Sensitive local path; trace-only |

## Lifecycle attributes

| Attribute | Description |
|---|---|
| `claude.lifecycle.kind` | `turn`, `tool`, `message_display`, `subagent`, `task`, `compaction`, or `elicitation` |
| `claude.lifecycle.correlation_key` | Internal key used to pair start/end events |
| `claude.lifecycle.start_event` | Hook event that started the duration span |
| `claude.lifecycle.end_event` | Hook event that ended the duration span |
| `claude.lifecycle.recovered_end` | `true` when the bridge closed a stale or duplicate span |
| `claude.lifecycle.recovered_reason` | `timeout`, `duplicate_start`, or shutdown reason |

## Status and exception rules

| Event/end | Status |
|---|---|
| `PostToolUse` | `OK` |
| `Stop` | `OK` |
| `TaskCompleted` | `OK` |
| `PostToolUseFailure` | `ERROR`; exception recorded |
| `StopFailure` | `ERROR`; exception recorded |
| recovered lifecycle end | `ERROR` |
| other point spans | `UNSET` unless an explicit failure applies |

An exception event contains only the sanitized error message available to the bridge.

## Link schema

Every link has `claude.link.reason`.

| Reason | Meaning | Heuristic |
|---|---|---:|
| `native_traceparent` | Envelope's inherited W3C context differs from the local parent | no |
| `logical_turn` | A duration span is logically associated with an open turn while another parent context was selected | no |
| `post_tool_batch_member` | Batch point span relates to a completed/open member tool | no |
| `permission_to_open_tool` | Permission event likely belongs to the sole matching open tool | yes |
| `probable_agent_spawn_tool` | Subagent start likely originated from the sole matching open tool | yes |
| `last_completed_turn` | Out-of-turn event relates to the most recent completed turn in the session | no; temporal association only |

Heuristic links always include:

```text
claude.link.heuristic=true
```

Batch member links also include:

```text
claude.tool.use_id=<member tool_use_id>
```

## Sanitized payload attributes

The bridge recursively flattens the sanitized payload beneath:

```text
claude.hook.payload
```

Examples:

```text
claude.hook.payload.hook_event_name=PreToolUse
claude.hook.payload.tool_name=Bash
claude.hook.payload.tool_input.sha256=<digest>
claude.hook.payload.tool_input.bytes=71
```

Rules:

- Maximum default flatten depth: 3 below the payload root.
- Maximum default attributes per payload: 96.
- Primitive arrays up to 64 entries are retained as OTel arrays.
- Complex arrays and deep objects are stored as deterministic JSON strings.
- `null` is omitted because OTel attributes do not support null.
- Content values are sanitized before flattening.

## Content contract

### `off`

```json
{ "redacted": true }
```

### `hash`

```json
{
  "redacted": true,
  "sha256": "<64 hex characters>",
  "bytes": 1234
}
```

### `full`

- Secret patterns are replaced.
- Strings are truncated to `TRACE_CONTENT_MAX_BYTES`.
- Objects are deterministically serialized, redacted, truncated, and parsed back when possible.

Hash values are calculated over deterministic JSON before secret redaction. Treat the digest as sensitive metadata: it can reveal equality and can be dictionary-attacked for low-entropy content.

## JSONL durability contract

- One envelope per line.
- UTF-8 JSON with newline terminator.
- Append-only under normal operation.
- Event identity is `event_id`, not file offset.
- A replayed spool event retains its original `event_id` and timestamps but changes `source` to `spool-replay`.
- Consumers must deduplicate by `event_id` when replay or downstream retry is possible.

## Backend query examples

### Find all hook spans for one prompt

```text
claude.prompt.id = "550e8400-e29b-41d4-a716-446655440000"
```

### Find tools denied before execution

```text
name = "claude.hook.PermissionDenied"
```

### Find recovered spans

```text
claude.lifecycle.recovered_end = true
```

### Find heuristic relationships

```text
link.attributes["claude.link.heuristic"] = true
```

The exact query syntax depends on the trace backend.

## Compatibility rules

1. New attributes may be added without changing `schema_version`.
2. Existing attribute meanings will not be changed in place.
3. Removing or renaming envelope fields requires a schema-version increment.
4. Hook fields introduced by Claude Code are automatically retained under the flattened payload namespace even before they receive a promoted stable attribute.
5. Native Claude span names and beta fields are not part of this bridge's compatibility contract.
