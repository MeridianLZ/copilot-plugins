# CURRENT TASK STATE

_Last updated: 2026-08-05 (scope: copilot-mcp / @agent-fannypack/mcp workstream)_

## Where things stand

The **copilot-mcp wrapper is done, live-fire verified, and pushed** — branch `feat/copilot-mcp`, 7 atomic commits `3fa0f1e..db436b2` on origin, working tree clean for this workstream. Two packages:

- `copilot-mcp/` — the full agentic Copilot CLI wrapped as an MCP server via `@github/copilot-sdk` 1.0.8 (SDK-spawned child over JSON-RPC; `COPILOT_MCP_CLI_URL` attaches to an external `copilot --headless`). 12 tools (`ask`, `session_create/list/events/destroy`, `models_list`, `status`, + signals). Three transports: stdio, Streamable HTTP, WebSocket — HTTP+WS share loopback port **27443** (`.env` SSoT), WS = SEP-1287-style upgrade on the same `/mcp` path via a custom Transport. MCP TS SDK **v2 stable 2.0.0** serves spec 2026-07-28 + legacy 2025-11-25 from one endpoint (Claude Code connects via legacy). Standalone JSON-RPC 2.0 typings/helpers in `src/jsonrpc/`.
- `agent-fannypack/mcp/` — standalone `@agent-fannypack/mcp` (publish-ready, unpublished): ping (transport liveness), marco/polo (agent liveness through an injected ask path), blast-timer dead-man watchdog (`withCheckIn` makes every action call an implicit check-in; countdown zero ⇒ `onDetonate` blows the connection up to nothing).

**Verified** (all against the real Copilot process, 2026-08-05): stdio/HTTP/WS each pass tools/list + ping + `ask`→"4" + marco→"polo"; watchdog detonation observed killing the HTTP server (exit 1); cross-agent `claude -p --allowedTools mcp__copilot-mcp__ask` → "Paris". `pnpm check` green in both packages (13 tests total).

**Registered**: Claude Code user scope (`claude mcp list` → ✔ Connected; tools visible as `mcp__copilot-mcp__*` in new sessions) and `~/.copilot/mcp-config.json` (allowlisted: ping, marco, ask, session_list, status).

**Working-tree caveat**: `copilot-otel-bridge/` modifications + new `src/conversation-projector.ts` (+test) are present but belong to a **parallel session** — preserve, don't commit/revert from this workstream. The OTel bridge from 2026-08-02 is still running (port 14329, healthy) and its ledger organically captured a real Copilot session on 2026-08-03 — hook-lane acceptance evidence for the phase-4 open item.

## Immediate next step

1. User decisions: merge/PR `feat/copilot-mcp`; publish `@agent-fannypack/mcp` or keep local.
2. (OTel leftover) formal acceptance close-out: native-lane arrival + `/ui` render of the 2026-08-03 real session.

## Key decisions this session

- Substrate = `@github/copilot-sdk` server-mode wrap, NOT the deprecated `gh copilot` extension the user's pasted Python reference wrapped.
- MCP TS SDK v2 (user-confirmed "v2 beta" pre-release choice; v2 went **stable 2.0.0** mid-build and was used).
- WS is a custom Transport (spec has no WS; SEP-1287 semantics: same endpoint, one JSON-RPC message per frame, `hasPerRequestStream` unset).
- One shared `BlastTimer` + one `CopilotBridge` per process; expiry hooks registered once per process (stateless HTTP builds a fresh McpServer per request).
- Default permission policy `readonly` (Copilot may read/search; write/shell rejected) — `COPILOT_MCP_PERMISSIONS=approve-all` opts out.
