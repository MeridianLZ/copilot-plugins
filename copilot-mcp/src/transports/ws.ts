/**
 * WebSocket transport per SEP-1287 semantics: WS upgrade on the SAME endpoint
 * as Streamable HTTP; one JSON-RPC message per text frame. Not in the SDK —
 * implemented as a custom MCP `Transport` on top of `ws` and this package's
 * JSON-RPC helpers. WS shares a single channel (like stdio), so
 * `hasPerRequestStream` stays undefined.
 */

import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { McpServer, Transport, JSONRPCMessage } from '@modelcontextprotocol/server';
import { isJsonRpcMessage } from '../jsonrpc/types.js';

export class WsServerTransport implements Transport {
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;

  constructor(private readonly ws: WebSocket) {}

  async start(): Promise<void> {
    this.ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      if (!isJsonRpcMessage(parsed)) {
        this.onerror?.(new Error('WS frame is not a JSON-RPC 2.0 message'));
        return;
      }
      this.onmessage?.(parsed as JSONRPCMessage);
    });
    this.ws.on('close', () => this.onclose?.());
    this.ws.on('error', (error) => this.onerror?.(error));
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws.send(JSON.stringify(message), (error) => (error ? reject(error) : resolve()));
    });
  }

  async close(): Promise<void> {
    this.ws.close();
  }
}

export interface AttachWebSocketOptions {
  path?: string;
  buildServer: () => McpServer;
  onConnection?: (transport: WsServerTransport) => void;
}

/** Attach MCP-over-WebSocket to an HTTP server (upgrade on `path`, default /mcp). */
export function attachWebSocket(httpServer: HttpServer, opts: AttachWebSocketOptions): WebSocketServer {
  const path = opts.path ?? '/mcp';
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== path) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const server = opts.buildServer();
      const transport = new WsServerTransport(ws);
      opts.onConnection?.(transport);
      void server.connect(transport).catch((error: unknown) => {
        console.error('[copilot-mcp] WS connect failed:', error);
        ws.close();
      });
    });
  });
  return wss;
}
