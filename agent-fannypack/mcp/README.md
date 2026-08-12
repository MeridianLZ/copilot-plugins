# @agent-fannypack/mcp

High-level **agent-to-agent signal primitives** for MCP (Model Context Protocol) servers. Three decoupled, independently importable signals — no app or vendor dependencies, reusable in any MCP project built on `@modelcontextprotocol/server` v2.

| Signal | Question it answers | Who answers |
|---|---|---|
| `ping` | Is the **transport/connection** alive? | The MCP server process itself — regardless of agent status |
| `marco` | Is the **agent** behind the connection alive? | The host agent's ask/input pipeline replies `polo` ASAP |
| `blast_timer` | Is the peer **still viable over time**? | Dead-man watchdog: countdown reset by any signal; zero → connection blown up |

## Install

```bash
pnpm add @agent-fannypack/mcp @modelcontextprotocol/server zod
```

Peer deps: `@modelcontextprotocol/server ^2.0.0` (MCP spec 2026-07-28 + legacy 2025-11-25), `zod ^4`.

## ping — transport liveness

```ts
import { registerPing } from "@agent-fannypack/mcp";

registerPing(server, { identity: { host: "copilot-mcp" } });
// tool "ping": { echo? } → { pong: true, ts, uptime_ms, echo?, identity? }
```

Answered synchronously in-process — pongs the open tool connection even when the agent behind it is wedged.

## marco — agent liveness (symmetric)

Register in **both** the primary and secondary tool sets. The sender emits `"marco"`; the receiver routes it through its real agent pipeline and replies `"polo"` as quickly as possible.

```ts
import { registerMarco, sendMarco } from "@agent-fannypack/mcp";

// Receiver side: inject YOUR agent's ask/input path.
registerMarco(server, {
  respond: async (input) => agent.ask(input), // expected to say "polo"
});

// Emitter side: transport-agnostic — hand it any callTool closure.
const { reply, rtt_ms, ok } = await sendMarco(
  (name, args) => client.callTool({ name, arguments: args }),
);
```

`ok` is true only when the reply is `polo` — a wrong reply means the transport works but the agent is not answering sanely.

## blast_timer — dead-man watchdog

The primary agent communicates a countdown **once**; the secondary has that span of disappearing time to report *any* signal, which resets the full window. Zero = the secondary failed → the connection is **blown up to nothing** via `onDetonate`.

```ts
import { registerBlastTimer, withCheckIn } from "@agent-fannypack/mcp";

const { timer } = registerBlastTimer(server, {
  onDetonate: async () => {
    await transport.close();     // what "nothing" means is host-defined
    sessions.destroyAll();
  },
});
// tools: blast_timer_start { duration, unit? = "s" | "ms" | "m" }
//        check_in          { signal? }        → resets countdown
//        blast_timer_status                    → read-only

// Check-in rides in tandem with real action calls:
server.registerTool("ask", cfg, withCheckIn(timer, askHandler));
```

`BlastTimer` is also exported standalone (`start` / `checkIn` / `stop` / `remainingMs` / `onExpire` / `status`) for non-MCP hosts.

## Development

```bash
pnpm check   # typecheck + node:test units + build
```
