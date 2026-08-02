# Claude Code Hook-to-OpenTelemetry Map

Verified against the official Claude Code hook reference on **2026-07-31**.

This document distinguishes three representations:

- **Point span:** one instantaneous `claude.hook.<Event>` span for every hook invocation.
- **Duration span:** an operation reconstructed from a start/end event pair.
- **Link:** a relationship that is relevant but is not a strict parent-child containment relation.

All events receive the common attributes described in [`attribute-link-contract.md`](attribute-link-contract.md). The event-specific fields below are also available under `claude.hook.payload.*` after sanitization and bounded flattening.

## Lifecycle map

| Hook event | Official event-specific input | OTel representation | Parent selection | Links and caveats |
|---|---|---|---|---|
| `SessionStart` | `source`; optional `model`, `agent_type`, `session_title` | Point span `claude.hook.SessionStart` | Inherited trace context if valid; otherwise root | May link to last completed turn on resume-like asynchronous delivery. It is not modeled as a session-long span because a session is unbounded. |
| `Setup` | `trigger` | Point span `claude.hook.Setup` | Inherited context or root | One-time preparation event; no natural duration pair. |
| `InstructionsLoaded` | `file_path`, `memory_type`, `load_reason`; optional `globs`, `trigger_file_path`, `parent_file_path` | Point span `claude.hook.InstructionsLoaded` | Current turn when `prompt_id` exists; otherwise inherited/root | File and glob values can be sensitive. `globs` is content-protected by default. |
| `UserPromptSubmit` | `prompt` | Point span plus starts `claude.turn` | `claude.turn` is parented to inherited context when supplied; point span is child of the new turn | Correlation key is `session_id + prompt_id`. Prompt text is hashed by default. |
| `UserPromptExpansion` | `expansion_type`; optional `command_name`, `command_args`, `command_source`, `prompt` | Point span | Current turn | Represents expansion of a slash command or similar input before model processing. No separate duration span. |
| `MessageDisplay` | `turn_id`, `message_id`, `index`, `final`, `delta` | Point span for every chunk; `index=0` starts `claude.message.display`; `final=true` ends it | Message duration span, otherwise current turn | `delta` is hashed by default. MessageDisplay hooks execute while content is rendered and should remain extremely fast. |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` | Point span plus starts `claude.tool.lifecycle` | Current turn or inherited native tool context | Exact correlation by `tool_use_id`. Tool input is hashed by default. |
| `PermissionRequest` | `tool_name`, `tool_input`; optional `permission_suggestions` and event-specific decision context; no stable `tool_use_id` in the documented input | Point span | Current turn or inherited native context | If exactly one open tool matches session, prompt, and tool name, link to it with `claude.link.heuristic=true`. Ambiguity produces no tool link. |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id`; optional `duration_ms` | Point span; ends `claude.tool.lifecycle` with status `OK` | Exact open tool span | Tool lifecycle context is retained in a bounded completed-tool cache so a later `PostToolBatch` can link to it. |
| `PostToolUseFailure` | `tool_name`, `tool_input`, `tool_use_id`, `error`; optional `is_interrupt`, `duration_ms` | Point span with `ERROR`; ends tool lifecycle with `ERROR` and exception event | Exact open tool span | Error detail is content-protected. Interrupt status is retained as a scalar attribute. |
| `PostToolBatch` | `tool_calls[]`; each entry contains `tool_name`, `tool_input`, `tool_use_id`, and result/response fields | Point span | Current turn | Links to every open or recently completed member tool by `tool_use_id`; link includes `claude.link.reason=post_tool_batch_member`. The batch is not made the parent of tool spans because it occurs after them. |
| `PermissionDenied` | `tool_name`, `tool_input`, `tool_use_id`, `reason` | Point span; ends open tool lifecycle when present | Exact open tool | This is an auto-mode denial after the classifier decision. The lifecycle ends at denial because execution did not occur. |
| `Notification` | `message`; optional `title`, `notification_type` | Point span | Current turn if scoped; otherwise inherited/root | Message and title are content-protected. Notification is not an error by default. |
| `SubagentStart` | `agent_id`, `agent_type` | Point span plus starts `claude.subagent` | Current turn or inherited native context | An unambiguous open `Agent`/legacy `Task` tool is recorded as a heuristic link, never promoted to a parent. `agent_id` is the exact end correlation key. |
| `SubagentStop` | `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`; optional `background_tasks[]`, `session_crons[]` | Point span; ends `claude.subagent` | Exact subagent span | Final assistant text is hashed by default. Background task and cron arrays are flattened or serialized under the payload namespace. |
| `TaskCreated` | `task_id`, `task_subject`; optional `task_description`, `teammate_name`, deprecated `team_name` | Point span plus starts `claude.task` | Current turn or subagent context when inherited | Exact correlation by `task_id`. Description is hashed; subject remains scalar unless local policy adds it to content keys. |
| `TaskCompleted` | Same task fields as `TaskCreated` | Point span; ends `claude.task` with `OK` | Exact task span | A task can span multiple turns. Its span remains independent of the current turn after creation rather than being reparented. |
| `Stop` | `stop_hook_active`, `last_assistant_message`, `background_tasks[]`, `session_crons[]` | Point span; ends `claude.turn` with `OK` | Current turn | If `prompt_id` is absent, the bridge closes the only unambiguous open turn for the session. Final assistant text is hashed. |
| `StopFailure` | `error`; optional `error_details`, `last_assistant_message` | Point span with `ERROR`; ends `claude.turn` with `ERROR` and records exception | Current turn | Error type is scalar; details and rendered error text are content-protected. Output and exit code of this hook are ignored by Claude Code. |
| `TeammateIdle` | `teammate_name`, deprecated `team_name` | Point span | Current turn/subagent context when available | Represents an attempted transition to idle, not a guaranteed terminal state because the hook can keep the teammate working. |
| `ConfigChange` | `source`; optional `file_path` | Point span | Current turn if scoped; otherwise inherited/root | `source` values include user/project/local/policy settings and skills. Policy changes cannot be blocked, but are still observable. |
| `CwdChanged` | `old_cwd`, `new_cwd` | Point span | Current turn | Both paths are explicit queryable attributes. No duration pair because the directory change is instantaneous. |
| `FileChanged` | `file_path`, `event` where event is `change`, `add`, or `unlink` | Point span | Current turn if scoped; otherwise root/link to last turn | Watch matchers are literal basenames, not useful regexes. The generator installs a conservative explicit set. |
| `WorktreeCreate` | `name` | Mapped point span only in the contract; **not installed** | Would use current turn/inherited context | Registering the hook replaces Claude's default worktree creation and requires a valid path response. A passive logger would break worktree creation. Implement as an action-owning wrapper before enabling. |
| `WorktreeRemove` | `worktree_path` | Point span | Current turn if scoped; otherwise root/link to last turn | Passive observation is safe. Failures are only logged by Claude Code and cannot block removal. |
| `PreCompact` | `trigger`, `custom_instructions` | Point span plus starts `claude.compaction` | Current turn or inherited context | Trigger is `manual` or `auto`. Custom instructions are hashed. There is no documented compact ID, so correlation uses session plus prompt/trigger fallback. |
| `PostCompact` | `trigger`, `compact_summary` | Point span; ends `claude.compaction` | Exact/fallback compaction span | Summary is hashed by default. PostCompact cannot affect the result. |
| `SessionEnd` | `reason` | Point span | Inherited/root; may link to last completed turn | Reasons include `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, and `other`. Default Claude budget is short; the egress relies on a bounded POST and local spool. |
| `Elicitation` | `mcp_server_name`, `message`; optional `mode`, `url`, `elicitation_id`, `requested_schema` | Point span plus starts `claude.elicitation` | Current turn or inherited MCP/tool context | Exact correlation by `elicitation_id` when supplied. Message and schema are content-protected. URL remains scalar but is subject to secret redaction/truncation. |
| `ElicitationResult` | `mcp_server_name`, `action`; optional `mode`, `elicitation_id`, `content` | Point span; ends `claude.elicitation` | Exact/fallback elicitation span | User response content is hashed by default. `action` is `accept`, `decline`, or `cancel`. |

## Stable explicit attribute mapping

The bridge promotes commonly queried values to stable names while also retaining a sanitized payload copy.

| Hook field | Stable trace attribute |
|---|---|
| `session_id` | `claude.session.id` |
| `prompt_id` | `claude.prompt.id` |
| `hook_event_name` | `claude.hook.event.name` |
| generated envelope ID | `claude.hook.event.id` |
| `cwd` | `claude.cwd` |
| `permission_mode` | `claude.permission.mode` |
| `effort.level` | `claude.effort.level` |
| `agent_id` | `claude.agent.id` |
| `agent_type` | `claude.agent.type` |
| `transcript_path` | `claude.transcript.path` |
| `model` | `gen_ai.request.model` and `claude.model` |
| `tool_name` | `claude.tool.name` |
| `tool_use_id` | `claude.tool.use_id` |
| `duration_ms` | `claude.duration_ms` |
| `task_id` | `claude.task.id` |
| `task_subject` | `claude.task.subject` |
| `teammate_name` | `claude.teammate.name` |
| `turn_id` | `claude.turn.id` |
| `message_id` | `claude.message.id` |
| `index` | `claude.message.index` |
| `final` | `claude.message.final` |
| `mcp_server_name` | `claude.mcp.server.name` |
| `elicitation_id` | `claude.elicitation.id` |
| `action` | `claude.elicitation.action` |
| `trigger` | `claude.trigger` |
| `source` | event-aware `claude.session.source` or `claude.config.source` plus payload copy |
| `file_path` | `claude.file.path` |
| `event` on FileChanged | `claude.file.event` |
| `old_cwd` | `claude.cwd.old` |
| `new_cwd` | `claude.cwd.new` |
| `worktree_path` | `claude.worktree.path` |
| `reason` | event-aware reason plus payload copy |
| `error` | `error.type` and payload copy |

## Relationship rules

### Exact parent

Use an exact parent only when a stable correlation key identifies one open operation:

```text
tool_use_id  → claude.tool.lifecycle
agent_id     → claude.subagent
task_id      → claude.task
message_id   → claude.message.display
prompt_id    → claude.turn
elicitation_id → claude.elicitation
```

### Heuristic link

A heuristic relationship is allowed only when there is exactly one candidate:

```text
PermissionRequest
  session_id matches
  prompt_id matches when present
  tool_name matches when present
  exactly one open tool remains
```

The link attributes are:

```text
claude.link.reason=permission_to_open_tool
claude.link.heuristic=true
```

### Batch links

`PostToolBatch` links to all member contexts:

```text
claude.link.reason=post_tool_batch_member
claude.tool.use_id=<member ID>
```

### Native trace context

When an envelope carries a valid `traceparent`:

- it becomes the parent if there is no stronger local operation parent;
- it becomes a link with `claude.link.reason=native_traceparent` if a local lifecycle span is the parent;
- invalid or all-zero contexts are ignored.

### Last-turn link

Asynchronous events without a current `prompt_id` may link to the most recently completed turn in the same session:

```text
claude.link.reason=last_completed_turn
```

This preserves discoverability without falsely parenting an out-of-turn event.

## WorktreeCreate opt-in design

Do not add this project's passive egress handler directly to `WorktreeCreate`.

A safe implementation must own the action:

1. Read the hook input.
2. Create the worktree using the desired VCS behavior.
3. Emit the observability envelope out-of-band without writing to stdout.
4. Print only the created absolute worktree path as the last non-empty stdout line.
5. Exit nonzero if creation fails.

Pseudo-flow:

```bash
#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"
name="$(jq -r '.name' <<<"$input")"
path="$HOME/.claude/worktrees/$name"

git worktree add "$path" >&2
printf '%s' "$input" | node /absolute/path/dist/src/hook-egress.js >&2 || true
printf '%s\n' "$path"
```

The production wrapper should also implement `.worktreeinclude`-equivalent behavior if your workflow depends on it, validate the path, and handle cleanup through `WorktreeRemove`.

## Primary source

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
