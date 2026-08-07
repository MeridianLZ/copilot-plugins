# CURRENT TASK STATE

_Last updated: 2026-08-06 late (scope: trace-UI conversation replica; supersedes the same-day "post commit/push + MCP peer live-fire" state — that work is committed as `59f6eb8` + follow-ups on `feat/copilot-mcp`)_

## Where things stand

**The trace viewer is now a verbatim conversation replica — implemented, live-fire verified, pushed.** Branch `feat/copilot-otel-replica` (off `feat/copilot-mcp`), 7 commits `ed40729..c6fdebb`, all under `copilot-otel-bridge/`.

| Area | Status |
|---|---|
| Double hook install (every event ×2) | Fixed — `~/.copilot/hooks/` has one config; generator previews are `*.generated.preview`; `--apply` self-heals |
| Dedupe | Payload-hash (stableJson+sha256, 10 s window, `COPILOT_TRACE_DEDUPE_WINDOW_MS`) at ingest AND projection — historical 2× ledger repairs at read time |
| Native lane | `src/native-session.ts` + `src/native-cache.ts` read `$COPILOT_HOME/session-state/<id>/events.jsonl` incrementally; conversation projects native-first, hooks as governance overlay, `source` field says which |
| UI | Conversation-doc renderer: user/assistant md bubbles, model chips, reasoning collapsible / encrypted marker, tool cards, nested subagent conversations + open-child-session links, permission rows, usage footer; waterfall min/max fixed |
| Validation | `pnpm check` **34/34**; smoke (hooks-only fallback) OK; replica render of `6baa6c99…` OK; live session `d6caf69a…` verbatim in ~2-4 s |

Bridge on **:14329** restarted with new dist and healthy. Test sessions disconnected.

**PR #1 is open** (`feat/copilot-otel-replica` → `main`, includes copilot-mcp + level-up + replica + hook-telemetry FAQ `701ea3e` + compose COPILOT_HOME mount). KB note written to master-kb.

## Immediate next step

1. Merge decision for PR #1 (user).
2. Optional follow-ups: copilot-mcp — expose `reasoning_effort`/`working_directory`/`system_message` (SDK supports; only `model` plumbed) and fix `tool_calls` `tool:"unknown"` summaries; native-lane OTel content flip if wanted; multi-epoch resume modeling.

## Key decisions (2026-08-06 late)

- Replica substrate = native session-state transcript, NOT hook payloads (no hook event carries main-agent prose — verified against the official hooks reference).
- Hook content-mode stays `hash`; native strings get the same `redactSecrets` pass; `reasoningOpaque`/`encryptedContent` never shipped, marker only.
- Correlate on `turnId`/`toolCallId`/`requestId`; native `parentId` is unreliable (dangling refs observed).
- A replica turn = one user exchange; native `assistant.turn_start/end` fire per model interaction and must not open turns.
- On-demand incremental read (UI poll = tick), no background tailers.
