# Component: agent-fannypack

**Responsibility:** A small, host-agnostic TypeScript toolkit of agent-to-agent liveness
primitives packaged as MCP tool registrars: `ping` (transport liveness), `marco`/`sendMarco`
(agent liveness round trip), and `BlastTimer` + `registerBlastTimer`/`withCheckIn` (dead-man
watchdog that tears a connection down when a secondary agent stops signalling). It ships no
server of its own — a host MCP server passes in its `McpServer` and the toolkit registers tools
on it.

**Boundary:** in — tool registration, Zod input/output schemas, the timer state machine,
reply extraction/timeout helpers, the emitter-side `sendMarco` helper. out — transport
setup, process management, session storage, and what "blown up to nothing" actually means
(the host supplies `onDetonate`). `node_modules/` and `dist/` are excluded from the map.

## Constituent files

| File | Role |
|------|------|
| `agent-fannypack/mcp/src/index.ts` | Public barrel: re-exports all three tool modules and their types |
| `agent-fannypack/mcp/src/ping.ts` | `registerPing` — synchronous pong from the server process |
| `agent-fannypack/mcp/src/marco.ts` | `registerMarco` (receiver) + `sendMarco` (emitter) + reply extraction/timeout |
| `agent-fannypack/mcp/src/blast-timer.ts` | `BlastTimer` class, `registerBlastTimer` tool trio, `withCheckIn` wrapper |
| `agent-fannypack/mcp/test/signals.test.ts` | ping/marco behavior tests |
| `agent-fannypack/mcp/test/blast-timer.test.ts` | Watchdog arm/check-in/detonate tests |
| `agent-fannypack/mcp/package.json` | `@agent-fannypack/mcp` 0.1.0, ESM, `./dist/index.js` entry |

## Lynchpin symbols

| Symbol | Location | Why load-bearing |
|--------|----------|------------------|
| `registerPing` | `agent-fannypack/mcp/src/ping.ts:36` | Captures `registeredAt` at registration; the pong is produced by the server process with no model in the loop, so it answers regardless of agent status |
| `PongPayload` | `agent-fannypack/mcp/src/ping.ts:11` | `{pong:true, ts, uptime_ms, echo?, identity?}` — the transport-liveness contract |
| `registerMarco` | `agent-fannypack/mcp/src/marco.ts:49` | Routes `payload` into the injected `respond` (agent ask/input path); falls back to a local `'polo'` (degrading to transport liveness) when `respond` is omitted (`:50`) |
| `sendMarco` | `agent-fannypack/mcp/src/marco.ts:82` | Transport-agnostic emitter over any `callTool(name,args)` closure |
| `extractReply` | `agent-fannypack/mcp/src/marco.ts:95` | Tolerant unwrapping across `structuredContent` → text-block JSON → raw text → `reply` field; without it the `ok` verdict is unreliable |
| `withTimeout` | `agent-fannypack/mcp/src/marco.ts:124` | Bounds the round trip (default 30 000 ms) and always clears the handle |
| `BlastTimer` | `agent-fannypack/mcp/src/blast-timer.ts:24` | The watchdog state machine; private fields hold duration/deadline/handle/check-ins |
| `BlastTimer.start` | `agent-fannypack/mcp/src/blast-timer.ts:34` | Converts `duration`+`unit` via `UNIT_MS` (`:6`), rejects non-positive with `RangeError`, resets detonation state |
| `BlastTimer.checkIn` | `agent-fannypack/mcp/src/blast-timer.ts:52` | Any signal resets the full window; throws if unarmed or already detonated |
| `BlastTimer.#arm` | `agent-fannypack/mcp/src/blast-timer.ts:99` | Re-arms `setTimeout` and calls `handle.unref?.()` (`:105`) so the watchdog never keeps a finished process alive |
| `BlastTimer.#detonate` | `agent-fannypack/mcp/src/blast-timer.ts:108` | Runs **every** expire callback, swallowing failures — detonation cannot be resurrected |
| `registerBlastTimer` | `agent-fannypack/mcp/src/blast-timer.ts:174` | Registers `<prefix>_start`, `check_in` (unprefixed), `<prefix>_status`; wires `onDetonate` |
| `withCheckIn` | `agent-fannypack/mcp/src/blast-timer.ts:246` | Makes ordinary action calls double as check-ins; no-ops while unarmed so hosts can wrap unconditionally |

## Dependencies

- **Inbound (who uses this):** any host MCP server that wants liveness tools — in this
  repo, the `copilot-mcp` surface exposes exactly this tool set (`ping`, `marco`,
  `blast_timer_start`, `blast_timer_status`, `check_in`).
- **Outbound (what this uses):** `zod` (schemas), `@modelcontextprotocol/server` types
  (`McpServer`, `RegisteredTool`) — type-only imports. No filesystem, no network.

## Data flow

See [agent-fannypack-dataflow.mmd](agent-fannypack-dataflow.mmd). Output payload summary:
structured liveness records — `{pong,ts,uptime_ms}` (transport), `{reply,rtt_ms,ok}`
(agent round trip), and `{armed,detonated,remaining_ms,deadline,check_ins}` plus a
fired `onDetonate()` teardown when the countdown reaches zero.
