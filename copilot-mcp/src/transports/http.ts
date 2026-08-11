#!/usr/bin/env node
/**
 * Streamable HTTP + WebSocket entry, one loopback port (SEP-1287: WS upgrade
 * on the same /mcp endpoint the Streamable HTTP handler serves).
 * `createMcpHandler` speaks 2026-07-28 and legacy 2025-11-25 from the one
 * endpoint; a fresh McpServer is built per request (stateless), with all real
 * state in the shared bridge + watchdog.
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { BlastTimer } from '@agent-fannypack/mcp';
import { loadConfig } from '../config.js';
import { CopilotBridge } from '../bridge/copilot-bridge.js';
import { buildServer, SERVER_NAME, SERVER_VERSION } from '../server.js';
import { attachWebSocket } from './ws.js';
import { activePeerRequestContext, extractCarrier, runWithPeerRequestContext, sanitizePeerRequestId } from '../telemetry-context.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstJsonRpcMessage(payload: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(payload)) {
    for (const candidate of payload) {
      if (isRecord(candidate) && candidate['jsonrpc'] === '2.0') return candidate;
    }
    return undefined;
  }
  return isRecord(payload) && payload['jsonrpc'] === '2.0' ? payload : undefined;
}

export function extractHttpRequestContext(payload: unknown): {
  requestCarrier: { traceparent?: string; tracestate?: string; baggage?: string };
  peerRequestId?: string;
} {
  const message = firstJsonRpcMessage(payload);
  if (!message) return { requestCarrier: {} };
  const requestCarrier = extractCarrier(message['params']);
  const peerRequestId = sanitizePeerRequestId(message['id']);
  return {
    requestCarrier,
    ...(peerRequestId !== undefined ? { peerRequestId } : {}),
  };
}

async function readParsedBody(req: http.IncomingMessage): Promise<unknown> {
  if (req.method !== 'POST') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim().length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function startHttpServer(): void {
  const config = loadConfig();
  const bridge = new CopilotBridge(config);
  const timer = new BlastTimer();
  let wss: ReturnType<typeof attachWebSocket>;
  let httpServer: http.Server;

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
  const factory = () => {
    const context = activePeerRequestContext();
    return buildServer({
      bridge,
      timer,
      requestCarrier: context?.requestCarrier,
      peerRequestId: context?.peerRequestId,
      transport: context?.transport ?? 'http',
    });
  };
  const mcpHandler = createMcpHandler(factory);
  const nodeHandler = toNodeHandler(mcpHandler);

  httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, server: SERVER_NAME, version: SERVER_VERSION }));
      return;
    }
    void (async () => {
      const parsedBody = await readParsedBody(req);
      const requestContext = extractHttpRequestContext(parsedBody);
      await runWithPeerRequestContext(
        {
          ...requestContext,
          transport: 'http',
        },
        async () => nodeHandler(req, res, parsedBody),
      );
    })().catch((error: unknown) => {
      console.error('[copilot-mcp] HTTP handler failed:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error' }));
      } else {
        res.end();
      }
    });
  });

  wss = attachWebSocket(httpServer, { path: '/mcp', buildServer: factory });

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
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) startHttpServer();
