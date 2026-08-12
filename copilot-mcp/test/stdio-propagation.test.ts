import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JSONRPCMessage, Transport } from '@modelcontextprotocol/server';
import { activePeerRequestContext } from '../src/telemetry-context.js';
import { ContextPropagatingStdioTransport, extractStdioRequestContext } from '../src/transports/stdio-context.js';

const VALID_TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

/** Minimal fake `Transport` standing in for `StdioServerTransport` in tests —
 * exposes the same onmessage/onclose/onerror + start/send/close surface
 * without touching real stdin/stdout streams. */
class FakeInnerTransport implements Transport {
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;
  started = false;
  closed = false;
  sent: JSONRPCMessage[] = [];

  async start(): Promise<void> {
    this.started = true;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sent.push(message);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** Test helper: simulate a message arriving on stdin. */
  emit(message: JSONRPCMessage): void {
    this.onmessage?.(message);
  }
}

test('extractStdioRequestContext pulls carrier + request ID from JSON-RPC params._meta', () => {
  const context = extractStdioRequestContext({
    jsonrpc: '2.0',
    id: 'stdio-42',
    method: 'tools/call',
    params: {
      name: 'session_create',
      arguments: {},
      _meta: { traceparent: VALID_TRACEPARENT, tracestate: 'acme=foo' },
    },
  } as JSONRPCMessage);

  assert.deepEqual(context, {
    requestCarrier: { traceparent: VALID_TRACEPARENT, tracestate: 'acme=foo' },
    peerRequestId: 'stdio-42',
  });
});

test('extractStdioRequestContext rejects a malformed traceparent canary', () => {
  const context = extractStdioRequestContext({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { _meta: { traceparent: 'TOP-SECRET-CANARY' } },
  } as JSONRPCMessage);
  assert.deepEqual(context, { requestCarrier: {}, peerRequestId: '9' });
});

test('ContextPropagatingStdioTransport scopes each inbound message with its own request context', async () => {
  const inner = new FakeInnerTransport();
  const wrapper = new ContextPropagatingStdioTransport(inner, { transport: 'stdio' });
  const observed: Array<ReturnType<typeof activePeerRequestContext>> = [];
  wrapper.onmessage = () => {
    observed.push(activePeerRequestContext());
  };

  await wrapper.start();
  assert.equal(inner.started, true);

  inner.emit({
    jsonrpc: '2.0',
    id: 'stdio-1',
    method: 'tools/call',
    params: {
      name: 'session_create',
      arguments: {},
      _meta: { traceparent: VALID_TRACEPARENT, tracestate: 'acme=foo' },
    },
  } as JSONRPCMessage);

  // A second message with a DIFFERENT id/carrier must not leak the first
  // message's context — proves scoping is per-message, not per-connection.
  inner.emit({
    jsonrpc: '2.0',
    id: 'stdio-2',
    method: 'tools/call',
    params: { name: 'status', arguments: {} },
  } as JSONRPCMessage);

  assert.equal(observed.length, 2);
  assert.deepEqual(observed[0], {
    requestCarrier: { traceparent: VALID_TRACEPARENT, tracestate: 'acme=foo' },
    peerRequestId: 'stdio-1',
    transport: 'stdio',
  });
  // No carrier on the second message: activePeerRequestContext() is either
  // undefined or carries no requestCarrier — never the first call's trace.
  assert.equal(observed[1]?.requestCarrier, undefined);

  // Outside any message dispatch, no context leaks into ambient scope.
  assert.equal(activePeerRequestContext(), undefined);
});

test('ContextPropagatingStdioTransport delegates send/close to the inner transport unmodified', async () => {
  const inner = new FakeInnerTransport();
  const wrapper = new ContextPropagatingStdioTransport(inner);
  await wrapper.start();

  const outbound: JSONRPCMessage = { jsonrpc: '2.0', id: '1', result: { ok: true } } as JSONRPCMessage;
  await wrapper.send(outbound);
  assert.deepEqual(inner.sent, [outbound]);

  await wrapper.close();
  assert.equal(inner.closed, true);
});

test('ContextPropagatingStdioTransport forwards onclose/onerror without altering them', async () => {
  const inner = new FakeInnerTransport();
  const wrapper = new ContextPropagatingStdioTransport(inner);
  let closed = false;
  let lastError: Error | undefined;
  wrapper.onclose = () => {
    closed = true;
  };
  wrapper.onerror = (error) => {
    lastError = error;
  };

  await wrapper.start();
  inner.onclose?.();
  const boom = new Error('boom');
  inner.onerror?.(boom);

  assert.equal(closed, true);
  assert.equal(lastError, boom);
});
