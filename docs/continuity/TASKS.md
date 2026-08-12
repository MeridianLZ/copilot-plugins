# TASKS

## Current checkpoint — 2026-08-12 14:15 MDT

- [x] Audit 25 documents / 769 sections and current replication blockers.
- [x] Research OTel, GenAI, Copilot, MCP, W3C, and trace UI sources.
- [x] Write annotated bibliography with descriptive active hyperlinks.
- [x] Copy implementation plan verbatim into repository `docs/`.
- [x] Refresh all six canonical continuity files.
- [ ] Create canonical conversation identity and exact-ID joins.
- [ ] Preserve complete sanitized native trace/metric/log evidence.
- [ ] Keep evidence through coverage/correlation and project all links/events.
- [ ] Unify emitted/projected hook contracts and terminal status.
- [ ] Display all telemetry fields in searchable raw/normalized inspector.
- [ ] Add MCP stdio trace-context propagation.
- [ ] Prove 100% source-field accounting.
- [ ] Run full checks and fresh all-lane live deployment.

The older task sections remain durable history. This checklist is active.

## Prior checkpoint — 2026-08-10 16:32 MDT

- [x] Centralize proxy-aware redaction and local no-proxy runtime.
- [x] Normalize, sanitize, persist, and expose native OTel traces, metrics,
  and logs.
- [x] Make the native OTel cache restart-safe, bounded, and
  truncation-accounted.
- [x] Build source coverage/correlation and explicit gap dispositions.
- [x] Implement MCP carrier validation, HTTP/WS extraction, peer linkage, and
  bounded peer state.
- [ ] Read final MCP bounded-state review.
- [ ] Build UI trace/coverage/MCP evidence inspector.
- [ ] Build append-only evidence recorder.
- [ ] Run clean post-rotation non-native checkpoint.
- [ ] Run full parent-agent -> MCP peer -> native OTel -> UI acceptance.

The older task sections below are retained as history; this is the active
execution checklist.

## Current checkpoint — 2026-08-10 15:49 MDT

- [x] Centralize proxy-aware redaction and eliminate dense-percent ReDoS.
- [x] Enforce local no-proxy bridge/runtime behavior and preserve hook spool
  fallback.
- [x] Normalize native OTel traces, metrics, and logs with shared redaction.
- [x] Make native OTel cache restart-safe, bounded, and truncation-accounted.
- [x] Persist Collector signals locally and expose sanitized native OTel API.
- [x] Build source coverage/correlation ledger and gap projection.
- [ ] Complete clean post-rotation non-native canary-negative acceptance run.
- [ ] Restore `copilot-mcp` dependency installation; current px/npm retries end
  with optional-package 502/504/ECONNRESET failures and missing Darwin package
  materialization.
- [ ] Implement MCP W3C propagation and peer-session trace linkage.
- [ ] Finish UI trace/coverage inspector.
- [ ] Implement append-only evidence recorder and full live acceptance.

The historical incident and older task lists below are retained for audit
history; the checklist above is the active execution state.

## Critical security incident — 2026-08-08

- [x] Preserve the failed bootstrap evidence and correction records.
- [x] Identify the exposed value without reproducing the raw credential:
  identical authenticated `HTTP_PROXY`/`HTTPS_PROXY`, endpoint
  `vm-mb-az035.meridianbanker.com:8080`, 87-byte decoded URI, fingerprint
  `6bbf5140efb3dcd781d0c01d7f9331f88e4fb058766740b2727c40f8d13bbd52`.
- [x] Identify the direct transcript event and Docker systemd destination.
- [x] Identify provenance and plaintext copies: `.env.local`,
  `HKCU:\Environment`, `.gitconfig`, `.npmrc`.
- [x] Write crisis report:
  `docs/security/incidents/2026-08-08-proxy-credential-exposure.md`.
- [ ] Restart all inherited shells/services after rotation.
- [ ] Remove stale values from User environment, Git, npm, and WSL systemd.
- [ ] Implement the environment-only accessor and sealed WSL credential channel.
- [ ] Implement the credentialless local proxy gateway.
- [ ] Run a new append-only non-native checkpoint with canary leakage scans.
- [ ] Mark `bootstrap-planning-otel` done only after the clean checkpoint passes.

## Done — 2026-08-06 late (conversation replica, branch `feat/copilot-otel-replica`, pushed)

- [x] Investigate trace UI shortfall: click-through 6 rich sessions + live copilot-mcp session; root-caused all missing spans (double hook install ×2 events; hash content; hook lane lacks assistant prose; native session-state transcript unread; UI raw-JSON fallthrough).
- [x] Fix capture: delete dup `~/.copilot/hooks/copilot-otel-bridge.generated.json`; generator previews non-`.json` + `--apply` self-heal (`ed40729`).
- [x] Payload-hash dedupe at ingest + projection; sessionEnd guard; session reopen-on-late-events (`66f67cf`).
- [x] Native-first conversation projection: `native-session.ts` + `native-cache.ts`, doc schema 1.1.0 w/ source/model/usage, secrets scrubbed, encrypted reasoning = marker (`0b96ba2`, `221f62d`).
- [x] UI replica renderer: md bubbles, model chips, reasoning, tool cards, nested subagents + child links, permission rows, usage footer, waterfall fix (`1129f1f`, `2d492a7`).
- [x] Tests 18 → **34**; docs (`c6fdebb`); live-fire acceptance: 6baa replica render + fresh session verbatim ~2-4 s.

## Done — 2026-08-06 (hook-telemetry FAQ + PR)

- [x] `docs/HOOK_TELEMETRY_FAQ.md` + KB note: hook-lane value vs native transcript, hook inputs/context (stdin JSON + env + transcriptPath), no harness state beyond exit code, preToolUse exit≠0 = deny, containerized UI, SDK model/effort/context control surface (`701ea3e`).
- [x] compose: mount host `~/.copilot` ro + `COPILOT_HOME` so containerized replica works.
- [x] **PR #1** opened: `feat/copilot-otel-replica` → `main`.

## Open — conversation replica

- [ ] Merge decision for PR #1.
- [ ] copilot-mcp: expose `reasoning_effort` / `working_directory` / `system_message` on ask/session_create (SDK supports; wrapper only plumbs `model`).
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
