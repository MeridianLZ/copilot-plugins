# Component: copilot-mcp

**Responsibility:** A Model Context Protocol (MCP) server that wraps one long-lived GitHub Copilot CLI agentic process and exposes it as tools (`ask`, `session_create`, `session_list`, `session_events`, `session_destroy`, `models_list`, `status`, plus one `ask_<persona>` tool per peer persona). It owns Copilot session lifecycle, correlates JSON-RPC requests to responses over NDJSON framing, and serves the same server over stdio, HTTP, and WebSocket transports.

**Boundary:** in — MCP tool surface, Copilot session management, JSON-RPC framing/correlation/error shaping, persona loading, transport wiring, blast-timer teardown; out — telemetry export and hook ingestion (that is `copilot-otel-bridge`), Copilot's own model/inference behavior, and the agent/skill content shipped by `copilot-plugin`.

## Constituent files

| File | Role |
|------|------|
| `copilot-mcp/src/server.ts` | Builds the `McpServer` and registers every tool with zod-typed input/output schemas |
| `copilot-mcp/src/bridge/copilot-bridge.ts` | Owns exactly one wrapped Copilot CLI process and its sessions |
| `copilot-mcp/src/config.ts` | Env/dotenv config SSoT: host, `httpPort` 27443, model, `cliUrl`, ask timeout, permissions, persona dir |
| `copilot-mcp/src/personas.ts` | Loads peer-copilot personas (`chewy`, `buzz`, `goose`) from disk |
| `copilot-mcp/src/jsonrpc/types.ts` | JSON-RPC 2.0 message types, error codes, constructors, type guards |
| `copilot-mcp/src/jsonrpc/helpers.ts` | `NdjsonFramer`, `JsonRpcCorrelator`, `JsonRpcEndpoint`, `JsonRpcRemoteError` |
| `copilot-mcp/src/transports/stdio.ts` | stdio entry (stdout = protocol, stderr = diagnostics); blast-timer teardown |
| `copilot-mcp/src/transports/http.ts` | Node HTTP server bound to `config.host:config.httpPort` |
| `copilot-mcp/src/transports/ws.ts` | `WsServerTransport` + `attachWebSocket` upgrade on the HTTP server |
| `copilot-mcp/src/test-client.ts` | Local client harness for exercising the tools |
| `copilot-mcp/test/jsonrpc.test.ts`, `test/ws-transport.test.ts` | Framing/correlation and WS transport tests |

## Lynchpin symbols

| Symbol | Location | Why load-bearing |
|--------|----------|------------------|
| `buildServer` | `copilot-mcp/src/server.ts:50` | Single place every MCP tool is registered; the server's entire public contract |
| `ask` tool registration | `copilot-mcp/src/server.ts:71` | Primary tool — routes a prompt into a (possibly persistent) Copilot session |
| persona `ask_<name>` registration | `copilot-mcp/src/server.ts:204` | Fans one tool per persona out of `loadPersonas`, so persona files change the tool surface |
| `CopilotBridge` | `copilot-mcp/src/bridge/copilot-bridge.ts:56` | Owns the one wrapped CLI process; all session state lives here |
| `CopilotBridge.client` | `copilot-mcp/src/bridge/copilot-bridge.ts:63` | Lazy, once-only start of the CLI child (`#starting ??=`) — guards double-spawn |
| `CopilotBridge.createSession` | `copilot-mcp/src/bridge/copilot-bridge.ts:91` | Session creation + event subscription; tolerates unknown SDK event types (public preview) |
| `CopilotBridge.ask` | `copilot-mcp/src/bridge/copilot-bridge.ts:181` | Request path: resolve session → send prompt → collect `AskResult` under `askTimeoutMs` |
| `CopilotBridge.destroyAll` | `copilot-mcp/src/bridge/copilot-bridge.ts:290` | Blast-timer/shutdown path — no orphaned CLI children |
| `loadConfig` | `copilot-mcp/src/config.ts:43` | Config SSoT; `COPILOT_MCP_PERMISSIONS` defaults to `readonly` unless explicitly `approve-all` |
| `loadPersonas` | `copilot-mcp/src/personas.ts:44` | Turns persona markdown into the `Persona[]` that drives peer tools |
| `NdjsonFramer` | `copilot-mcp/src/jsonrpc/helpers.ts:29` | Byte stream → discrete JSON-RPC messages; the wire boundary |
| `JsonRpcCorrelator` | `copilot-mcp/src/jsonrpc/helpers.ts:77` | Matches responses to in-flight request ids — concurrency correctness |
| `JsonRpcEndpoint` | `copilot-mcp/src/jsonrpc/helpers.ts:136` | Dispatches requests/notifications to registered handlers |
| `makeError` | `copilot-mcp/src/jsonrpc/types.ts:99` | The only error-response constructor; every failure is shaped here |
| `attachWebSocket` | `copilot-mcp/src/transports/ws.ts:58` | Upgrades the HTTP server into a WS MCP transport |

## Dependencies

- **Inbound (who uses this):** MCP hosts that spawn the stdio entry (Claude Code, Codex, Cursor); HTTP/WS clients on `127.0.0.1:27443`; `copilot-plugin`'s `.mcp.json` registers it so its peer-copilot agents (Chewy/Buzz/Goose) can call `ask_*`.
- **Outbound (what this uses):** `@modelcontextprotocol/server`, `@agent-fannypack/mcp` (`BlastTimer`), the GitHub Copilot CLI child process, persona files under `config.personaDir`.

## Data flow

See [copilot-mcp-dataflow.mmd](copilot-mcp-dataflow.mmd). Output payload summary:
An MCP `tools/call` becomes a resolved Copilot session id and a prompt to the wrapped CLI child; the child's event stream is collected into an `AskResult` and returned as a JSON-RPC success (or a `makeError` response) framed back as NDJSON over stdio/HTTP/WS.
