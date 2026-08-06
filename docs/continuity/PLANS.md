# PLANS

## Goal

A Claude Code plugin marketplace (`fintech-frontend`, `fintech-backend`) for enterprise fintech/banking work, with compliance-enforcement hooks (PCI-DSS, SOX, SOC 2, GLBA-FFIEC), now expanding to target four coding agents (Claude Code, Codex, Cursor, Copilot CLI) from one canonical source.

## Phases

1. **Initial prototype** (done, commit `f87c365`, 2026-07-08) — the two Claude Code plugins: `.claude-plugin/`, `.mcp.json`, `.lsp.json`, `agents/`, `skills/`, `commands/`, `hooks/hooks.json`, `scripts/`, `output-styles/` for both `fintech-frontend` and `fintech-backend`.
2. **Multi-agent expansion** (in progress, uncommitted as of 2026-07-19) — `shared/guards/guard-core.sh` extracted as the single portable enforcement implementation; `build/build.sh` regenerates `targets/{codex,cursor,copilot}/` from canonical `plugins/` + `shared/guards/`; `AGENTS.md` and `CLAUDE.md` added at repo root.
3. **Not yet started** — resolving the orphaned `plugins/*/scripts/guard-core.sh` copies (see REMEMBER.md); deciding whether per-plugin write guards should be collapsed into calls to `shared/guards/guard-core.sh` instead of inlining duplicate checks.
4. **Agent observability — Copilot OTel hook bridge** (working, committed 2026-08-02, branch `feat/copilot-otel-bridge`, commit `a2af5c3`) — the ChatGPT research deliverable `docs/copilot-research/CHATGPT_github-copilot-cli-otel-hook-bridge/` (frozen, SHA256SUMS-checksummed) promoted to top-level `copilot-otel-bridge/` as the runnable implementation: dual-lane (Copilot native OTel + hook JSONL ledger) bridge on port 14329, OTel Collector via docker compose on host ports 27431/27432, user-scope hooks installed to `~/.copilot/hooks/copilot-otel-bridge.json` (all 14 events), plus a self-contained trace-viewer UI at `/ui` (session Sidebar + ChatConversation pane with span waterfall) backed by `/api/sessions` and a pure-data `trace-projector.ts`.

   **2026-08-06 level-up (uncommitted):** Dockerfile copies `ui/`; hook generator `--content-mode`/`--post-timeout-ms`; smoke includes failure+error; `conversation-projector.ts` + `/api/sessions/:id/conversation[.md]`; rewritten nested conversation UI with sort/filter, code-block toolbar, export; validation **18/18**.

5. **Agent interop — copilot-mcp wrapper + @agent-fannypack/mcp** (done & pushed 2026-08-05, branch `feat/copilot-mcp`, commits `3fa0f1e..db436b2`) — the full agentic Copilot CLI wrapped as an MCP server via `@github/copilot-sdk` 1.0.8 (`copilot-mcp/`): `ask` + session lifecycle + models/status tools over three transports (stdio; Streamable HTTP serving MCP spec 2026-07-28 **and** legacy 2025-11-25 from one endpoint via TS SDK v2 stable 2.0.0; WebSocket per SEP-1287 upgrade on the same `/mcp` path — custom Transport, one port **27443**). Plus `agent-fannypack/mcp/` = standalone reusable `@agent-fannypack/mcp` package: ping (transport liveness), marco/polo (agent liveness), blast-timer dead-man watchdog with `withCheckIn` (every action call = implicit check-in; zero ⇒ connection blown up to nothing). Standalone JSON-RPC 2.0 typings + helper classes in `copilot-mcp/src/jsonrpc/`.

## Current facts (as of 2026-08-06, OTel level-up scope)

- Uncommitted delta under `copilot-otel-bridge/`: `Dockerfile`, `README.md`, `VALIDATION.md`, `scripts/smoke-test.{ps1,sh}`, `src/bridge.ts`, `src/generate-hooks.ts`, `ui/index.html`, **new** `src/conversation-projector.ts`, **new** `test/conversation-projector.test.ts`.
- Validation: `pnpm check` = typecheck + **18/18** tests + build.
- Live verify: bridge healthy on 14329; smoke `smoke-session-1785975144` conversation API → 15 events, 2 tools, 2 errors; `/ui` 200 with export + code-toolbar.
- Earlier real CLI dual-lane evidence still valid (native `invoke_agent`/`chat`/`execute_tool` + hook lifecycle at collector; organic session `6baa6c99…`).
- Commit/PR for this level-up still open; prior OTel commit `a2af5c3` on `feat/copilot-otel-bridge` still not pushed (confirm branch state before stacking commits).

## Current facts (as of 2026-08-05, copilot-mcp scope)

- Branch `feat/copilot-mcp` (from `main` @ `2df8536`) **pushed** to origin: 7 atomic commits `3fa0f1e` (fannypack) → `fe6346b` (scaffold+jsonrpc) → `649793d` (bridge) → `81b3045` (server core) → `52b7990` (transports) → `7d46fc5` (live-fire client) → `db436b2` (README).
- Live-fire verified on all three transports against the real Copilot process: `ask("What is 2+2?")`→"4" (~7s), marco→"polo" via a real session (7–12s RTT), blast-timer detonation observed killing the HTTP server (exit 1). Cross-agent: headless `claude -p --allowedTools mcp__copilot-mcp__ask` → "Paris".
- Registered: Claude Code user scope (`~/.claude.json`, `claude mcp list` → Connected) and `~/.copilot/mcp-config.json` (allowlisted: ping, marco, ask, session_list, status).
- OTel acceptance evidence (2026-08-03, seen 2026-08-05 in the still-running bridge's ledger): a **real** Copilot session `6baa6c99…` with subagents + MCP tool calls flowed through the hook lane — the phase-4 "real copilot acceptance run" happened organically; `/ui` render + native-lane arrival not yet formally checked off.
- Parallel uncommitted work NOT from the 2026-08-05 session: `copilot-otel-bridge/` modifications + new `src/conversation-projector.ts` (+ test) present in the working tree — another session's work; preserve, do not revert.

## Current facts (as of 2026-08-02, OTel scope)

- Branch `feat/copilot-otel-bridge` (from `main` @ `6506241`), one commit `a2af5c3` — 42 files, `copilot-otel-bridge/` only. Not pushed.
- Validation green: `pnpm check` = strict typecheck + 16/16 node:test + tsc build; synthetic smoke session verified end-to-end (13 hook events accepted, 16 spans received by the collector with `service.name=github-copilot-cli-hook-bridge`); UI browser-inspected.
- Residual acceptance test: a **real** `copilot` session against the installed user-scope hooks (smoke lane was synthetic).
- Bridge + collector were left running locally (stop: `docker compose down` in `copilot-otel-bridge/` + kill the node process on 14329).

## Current facts (as of 2026-07-19)

- Single commit on `main`: `f87c365` "Initial prototype" (2026-07-08).
- Everything else — `build/`, `shared/`, `targets/`, root `AGENTS.md`, root `CLAUDE.md`, `plugins/*/scripts/guard-core.sh`, and edits to `README.md` — is **uncommitted**.
- `CLAUDE.md` was authored this session via `/init`, documenting the canonical-vs-generated rule, build/validate commands, and guard testing.
- Root `AGENTS.md` is untracked and has not yet been read/reviewed this session — unclear if it's hand-authored or generated; `build.sh` fans out `targets/copilot/AGENTS.md` to the other targets but does not appear to write a root-level `AGENTS.md`.
- `shared/guards/guard-core.sh` is confirmed working: tested `--dialect plain` against a `kubectl delete` command (blocked, exit 1), a `double Amount` money type (blocked, exit 1), and `ls` (allowed, exit 0). `jq` 1.8.1 is present. `bash -n build/build.sh` passes.

## Non-goals

- No application/service code lives in this repo — it is plugin manifests, agent/skill/command Markdown, and enforcement shell scripts only.
- `targets/` is never hand-edited; it is a build artifact.
