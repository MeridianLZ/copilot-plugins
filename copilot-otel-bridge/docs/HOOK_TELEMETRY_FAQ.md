# Hook Telemetry FAQ

_Answers current to 2026-08-06 (Copilot CLI 1.0.79-5, `@github/copilot-sdk` 1.0.8). Sources: official hooks reference, installed SDK `.d.ts`, and this repo's live-fire verification._

## 1. What is the value of the custom hook telemetry (now that the replica reads the native transcript)?

The two lanes answer different questions:

| | Hook lane (custom) | Native `session-state/events.jsonl` |
|---|---|---|
| Delivery | **Push**, at event time (~ms) | Pull (file read; UI poll is the tick) |
| Reach | Can POST to a **remote** bridge/collector | Local disk of the machine running `copilot` only |
| Control | **Only lane that can DENY** (preToolUse exit ≠ 0) | Observation only, no control |
| Content | User prompts, tool args/results, subagent responses (mode-gated) | Everything verbatim, incl. main-agent prose + reasoning |
| Survives | Sessions with no transcript (remote/cloud, smoke fixtures) | Needs the session-state dir |
| Output | OTel spans to the collector + append-only JSONL audit ledger (SOC 2 evidence) | Raw event file, undocumented format (copilot-cli#3551) |

So the hook lane is the **control/governance plane and real-time signal** (enforcement, audit ledger, OTel export, permission decisions, failures); the native lane is the **verbatim conversation authority**. The replica projects native-first with the hook lane overlaid — neither replaces the other.

## 2. What inputs and "system memory" do hooks get? What context can they access?

Each hook is an **arbitrary process spawned by the Copilot CLI** per event:

- **stdin**: one JSON payload per event — always `sessionId`, `timestamp`, `cwd`, plus event-specific fields: `prompt` (userPromptSubmitted, verbatim), `toolName`/`toolArgs` (preToolUse), `toolResult.textResultForLlm` (postToolUse, full tool output), `error` (postToolUseFailure/errorOccurred), `response`/`lastAssistantMessage` (subagentStop), `initialPrompt` (sessionStart), `reason` (sessionEnd), `transcriptPath` (agentStop/subagentStart/preCompact), permission fields (permissionRequest).
- **env**: whatever the hook config bakes in (ours: `COPILOT_HOOK_EVENT`, bridge URL, data dir, content mode, timeouts) plus the full inherited environment of the `copilot` process.
- **"System memory"**: hooks run as the user — full filesystem, network, and OS access. Most valuable: `transcriptPath` → `~/.copilot/session-state/<sessionId>/` (`events.jsonl` verbatim transcript, `session.db` SQLite, `workspace.yaml` metadata). A hook can therefore read the entire conversation so far, even though its own payload is narrow.
- **Limits**: a per-handler timeout (ours: 2 s); no assistant main-message event exists in the hook vocabulary.

## 3. Can hooks set state in the harness beyond an exit code?

**No.** The only documented feedback channel is the process exit code. There is no structured-JSON decision protocol (unlike Claude Code's `permissionDecision`), no way to rewrite tool args, inject context, change model, or mutate session state from a hook. (Side effects on disk/network are of course possible — that's how this bridge exists — but the harness itself only reads the exit code.)

## 4. What can I do with exit code 1?

On **preToolUse**, any non-zero exit **denies the tool call** — that is the entire enforcement surface, and exactly how `shared/guards/guard-core.sh` ships for the Copilot target (`.github/hooks/`, deny on PAN/SSN/secrets/destructive commands; fail-closed exit 3 also denies). Exit codes on other events have no documented effect. Corollary for telemetry hooks: the egress **must** stay silent and exit 0 (fail-open, spool on failure) or a flaky observer bricks every tool call.

## 5. Is the UI a Docker container yet?

**Yes.** `compose.yml` has a `hook-bridge` service built from the repo `Dockerfile` (which copies `ui/` since the 2026-08-06 fix), publishing `127.0.0.1:14329` with the ledger volume-mounted. As of this change it also mounts the host `~/.copilot` read-only at `/copilot-home` (`COPILOT_HOME=/copilot-home`, override host path via `COPILOT_HOME_HOST`) so the **native conversation replica works inside the container** — without that mount a containerized bridge silently degrades to the hooks-only fallback. Note: the dev instance currently running on :14329 is the host `node dist/src/bridge.js`, not the container.

## 6. Can the primary agent set the model, context, and effort of the copilot agent?

**Yes — the SDK supports all three; copilot-mcp currently exposes only `model`.**

Per the installed `@github/copilot-sdk` typings (`SessionConfigBase` / `session.setModel`):

- **Model**: `createSession({ model })` and mid-session `await session.setModel("model-id", { reasoningEffort })`.
- **Effort**: `reasoningEffort?: ReasoningEffort` at session creation or via `setModel` — valid only when `capabilities.supports.reasoningEffort` is true for that model (check `models_list`).
- **Context**: several levers — `workingDirectory`, `systemMessage` (append/replace/customize sections via `SystemMessageConfig`), `MemoryConfiguration`, custom tools (`Tool`/`ToolHandler`), MCP servers (`MCPServerConfig`), custom agents, `InfiniteSessionConfig`.

Gap in our wrapper: `mcp__copilot-mcp__ask` plumbs only `prompt`/`session_id`/`model`/`timeout_ms`. Exposing `reasoning_effort`, `working_directory`, and a `system_message` append on `session_create`/`ask` is a small, worthwhile follow-up in `copilot-mcp/src/bridge/copilot-bridge.ts`.
