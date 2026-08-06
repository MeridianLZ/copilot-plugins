# TASKS

## Done — 2026-08-06 late (conversation replica, branch `feat/copilot-otel-replica`, pushed)

- [x] Investigate trace UI shortfall: click-through 6 rich sessions + live copilot-mcp session; root-caused all missing spans (double hook install ×2 events; hash content; hook lane lacks assistant prose; native session-state transcript unread; UI raw-JSON fallthrough).
- [x] Fix capture: delete dup `~/.copilot/hooks/copilot-otel-bridge.generated.json`; generator previews non-`.json` + `--apply` self-heal (`ed40729`).
- [x] Payload-hash dedupe at ingest + projection; sessionEnd guard; session reopen-on-late-events (`66f67cf`).
- [x] Native-first conversation projection: `native-session.ts` + `native-cache.ts`, doc schema 1.1.0 w/ source/model/usage, secrets scrubbed, encrypted reasoning = marker (`0b96ba2`, `221f62d`).
- [x] UI replica renderer: md bubbles, model chips, reasoning, tool cards, nested subagents + child links, permission rows, usage footer, waterfall fix (`1129f1f`, `2d492a7`).
- [x] Tests 18 → **34**; docs (`c6fdebb`); live-fire acceptance: 6baa replica render + fresh session verbatim ~2-4 s.

## Open — conversation replica

- [ ] Merge/PR decision for `feat/copilot-otel-replica`.
- [ ] copilot-mcp workstream: `ask` tool_calls report `tool:"unknown"` — fix its event-summary parsing.
- [ ] Optional: flip `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` in env scripts if span-attribute content wanted in the OTel lane.
- [ ] Optional: model multi-epoch resumed sessions (session.resume) instead of one continuous wall-clock span.

## Done — 2026-08-06 (copilot-otel-bridge level-up)

- [x] SOTA refresh for agent/MCP/GenAI tracing (dual-lane, links, privacy fail-closed, Development-status GenAI pin).
- [x] Fix Dockerfile missing `ui/` copy in runtime image.
- [x] Fix generate-hooks content-mode split-brain (`--content-mode` / env + `--post-timeout-ms`).
- [x] Expand smoke scripts with ordered `postToolUseFailure` + `errorOccurred`.
- [x] Add `conversation-projector.ts` (nested verbatim tree + markdown) and unit tests.
- [x] Bridge APIs: `/api/sessions/:id/conversation` and `/conversation.md`.
- [x] Rewrite `ui/index.html`: sidebar sort/filter, nested timeline, code-block toolbar, copy/MD/JSON/PDF export, live refresh.
- [x] Verify: `pnpm check` 18/18; live smoke conversation coverage; `/ui` 200.

## Open — copilot-otel-bridge (post level-up)

- [ ] Commit the 2026-08-06 level-up (suggested split: hardening / projector+API / UI / docs).
- [ ] Push/PR `feat/copilot-otel-bridge` (or successor branch) including prior `a2af5c3` + new commits.
- [ ] Formal dual-lane acceptance note after commit: native GenAI spans + `/ui` render of a real session (hook lane already proven).
- [ ] Production hardening leftovers: replace collector debug exporter, TLS/auth if non-loopback, retention, collector redaction allow-list.
- [ ] Optional: smoke path that exercises real command-hook egress + spool replay (current smoke POSTs bridge HTTP directly).
- [ ] Optional: unit/integration tests for heuristic FIFO links, open-span timeout recovery, bridge HTTP endpoints, hook generator.

## Done — 2026-08-05 (copilot-mcp + @agent-fannypack/mcp)

- [x] Resolve the "python at the end of the following" referent — the user's pasted Gemini convo ending in a FastMCP `server.py` wrapping the deprecated `gh copilot` extension; read/understood, rejected as substrate in favor of `@github/copilot-sdk`.
- [x] SOTA verify (2026-08-05): MCP spec **2026-07-28 final**; TS SDK v2 **stable 2.0.0** (`@modelcontextprotocol/server|client|node`; monolithic `@modelcontextprotocol/sdk` retired); WebSocket NOT in spec (SEP-1287 open PR); `@github/copilot-sdk` 1.0.8 (`copilot --headless --port` external mode).
- [x] Build `agent-fannypack/mcp` (`@agent-fannypack/mcp`): ping / marco→polo / blast-timer + `withCheckIn`; 8/8 node:test.
- [x] Build `copilot-mcp/`: jsonrpc module (typings + framer/correlator/endpoint), CopilotBridge (`sendAndWait` idle-signal completion, root-agent answer filter, event sanitization, readonly permission policy), server core (12 tools), 3 transports (stdio / Streamable HTTP / WS on one port 27443), live-fire client; 5/5 tests, `pnpm check` green both packages.
- [x] Live-fire all transports vs real Copilot: ask→"4", marco→"polo", blast arm/reset; detonation observed tearing the HTTP server down (exit 1).
- [x] Register: `claude mcp add copilot-mcp` (user scope, Connected) + `~/.copilot/mcp-config.json` (allowlisted subset).
- [x] Cross-agent live fire: `claude -p --allowedTools mcp__copilot-mcp__ask` → "Paris".
- [x] Split into 7 atomic commits `3fa0f1e..db436b2` and **push** `feat/copilot-mcp`.

## Open — copilot-mcp

- [ ] Merge/PR decision for `feat/copilot-mcp` (pushed, no PR yet).
- [ ] Publish decision for `@agent-fannypack/mcp` (publish-ready; unpublished; consumed via `link:` locally).
- [ ] Production hardening if ever non-loopback: TLS/auth (`connectionToken`, bearer middleware), rate limiting.
- [ ] Optional: WS reconnect/replay semantics (SEP-1287 is still a draft — revisit when merged into a spec revision).

## Done — 2026-08-02 (Copilot OTel bridge)

- [x] Promote `docs/copilot-research/CHATGPT_github-copilot-cli-otel-hook-bridge/` → top-level `copilot-otel-bridge/` (frozen reference left intact, `SHA256SUMS` untouched).
- [x] Fix phantom `typescript@6.0.0` pin → `7.0.2` (6.0.0 stable never shipped; guide was assembled offline with stubs).
- [x] Fix `ATTR_HOST_NAME`/`ATTR_OS_TYPE` imports — incubating semconv attributes with no stable exports; inlined as string literals in `src/otel.ts`.
- [x] Remap collector host ports 14317/14318 → **27431/27432** via `.env` SSoT + compose interpolation (14318 and 24317/24318 already squatted locally; 14318 answers HTTP 401).
- [x] `pnpm check` green with real deps: strict typecheck, 16/16 tests, build.
- [x] Install user-scope hooks: `~/.copilot/hooks/copilot-otel-bridge.json` — all 14 events, command transport, hash content mode; egress verified silent/exit-0/atomic-spool (fail-open).
- [x] Add `src/trace-projector.ts` (pure-data span reconstruction mirroring SpanAssembler FIFO pairing) + `/api/sessions`, `/api/sessions/:id`, `/ui` routes + `ui/index.html` trace viewer (session Sidebar; ChatConversation pane rendering all 14 event types; span waterfall with heuristic/open/error states; live polling).
- [x] End-to-end verify: smoke session → JSONL ledger → spans at dockerized collector; `/flush` clean; UI inspected in browser.
- [x] Commit `a2af5c3` on `feat/copilot-otel-bridge`.

## Open — Copilot OTel bridge (historical; see post level-up above)

- [ ] **Acceptance run**: real `copilot` session in a trusted repo with `scripts/copilot-otel-env.ps1` sourced — confirm native lane + hook lane both arrive, and the session renders in `/ui`. *(2026-08-05 update: the hook lane is CONFIRMED organically — the still-running bridge's ledger captured a real Copilot session `6baa6c99…` on 2026-08-03 incl. subagents and MCP tool calls. Remaining: native-lane arrival + `/ui` render check.)*
- [ ] Decide whether to merge `feat/copilot-otel-bridge` → `main` and/or push.
- [ ] Production hardening items from the README checklist remain open (replace debug exporter, TLS/auth for non-loopback, retention policy, collector-side redaction).
- [ ] Optional: containerized `hook-bridge` service in compose still defaults its OTLP endpoint to the internal `otel-collector:4318` — verified fine; host-run bridge uses 27432. Revisit if the bridge itself moves into Docker permanently.

## Done

- [x] Phase 1: initial Claude Code plugins (`fintech-frontend`, `fintech-backend`) — commit `f87c365`.
- [x] Extract `shared/guards/guard-core.sh` as the single portable enforcement implementation (3 dialects: claude/codex/plain).
- [x] `build/build.sh` — regenerates `targets/{codex,cursor,copilot}/` from canonical source; validates all JSON (`jq empty`) and all shell (`bash -n`).
- [x] Author root `CLAUDE.md` via `/init` (2026-07-19) — canonical/generated rule, build & validate commands, guard test recipes, hook architecture, target-fidelity summary, gotchas.
- [x] Smoke-test `guard-core.sh --dialect plain` against deny and allow cases — behaves as documented.
- [x] `bash -n build/build.sh` syntax check — passes.

## Open

- [ ] Review root `AGENTS.md` (untracked) — confirm it's the intended fan-out target/content and not stray/duplicate of `targets/copilot/AGENTS.md`.
- [ ] Decide fate of `plugins/fintech-backend/scripts/guard-core.sh` and `plugins/fintech-frontend/scripts/guard-core.sh` (untracked, unreferenced by any `hooks.json` or by `build.sh`) — likely leftovers from the fail-open → fail-closed migration described in the README. Either wire them in or delete them.
- [ ] Resolve the modified `README.md` — diff not yet inspected this session; confirm it matches the multi-agent-expansion section already read, and stage/commit intentionally.
- [ ] Run `bash build/build.sh` end-to-end (not yet run this session — it rewrites `targets/`, which is currently uncommitted/dirty; confirm safe before running).
- [ ] Commit the phase-2 multi-agent-expansion work once the above are resolved.
- [ ] Consider collapsing per-plugin write guards (`plugins/*/scripts/guard-*-write.sh`) into thin wrappers around `shared/guards/guard-core.sh` to remove the duplicated rule-set (see REMEMBER.md).

## Follow-ups / lower priority

- [ ] Keep `targets/*/AGENTS.md` and any Copilot `.agent.md` tool-tier assignments in sync if new `*auditor`/`*code-reviewer` agents are added (naming convention drives read-only vs. read/edit/shell tiering in `build.sh`).
