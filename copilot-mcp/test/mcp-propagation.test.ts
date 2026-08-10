import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { buildServer } from '../src/server.js';
import { CopilotBridge } from '../src/bridge/copilot-bridge.js';
import { validateCarrier, type TelemetryCarrier } from '../src/telemetry-context.js';
import { extractWsRequestContext } from '../src/transports/ws.js';
import { extractHttpRequestContext } from '../src/transports/http.js';

const VALID_TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

test('buildServer forwards request carrier + request ID into ask/session_create handlers', async () => {
  const createContexts: Array<Record<string, unknown>> = [];
  const askContexts: Array<Record<string, unknown>> = [];
  const linkRecords: Array<Record<string, unknown>> = [];

  const bridge = {
    respondToMarco: async () => 'polo',
    ask: async (
      args: { prompt: string; session_id?: string; model?: string; timeout_ms?: number },
      peer?: Record<string, unknown>,
    ) => {
      askContexts.push({ ...(peer ?? {}) });
      return {
        answer: `echo:${args.prompt}`,
        session_id: args.session_id ?? 'inner-session-1',
        turn_ms: 5,
        model: args.model,
        tool_calls: [],
      };
    },
    createSession: async (model?: string, peer?: Record<string, unknown>) => {
      createContexts.push({ ...(peer ?? {}) });
      return {
        session_id: 'inner-session-1',
        created_at: '2026-08-10T00:00:00.000Z',
        last_used_at: '2026-08-10T00:00:00.000Z',
        model,
        event_count: 0,
      };
    },
    listSessions: () => [],
    sessionEvents: () => [],
    destroySession: async () => {},
    listModels: async () => [],
    status: async () => ({ ok: true }),
    recordPeerLink: (record: Record<string, unknown>) => {
      linkRecords.push(record);
    },
  } as unknown as CopilotBridge;

  const requestCarrier = validateCarrier({ traceparent: VALID_TRACEPARENT, tracestate: 'acme=foo' });
  const server = buildServer({
    bridge,
    requestCarrier,
    peerRequestId: 'rpc-7',
    transport: 'in-memory',
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'mcp-prop-test', version: '0.0.0' });
  await client.connect(clientTransport);

  try {
    await client.callTool({ name: 'session_create', arguments: {} });
    await client.callTool({ name: 'ask', arguments: { prompt: 'hello', session_id: 'inner-session-1' } });
  } finally {
    await client.close();
  }

  assert.equal(createContexts.length, 1);
  assert.equal(askContexts.length, 1);
  assert.equal(createContexts[0]?.['peerRequestId'], 'rpc-7');
  assert.equal(askContexts[0]?.['peerRequestId'], 'rpc-7');
  assert.equal((createContexts[0]?.['requestCarrier'] as TelemetryCarrier | undefined)?.traceparent, VALID_TRACEPARENT);
  assert.equal((askContexts[0]?.['requestCarrier'] as TelemetryCarrier | undefined)?.traceparent, VALID_TRACEPARENT);
  assert.equal(linkRecords.length, 2, 'session_create + ask should each emit one peer linkage record');
});

test('buildServer skips peer linkage records when no valid carrier is present', async () => {
  const linkRecords: Array<Record<string, unknown>> = [];
  const bridge = {
    respondToMarco: async () => 'polo',
    ask: async () => ({
      answer: 'ok',
      session_id: 'inner-session-2',
      turn_ms: 1,
      model: undefined,
      tool_calls: [],
    }),
    createSession: async () => ({
      session_id: 'inner-session-2',
      created_at: '2026-08-10T00:00:00.000Z',
      last_used_at: '2026-08-10T00:00:00.000Z',
      model: undefined,
      event_count: 0,
    }),
    listSessions: () => [],
    sessionEvents: () => [],
    destroySession: async () => {},
    listModels: async () => [],
    status: async () => ({ ok: true }),
    recordPeerLink: (record: Record<string, unknown>) => {
      linkRecords.push(record);
    },
  } as unknown as CopilotBridge;

  const server = buildServer({
    bridge,
    requestCarrier: validateCarrier({ traceparent: 'TOP-SECRET-CANARY' }),
    peerRequestId: 'rpc-invalid',
    transport: 'in-memory',
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'mcp-prop-test-no-carrier', version: '0.0.0' });
  await client.connect(clientTransport);
  try {
    await client.callTool({ name: 'session_create', arguments: {} });
    await client.callTool({ name: 'ask', arguments: { prompt: 'hello', session_id: 'inner-session-2' } });
  } finally {
    await client.close();
  }

  assert.equal(linkRecords.length, 0);
});

test('extractWsRequestContext pulls peer carrier from JSON-RPC params._meta', () => {
  const context = extractWsRequestContext({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: {
      _meta: {
        traceparent: VALID_TRACEPARENT,
        tracestate: 'acme=foo',
      },
    },
  });

  assert.deepEqual(context, {
    requestCarrier: {
      traceparent: VALID_TRACEPARENT,
      tracestate: 'acme=foo',
    },
    peerRequestId: '17',
  });

  assert.deepEqual(
    extractWsRequestContext({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { _meta: { traceparent: 'TOP-SECRET-CANARY' } },
    }),
    { requestCarrier: {}, peerRequestId: '9' },
  );
});

test('extractHttpRequestContext pulls carrier + request ID from JSON-RPC payload', () => {
  const context = extractHttpRequestContext({
    jsonrpc: '2.0',
    id: 'http-42',
    method: 'tools/call',
    params: {
      _meta: {
        traceparent: VALID_TRACEPARENT,
        baggage: 'tenant=payments',
      },
    },
  });
  assert.deepEqual(context, {
    requestCarrier: {
      traceparent: VALID_TRACEPARENT,
      baggage: 'tenant=payments',
    },
    peerRequestId: 'http-42',
  });

  assert.deepEqual(extractHttpRequestContext({ jsonrpc: '2.0', method: 'tools/list' }), { requestCarrier: {} });
});

type Listener = (event: { type: string; data?: unknown }) => void;

class FakeSession {
  readonly sessionId = 'inner-session-bridge';
  readonly #listeners: Listener[] = [];

  on(listener: Listener): () => void {
    this.#listeners.push(listener);
    return () => {
      const index = this.#listeners.indexOf(listener);
      if (index >= 0) this.#listeners.splice(index, 1);
    };
  }

  async sendAndWait(input: { prompt: string }): Promise<unknown> {
    return {
      type: 'assistant.message',
      data: { content: `ack:${input.prompt}` },
    };
  }

  async disconnect(): Promise<void> {}
}

class FakeClient {
  readonly session = new FakeSession();

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async createSession(): Promise<FakeSession> {
    return this.session;
  }
  async deleteSession(): Promise<void> {}
  async listModels(): Promise<Array<{ id: string; name?: string }>> {
    return [];
  }
  async ping(): Promise<string> {
    return 'pong';
  }
  async getStatus(): Promise<Record<string, unknown>> {
    return { auth: 'ok' };
  }
}

class BridgeWithFakeClient extends CopilotBridge {
  constructor(private readonly fakeClient: FakeClient) {
    super({
      host: '127.0.0.1',
      httpPort: 27443,
      permissions: 'readonly',
      model: undefined,
      cliUrl: undefined,
      askTimeoutMs: 30_000,
    });
  }

  override async client(): Promise<import('@github/copilot-sdk').CopilotClient> {
    return this.fakeClient as unknown as import('@github/copilot-sdk').CopilotClient;
  }
}

test('CopilotBridge stores stable peer linkage without duplicate records or secret values', async () => {
  const bridge = new BridgeWithFakeClient(new FakeClient());
  const carrier = validateCarrier({
    traceparent: VALID_TRACEPARENT,
    tracestate: 'acme=foo',
    baggage: 'token=TOP-SECRET-CANARY',
  });

  const session = await bridge.createSession(undefined, {
    requestCarrier: carrier,
    peerRequestId: 'peer-123',
    transport: 'ws',
  });
  await bridge.ask(
    {
      prompt: 'hello',
      session_id: session.session_id,
    },
    {
      requestCarrier: carrier,
      peerRequestId: 'peer-123',
      transport: 'ws',
    },
  );
  await bridge.ask(
    {
      prompt: 'hello again',
      session_id: session.session_id,
    },
    {
      requestCarrier: carrier,
      peerRequestId: 'peer-123',
      transport: 'ws',
    },
  );

  const events = bridge.sessionEvents(session.session_id);
  const links = events.filter((event) => event['type'] === 'mcp.peer_link');
  assert.equal(links.length, 2);
  assert.deepEqual(
    links.map((event) => event['tool_name']),
    ['session_create', 'ask'],
  );
  assert.equal(links[0]?.['trace_id'], '4bf92f3577b34da6a3ce929d0e0e4736');

  const sessions = bridge.listSessions();
  const linked = sessions.find((entry) => entry.session_id === session.session_id);
  assert.equal(linked?.peer_trace_id, '4bf92f3577b34da6a3ce929d0e0e4736');
  assert.equal(linked?.peer_transport, 'ws');
  assert.equal(linked?.peer_link_count, 2);
  assert.equal(JSON.stringify({ events, sessions }).includes('TOP-SECRET-CANARY'), false);
});

test('CopilotBridge does not hydrate session peer linkage from fabricated failed-session IDs', async () => {
  const bridge = new BridgeWithFakeClient(new FakeClient());
  const carrier = validateCarrier({ traceparent: VALID_TRACEPARENT, tracestate: 'acme=foo' });

  for (let index = 0; index < 20; index++) {
    bridge.recordPeerLink({
      server: 'copilot-mcp',
      toolName: 'ask',
      status: 'failed',
      requestCarrier: carrier,
      sessionId: `fabricated-${index}`,
      peerRequestId: `req-${index}`,
      transport: 'ws',
    });
  }
  bridge.recordPeerLink({
    server: 'copilot-mcp',
    toolName: 'ask',
    status: 'failed',
    requestCarrier: carrier,
    sessionId: 'inner-session-bridge',
    peerRequestId: 'req-shadow',
    transport: 'ws',
  });

  const created = await bridge.createSession();
  assert.equal(created.peer_trace_id, undefined);
  assert.equal(created.peer_transport, undefined);

  const status = await bridge.status();
  const peerLinks = (status['peer_links'] as unknown[]) ?? [];
  assert.equal(peerLinks.length, 0);
});

test('CopilotBridge evicts old peer-link dedupe keys when buffer exceeds 200 entries', async () => {
  const bridge = new BridgeWithFakeClient(new FakeClient());
  const carrier = validateCarrier({ traceparent: VALID_TRACEPARENT, tracestate: 'acme=foo' });
  const session = await bridge.createSession();

  for (let index = 0; index < 250; index++) {
    bridge.recordPeerLink({
      server: 'copilot-mcp',
      toolName: 'ask',
      status: 'complete',
      requestCarrier: carrier,
      sessionId: session.session_id,
      peerRequestId: `peer-${index}`,
      transport: 'ws',
    });
  }

  const firstBatch = bridge
    .sessionEvents(session.session_id)
    .filter((event) => event['type'] === 'mcp.peer_link');
  assert.equal(firstBatch.length, 200);
  assert.equal(firstBatch.some((event) => event['peer_request_id'] === 'peer-0'), false);
  assert.equal(firstBatch.some((event) => event['peer_request_id'] === 'peer-249'), true);

  bridge.recordPeerLink({
    server: 'copilot-mcp',
    toolName: 'ask',
    status: 'complete',
    requestCarrier: carrier,
    sessionId: session.session_id,
    peerRequestId: 'peer-0',
    transport: 'ws',
  });

  const secondBatch = bridge
    .sessionEvents(session.session_id)
    .filter((event) => event['type'] === 'mcp.peer_link');
  assert.equal(secondBatch.length, 200);
  assert.equal(secondBatch.some((event) => event['peer_request_id'] === 'peer-0'), true);
});
