# REMEMBER

_Append-only durable facts, invariants, and pitfalls. Do not delete; correct with a dated follow-up entry instead._

## 2026-08-06 late (conversation replica)

- **Correction:** test count gate is now **34** node:test cases (`pnpm check`), superseding the 18 noted earlier on 2026-08-06.
- **Invariant:** never place two `*.json` copies of the bridge hook config in a live Copilot hooks dir — Copilot loads every `*.json` and every event fires once per file. Generator previews are `*.generated.preview` (`generate-hooks.ts targetPaths()`); `--apply` deletes stale `*.generated.json`.
- **Invariant:** hook-event identity = sha256 of `stableJson(payload)` within `COPILOT_TRACE_DEDUPE_WINDOW_MS` (payload `timestamp` is ms-precision, so true collisions ≈ nil). `event_id` is minted per egress process and is NOT an identity across hook installs.
- **Invariant:** the conversation replica is projected **native-first** from `$COPILOT_HOME/session-state/<session_id>/events.jsonl`; hook lane is a governance overlay and the fallback (`source: hooks-only`) for sessions with no transcript (smoke/remote). No hook event carries main-agent assistant prose (only `subagentStop` has text) — verified against the official hooks reference 2026-08-06.
- **Native stream facts (copilot CLI 1.0.79-5):** envelope `{type,data,id,timestamp,parentId,agentId?}`; `parentId` unreliable — join on `turnId`/`toolCallId`/`requestId`; `assistant.message` chunks reassemble by `messageId`+`chunkIndex`; subagent `toolCallId` == the child hook-lane `session_id` (cross-link key); `assistant.turn_start/end` fire per model interaction — a replica turn is bounded by user messages instead; format undocumented upstream (copilot-cli#3551) → parse per-line defensively, ignore unknown types.
- **Security seam:** native transcript strings bypass hook sanitization — `redactSecrets` must run over ALL native content before it leaves the bridge; `reasoningOpaque`/`encryptedContent` are never shipped (marker only, `reasoningText` renders when present).
- **Pitfall:** `mcp__copilot-mcp__ask` `tool_calls` summaries report `tool:"unknown"` — copilot-mcp bridge summary bug (its event parsing predates SDK field changes), separate workstream.

## 2026-08-06 (copilot-otel-bridge level-up)

- **Invariant:** conversation export is server-authoritative via `src/conversation-projector.ts` (`projectConversation` + `conversationToMarkdown`). UI may fall back to client-side markdown, but MD/JSON export buttons should prefer `/api/sessions/:id/conversation[.md]`.
- **Invariant:** `trace-projector.ts` and `conversation-projector.ts` both depend on the same FIFO lifecycle pairing semantics as `span-assembler.ts`. Change pairing rules in all three (+tests) together.
- **Pitfall fixed:** Docker runtime image must `COPY ui ./ui` — bridge resolves `ui/index.html` relative to package root; shipping only `dist/` 404s `/ui` in containers.
- **Pitfall fixed:** generated command hooks previously hard-coded `COPILOT_TRACE_CONTENT_MODE=hash`, ignoring bridge/container env. Generator now takes `--content-mode` / env and `--post-timeout-ms`.
- **Pitfall:** smoke scripts still POST the bridge HTTP API directly — they validate span assembly/export, not installed command-hook egress or spool replay. Do not treat a green smoke as full hook-install proof.
- **UI contract (extended):** `/ui` is still a single zero-dep `ui/index.html`. Required affordances: sidebar sort/filter, nested chronological conversation, code-block hover toolbar (copy, line numbers, Aa±), export copy/MD/JSON/PDF. Print CSS hides chrome for PDF.
- **Test count gate:** `pnpm check` expects **18** node:test cases after conversation projector tests (was 16).


## 2026-08-05 (copilot-mcp + @agent-fannypack/mcp)

- **Invariant:** `agent-fannypack/mcp/` (`@agent-fannypack/mcp`) must stay app/vendor-agnostic — the three signals (ping, marco, blast timer) take injected hooks (`respond`, `onDetonate`, shared `timer`); never import copilot/bridge code into it.
- **Invariant:** blast-timer/`onExpire` hooks register **once per process**, never inside a per-request server factory — `createMcpHandler` builds a fresh `McpServer` per request (stateless), and per-request registration stacks duplicate detonate callbacks (observed: 11 dupes before the fix in `52b7990`).
- **MCP SDK v2 (2.0.0 stable)**: the monolithic `@modelcontextprotocol/sdk` is retired → `@modelcontextprotocol/{server,client,node}`; `serveStdio` from `@modelcontextprotocol/server/stdio`; client transports: `StreamableHTTPClientTransport` in the main export, `StdioClientTransport` under `/stdio`; **no WebSocket transport exists** (SEP-1287 is an open PR) — WS is a custom `Transport` (one JSON-RPC message per frame, same `/mcp` endpoint, `hasPerRequestStream` unset because WS shares one channel like stdio).
- **Copilot SDK facts (1.0.8, public preview — pin exact versions):** `session.sendAndWait(opts, timeout)` resolves on the idle signal (the completed-turn contract; NOT the last delta); answer text must filter to root-agent events (`event.agentId === undefined`) or sub-agent output duplicates in; permission decisions are `{kind:'approve-once'}`/`{kind:'reject'}` with request kinds shell/write/read/mcp/custom-tool; cleanup is `session.disconnect()` (resumable) vs `client.deleteSession()` (permanent); external server mode = `copilot --headless --port N` + `RuntimeConnection.forUri` (there is **no** `cliUrl` client option despite older docs).
- **pnpm 11 gotcha:** build-script approval lives in `pnpm-workspace.yaml` under `allowBuilds:` — the old `package.json` `pnpm.onlyBuiltDependencies` field is ignored (warns). pnpm even scaffolds the yaml with placeholder text you must edit to `true`.
- **Ports (this machine), updated:** 27431/27432 (OTel collector), 14329 (OTel bridge), **27443** (copilot-mcp HTTP+WS — one port carries both, WS via upgrade).
- **Registration surfaces:** Claude Code user scope in `~/.claude.json` via `claude mcp add copilot-mcp` (tools surface as `mcp__copilot-mcp__*`); Copilot side in `~/.copilot/mcp-config.json` with a `tools:` allowlist (kept to ping/marco/ask/session_list/status to bound copilot→copilot recursion).
- **Pitfall:** file:-protocol pnpm deps are copied at install — edits to the linked package don't propagate until reinstall. Use `link:` during co-development (`@agent-fannypack/mcp` is `link:../agent-fannypack/mcp` in copilot-mcp) and rebuild fannypack (`pnpm build`) before typechecking the consumer, since types resolve from its `dist/`.

## 2026-08-02 (Copilot OTel bridge)

- **Invariant:** `docs/copilot-research/CHATGPT_*` deliverables are frozen references with `SHA256SUMS` — never edit in place. The runnable implementation lives at top-level `copilot-otel-bridge/`; evolve only there.
- **Pitfall:** the research deliverable was assembled offline with stubs — it pinned `typescript@6.0.0`, which was **never published** (only `6.0.0-beta`; 7.0.2 current 2026-08). Always `pnpm install` such deliverables before trusting their pins.
- **Pitfall:** `ATTR_HOST_NAME`/`ATTR_OS_TYPE` are incubating OTel semconv attributes — not exported from stable `@opentelemetry/semantic-conventions`. Inline the string literals (`host.name`, `os.type`) or import from `/incubating` (version-brittle).
- **Ports (this machine):** 4317/4318, 14317/14318, AND 24317/24318 are already claimed by other local stacks (the 14318 squatter answers HTTP 401 — misleading "Unauthorized" export errors). This project's collector uses **27431 (gRPC) / 27432 (HTTP)** from `.env`; bridge is **14329**. Probe with `Get-NetTCPConnection -LocalPort <p> -State Listen` before binding anything OTLP-ish.
- **Fail-open by design:** the hook egress (`hook-egress.js`) must never block Copilot — no stdout, always exit 0, spool to disk on POST failure. Copilot `preToolUse` command hooks DENY on crash/non-zero exit; a chatty or crashing observer bricks every tool call. Preserve this in any egress change.
- **~/.copilot layout:** user-scope hooks live at `~/.copilot/hooks/*.json` (the generator stamps ours with env `COPILOT_OTEL_BRIDGE_HANDLER=1` for idempotent re-apply). `settings.json` is the only auto-loaded settings file; `otel_settings.jsonc` is a human catalog, not config. Native OTel activates via env vars in the shell that launches `copilot` (`scripts/copilot-otel-env.{sh,ps1}`).
- **Two JSONL files, two truths:** `hook-events.jsonl` (custom hook ledger — full payloads, decisions) vs `native-otel-*.jsonl` (Copilot's own all-signal export — tokens, cost, exact tool-call IDs). Hook lane has NO tool-call IDs — tool/subagent duration pairing is FIFO-heuristic; query native `execute_tool` spans for the authoritative waterfall.
- **UI contract:** trace viewer is served BY the bridge (`/ui`, `/api/sessions[/:id]`) from `ui/index.html` — dependency-free static file, no build step. `trace-projector.ts` must stay behaviorally in sync with `span-assembler.ts` pairing rules (both have tests; change them together).

## 2026-07-19

- **Invariant:** `plugins/fintech-{frontend,backend}/` and `shared/guards/` are canonical source. `targets/{codex,cursor,copilot}/` is 100% generated by `build/build.sh` and is overwritten on every run — never hand-edit it.
- **Invariant:** `shared/guards/guard-core.sh` is *the* single portable enforcement implementation, per the README's own words. Any new compliance rule belongs there first.
- **Pitfall:** `plugins/*/scripts/guard-*-write.sh` (e.g. `guard-backend-write.sh`) inline a *duplicate subset* of the checks already in `shared/guards/guard-core.sh` (Luhn PAN, SSN, secrets, float-money, `Database.Migrate()`). A rule change made only in `guard-core.sh` will silently miss the per-plugin copy and vice versa. Confirmed by direct read/diff of both files (2026-07-19).
- **Pitfall (unresolved):** `plugins/fintech-backend/scripts/guard-core.sh` and `plugins/fintech-frontend/scripts/guard-core.sh` exist on disk (untracked) but nothing in `hooks.json` or `build.sh` references them. Origin/intent unknown — flagged, not fixed.
- **Fail-closed design:** `guard-core.sh` exits 3 if `jq` is missing, deliberately — earlier hook scripts failed *open* (silently passed) without `jq`, which is called out in the README as a bug that was fixed. Any new guard/hook script must preserve fail-closed behavior.
- **Build = lint + test gate:** `bash build/build.sh` is simultaneously the regeneration step and the only validation this repo has — `jq empty` over all JSON, `bash -n` over every `.sh` file including generated ones under `targets/`. There is no separate test suite.
- **Platform note:** this repo is developed on Windows (`C:\Users\me\dev\fintech-marketplace`) but all scripts are bash; run build/guard commands from Git Bash, not PowerShell/cmd. `jq` 1.8.1 confirmed present on this machine.
- **Copilot CLI constraint:** the guard ships as repo-scope `.github/hooks/` rather than a Copilot plugin bundle *specifically* because plugin-defined `preToolUse` hooks don't fire in Copilot CLI (upstream bug github/copilot-cli#2540, open as of README's writing). Don't "clean up" that layout without re-checking the upstream issue status first.
- **Naming convention drives tooling:** in `build/build.sh`'s Copilot conversion step, agent names matching `*auditor|*code-reviewer|microservice-architect` get read-only tools (`read search`); everything else gets `read edit search shell`. New reviewer/auditor agents must follow that naming pattern to inherit read-only tiering automatically.
