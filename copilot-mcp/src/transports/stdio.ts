#!/usr/bin/env node
/**
 * stdio entry: newline-delimited JSON-RPC over stdin/stdout (the transport
 * Claude Code, Codex, and Cursor spawn). All diagnostics go to stderr —
 * stdout is the protocol channel.
 */

import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { BlastTimer } from '@agent-fannypack/mcp';
import { loadConfig } from '../config.js';
import { CopilotBridge } from '../bridge/copilot-bridge.js';
import { buildServer } from '../server.js';
import { ContextPropagatingStdioTransport } from './stdio-context.js';

const config = loadConfig();
const bridge = new CopilotBridge(config);
const timer = new BlastTimer();

// Registered once on the shared timer (the serve factory may run per
// connection; per-call registration would stack duplicate callbacks).
timer.onExpire(async () => {
  // Blown up to nothing: destroy every copilot session, stop the CLI
  // child, and take the connection down with a non-zero exit.
  console.error('[copilot-mcp] blast timer detonated — tearing connection down');
  await bridge.destroyAll();
  process.exit(1);
});

// serveStdio() pins ONE server instance for the whole stdio connection, so
// per-request trace context can't be injected at buildServer() construction
// time the way the HTTP/WS factories do it (they build a fresh server
// per-request/connection already inside the ALS scope). Instead,
// ContextPropagatingStdioTransport extracts W3C context from each inbound
// message's params._meta and scopes it with AsyncLocalStorage before the
// message reaches the pinned server, so resolvePeerContext()'s
// activePeerRequestContext() lookup inside each tool handler still sees the
// correct per-call context even though buildServer() itself only runs once.
serveStdio(() => buildServer({ bridge, timer, transport: 'stdio' }), {
  transport: new ContextPropagatingStdioTransport(new StdioServerTransport(), { transport: 'stdio' }),
  onerror: (error) => console.error('[copilot-mcp] stdio error:', error),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void bridge.destroyAll().finally(() => process.exit(0));
  });
}

