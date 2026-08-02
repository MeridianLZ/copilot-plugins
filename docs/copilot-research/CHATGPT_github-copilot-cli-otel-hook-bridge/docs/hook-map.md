# GitHub Copilot CLI hook → OpenTelemetry map

Research/verification date: **2026-08-01**.

Authoritative source: [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference).

This document distinguishes three things that are easy to conflate:

1. **Hook invocation spans** — one point span for every hook payload accepted by this bridge.
2. **Reconstructed lifecycle spans** — duration spans inferred by pairing start/end hooks.
3. **Native Copilot OTel spans** — the CLI's own `invoke_agent`, `chat`, and `execute_tool` tree, which should remain enabled alongside the bridge.

## Complete current event inventory

| Copilot event | Fires when | Important payload fields | Output/control | Cloud agent | Bridge representation | Claude Code comparison |
|---|---|---|---|---|---|---|
| `sessionStart` | New or resumed session begins | `sessionId`, `timestamp`, `cwd`, `source`, optional `initialPrompt` | Optional `additionalContext`; `prompt` handlers are supported only here | Yes, once per job | Starts `github.copilot.hook.session`; emits point span | Direct analogue: `SessionStart`. Claude also distinguishes `clear` and `compact` starts and exposes model/transcript metadata. |
| `sessionEnd` | Session terminates | `sessionId`, `timestamp`, `cwd`, `reason` | Observation only | Yes | Ends session span after recovering open child spans; emits point span | Direct analogue: `SessionEnd`. Reason vocabularies differ. |
| `userPromptSubmitted` | User submits a prompt | `sessionId`, `timestamp`, `cwd`, `prompt` | Current reference describes observation only | Yes, at most once per cloud job | Starts `github.copilot.hook.turn`; prompt hashed by default; emits point span | Direct analogue: `UserPromptSubmit`, but Claude can block/add context and exposes `prompt.id` in native telemetry. |
| `userPromptTransformed` | Runtime has converted the submitted prompt into model-facing content, immediately before persistence/emission | `prompt`, `transformedPrompt` | `modifiedTransformedPrompt` rewrites model-facing content without changing the displayed prompt | Yes | Point span within current turn; both prompt forms hashed by default | **Copilot-only precision point.** Claude's `UserPromptExpansion` observes slash/MCP prompt expansion earlier in the pipeline; it is not the same semantic point. |
| `preToolUse` | Before a tool executes | `toolName`, `toolArgs` | `allow`, `deny`, `ask`, or `modifiedArgs` | Yes; `ask` behaves as deny | Starts `github.copilot.hook.tool`; point span is parented to it | Direct analogue: `PreToolUse`. Copilot command hook crashes/non-zero exits fail closed, while timeout is fail open. |
| `permissionRequest` | Before Copilot's permission service/rules/user prompt | `toolName`, `toolArgs` and permission context | `behavior: allow|deny`, message, optional interrupt | CLI only; cloud calls are pre-approved | Point span under turn; if exactly one tool is open, adds a heuristic link to it | Direct analogue: `PermissionRequest`. Claude additionally has `PermissionDenied` after classifier denial. |
| `postToolUse` | Tool completed successfully | `toolName`, `toolArgs`, `toolResult` | May replace successful result and/or add context, combined result capped by Copilot | Yes | Ends oldest compatible open tool span; emits point span | Direct analogue: `PostToolUse`. Copilot hook payload currently lacks a documented tool-call ID, so exact concurrent same-name correlation is impossible from hooks alone. |
| `postToolUseFailure` | Tool completed with failure | tool identity plus failure/result details | Recovery guidance; command exit `2` has special additional-context semantics | Yes | Ends tool span with error status; emits error point span | Direct analogue: `PostToolUseFailure`. |
| `agentStop` | Main agent finishes a turn | `transcriptPath`, `stopReason`, `stop_hook_active` | `block` forces another turn; runaway guard overrides after eight consecutive blocks | Yes | Ends turn span; emits point span | Direct analogue: Claude `Stop`. Claude additionally has `StopFailure` as a distinct terminal event. |
| `subagentStart` | Supported YAML/custom subagent is spawned | `transcriptPath`, `agentName`, optional display name/description | Optional context injection; cannot block creation | Yes | Starts `github.copilot.hook.subagent`; emits point span | Direct analogue: `SubagentStart`. Copilot's built-in `general-purpose` agent does **not** emit start/stop hooks. |
| `subagentStop` | Subagent completes normally | `agentId`, `agentType`, `agentName`, full `response`, `stopReason` | May block/continue or replace returned response | Yes | FIFO-pairs to start by session+agent name, stamps final agent ID, ends span | Direct analogue: `SubagentStop`. Claude start/stop payloads provide stronger lineage fields in current versions. |
| `preCompact` | Before manual or automatic context compaction | `transcriptPath`, `trigger`, `customInstructions` | Observation only | Auto only in cloud | Point span; links to current or most recent turn | Direct analogue: `PreCompact`. **Missing in Copilot hooks:** `PostCompact`; use native OTel compaction span events for completion. |
| `errorOccurred` | Runtime error during model, tool, system, or input processing | structured `error`, `errorContext`, `recoverable` | Observation only | Yes | Error-status point span; error body hashed by default, type retained | Partial analogue: Claude `StopFailure` plus failures in specific hooks. Copilot's event is broader but less lifecycle-specific. |
| `notification` | CLI emits shell, agent, permission, or elicitation notification | message/title and `notification_type` | Optional `additionalContext`; asynchronous/fire-and-forget | No | Point span; may link to most recent completed turn | Direct analogue: `Notification`, but type vocabularies and output semantics differ. |

## Point-span naming

Every accepted event creates exactly one point span:

```text
github.copilot.hook.sessionStart
github.copilot.hook.sessionEnd
github.copilot.hook.userPromptSubmitted
github.copilot.hook.userPromptTransformed
github.copilot.hook.preToolUse
github.copilot.hook.permissionRequest
github.copilot.hook.postToolUse
github.copilot.hook.postToolUseFailure
github.copilot.hook.agentStop
github.copilot.hook.subagentStart
github.copilot.hook.subagentStop
github.copilot.hook.preCompact
github.copilot.hook.errorOccurred
github.copilot.hook.notification
```

A point span starts and ends at the hook payload's timestamp. It represents **the lifecycle observation**, not the duration of the external hook command. Copilot's native OTel stream already emits hook execution span events/attributes; mixing that duration into this span would conflate the observed harness event with observer overhead.

## Duration-span reconstruction

| Span | Start | End | Correlation | Confidence |
|---|---|---|---|---|
| `github.copilot.hook.session` | `sessionStart` | `sessionEnd` | `sessionId` | Exact |
| `github.copilot.hook.turn` | `userPromptSubmitted` | `agentStop` | active turn per `sessionId` | Exact for interactive serial turns |
| `github.copilot.hook.tool` | `preToolUse` | `postToolUse` or `postToolUseFailure` | FIFO queue keyed by `sessionId + toolName` | Exact only when one compatible invocation is open; otherwise explicitly heuristic |
| `github.copilot.hook.subagent` | `subagentStart` | `subagentStop` | FIFO queue keyed by `sessionId + agentName`; ID appears only at stop | Exact only when one same-name invocation is open; otherwise explicitly heuristic |

### Why tool correlation is weaker than Claude Code

The current Copilot hook payload documentation does not expose `gen_ai.tool.call.id` or an equivalent `tool_use_id`. Native Copilot `execute_tool` spans do expose the GenAI tool-call identifier. Therefore:

- the **native OTel lane** is the authoritative tool waterfall;
- the **hook lane** is the authoritative hook payload/control-plane record;
- this bridge never fabricates an exact tool identifier;
- ambiguous same-name tool closures use a span link and set `github.copilot.hook.relationship.heuristic=true`.

That distinction is important in parallel tool execution. A visually plausible but false parent-child relationship is worse than an explicit heuristic link.

## Payload-format normalization

Copilot supports two event naming/payload dialects:

- camelCase event names (`preToolUse`) produce camelCase fields (`sessionId`, `toolName`, `toolArgs`);
- PascalCase names (`PreToolUse`) produce VS Code-compatible snake_case fields and Claude-compatible tool aliases/matcher behavior.

The bridge normalizes both into snake_case without discarding the original semantic fields:

```json
{
  "hook_event_name": "preToolUse",
  "session_id": "...",
  "payload_format": "camelCase",
  "timestamp": "2026-08-01T06:37:00.000Z",
  "cwd": "/repo",
  "tool_name": "bash",
  "tool_input": { "command": "pnpm check" }
}
```

The installer uses native camelCase events so it receives runtime tool names and the newest `userPromptTransformed` event. The normalizer still accepts PascalCase payloads for plugin/VS Code/Claude-compatible configurations.

## Hook failure semantics that affect an observer

The observer is intentionally a command hook because it can spool locally before returning. Copilot's `preToolUse` behavior makes implementation quality load-bearing:

- crash or any non-zero exit from a command `preToolUse` hook denies the tool;
- exit `2` also denies, regardless of a contradictory allow object on stdout;
- timeout is fail-open and falls through to normal permission handling;
- HTTP `preToolUse` failures are fail-open;
- direct HTTP `preToolUse` and `permissionRequest` URLs must be HTTPS because their responses can grant permissions.

`hook-egress.ts` catches every error, writes no stdout, and leaves exit status zero. A 250 ms forwarding timeout plus durable spool keeps the hook safely below the configured two-second Copilot timeout.

## Events present in Claude Code but absent from Copilot hooks

The current Claude Code hook surface contains these additional explicit events:

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

Some of the underlying activity exists in Copilot and may appear in native telemetry or a broader `notification`/`errorOccurred` event, but there is no equivalent deterministic hook boundary. See [claude-code-comparison.md](./claude-code-comparison.md) for the operational consequences.
