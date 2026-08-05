#!/usr/bin/env node
/**
 * Streamable HTTP + WebSocket entry, one loopback port (SEP-1287: WS upgrade
 * on the same /mcp endpoint the Streamable HTTP handler serves).
 * `createMcpHandler` speaks 2026-07-28 and legacy 2025-11-25 from the one
 * endpoint; a fresh McpServer is built per request (stateless), with all real
 * state in the shared bridge + watchdog.
 */

import http from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { BlastTimer } from '@agent-fannypack/mcp';
import { loadConfig } from '../config.js';
import { CopilotBridge } from '../bridge/copilot-bridge.js';
import { buildServer, SERVER_NAME, SERVER_VERSION } from '../server.js';
import { attachWebSocket } from './ws.js';

const config = loadConfig();
const bridge = new CopilotBridge(config);
const timer = new BlastTimer();

async function detonate(): Promise<void> {
  console.error('[copilot-mcp] blast timer detonated — tearing all connections down');
  for (const ws of wss.clients) ws.terminate();
  await bridge.destroyAll();
  httpServer.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 2_000).unref();
}

// Register the expiry hook ONCE on the shared timer: the stateless handler
// builds a fresh McpServer per request, and per-request registration would
// stack duplicate detonate callbacks.
timer.onExpire(detonate);
const factory = () => buildServer({ bridge, timer });
const mcpHandler = createMcpHandler(factory);
const nodeHandler = toNodeHandler(mcpHandler);

const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, server: SERVER_NAME, version: SERVER_VERSION }));
    return;
  }
  void nodeHandler(req, res);
});

const wss = attachWebSocket(httpServer, { path: '/mcp', buildServer: factory });

httpServer.listen(config.httpPort, config.host, () => {
  console.error(
    `[copilot-mcp] Streamable HTTP + WS on http://${config.host}:${config.httpPort}/mcp (healthz on /healthz)`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    for (const ws of wss.clients) ws.terminate();
    void bridge.destroyAll().finally(() => {
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2_000).unref();
    });
  });
}
