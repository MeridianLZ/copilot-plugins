import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/client';
import WebSocket from 'ws';
import type { JSONRPCMessage, Transport } from '@modelcontextprotocol/client';
import { buildServer } from '../src/server.js';
import { attachWebSocket } from '../src/transports/ws.js';
import { isJsonRpcMessage } from '../src/jsonrpc/types.js';
import type { CopilotBridge } from '../src/bridge/copilot-bridge.js';

class WsClientTransport implements Transport {
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;
  #ws: WebSocket | undefined;
  constructor(private readonly url: string) {}
  async start(): Promise<void> {
    const ws = new WebSocket(this.url);
    this.#ws = ws;
    ws.on('message', (data) => {
      const parsed: unknown = JSON.parse(String(data));
      if (isJsonRpcMessage(parsed)) this.onmessage?.(parsed as JSONRPCMessage);
    });
    ws.on('close', () => this.onclose?.());
    ws.on('error', (error) => this.onerror?.(error));
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
  }
  async send(message: JSONRPCMessage): Promise<void> {
    const ws = this.#ws;
    if (!ws) throw new Error('not started');
    await new Promise<void>((resolve, reject) =>
      ws.send(JSON.stringify(message), (e) => (e ? reject(e) : resolve())),
    );
  }
  async close(): Promise<void> {
    this.#ws?.close();
  }
}

test('MCP over WebSocket: initialize, tools/list, ping — no copilot process involved', async () => {
  // ping/marco/blast tools never touch the bridge, so a stub suffices here.
  const bridge = {
    respondToMarco: async () => 'polo',
  } as unknown as CopilotBridge;

  const httpServer = http.createServer();
  attachWebSocket(httpServer, { path: '/mcp', buildServer: () => buildServer({ bridge }) });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const address = httpServer.address();
  assert.ok(address !== null && typeof address === 'object');
  const url = `ws://127.0.0.1:${address.port}/mcp`;

  try {
    const client = new Client({ name: 'ws-test', version: '0.0.0' });
    await client.connect(new WsClientTransport(url));

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    for (const expected of ['ping', 'marco', 'ask', 'blast_timer_start', 'check_in']) {
      assert.ok(names.includes(expected), `missing tool ${expected}`);
    }

    const result = await client.callTool({ name: 'ping', arguments: { echo: 'ws' } });
    const out = result.structuredContent as { pong: boolean; echo?: string };
    assert.equal(out.pong, true);
    assert.equal(out.echo, 'ws');

    const marco = await client.callTool({ name: 'marco', arguments: {} });
    const marcoOut = marco.structuredContent as { reply: string; ok: boolean };
    assert.equal(marcoOut.ok, true);
    assert.equal(marcoOut.reply, 'polo');

    await client.close();
  } finally {
    httpServer.close();
  }
});
