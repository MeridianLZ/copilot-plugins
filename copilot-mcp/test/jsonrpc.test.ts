import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JsonRpcErrorCodes,
  isErrorResponse,
  isJsonRpcMessage,
  isNotification,
  isRequest,
  isResponse,
  makeError,
  makeNotification,
  makeRequest,
  makeResult,
  type JsonRpcMessage,
} from '../src/jsonrpc/types.js';
import { JsonRpcCorrelator, JsonRpcEndpoint, JsonRpcRemoteError, NdjsonFramer } from '../src/jsonrpc/helpers.js';

test('type guards discriminate the message union', () => {
  const req = makeRequest(1, 'tools/call', { name: 'ping' });
  const note = makeNotification('notifications/progress', { p: 1 });
  const ok = makeResult(1, { done: true });
  const err = makeError(2, JsonRpcErrorCodes.MethodNotFound, 'nope');

  for (const m of [req, note, ok, err]) assert.equal(isJsonRpcMessage(m), true);
  assert.equal(isJsonRpcMessage({ jsonrpc: '1.0' }), false);
  assert.equal(isRequest(req), true);
  assert.equal(isRequest(note as JsonRpcMessage), false);
  assert.equal(isNotification(note), true);
  assert.equal(isResponse(ok), true);
  assert.equal(isResponse(err), true);
  assert.equal(isErrorResponse(err), true);
  assert.equal(isErrorResponse(ok), false);
});

test('NdjsonFramer reassembles split frames and rejects junk', () => {
  const framer = new NdjsonFramer();
  const frame = NdjsonFramer.frame(makeRequest(7, 'ping'));
  const [head, tail] = [frame.slice(0, 10), frame.slice(10)];

  assert.deepEqual(framer.push(head as string), []);
  const messages = framer.push((tail as string) + NdjsonFramer.frame(makeNotification('n')));
  assert.equal(messages.length, 2);
  assert.equal(isRequest(messages[0] as JsonRpcMessage), true);
  assert.equal(framer.pendingBytes, 0);
  assert.throws(() => framer.push('{"not":"jsonrpc"}\n'), /not a JSON-RPC/);
});

test('correlator settles, times out, and cancels in flight', async () => {
  const correlator = new JsonRpcCorrelator();
  const id = correlator.nextId();
  const waiter = correlator.wait(id);
  assert.equal(correlator.settle(makeResult(id, 'ok')), true);
  assert.equal(await waiter, 'ok');
  assert.equal(correlator.settle(makeResult(999, 'orphan')), false);

  const t = correlator.nextId();
  const timedOut = correlator.wait(t, 20);
  await assert.rejects(timedOut, /timed out/);

  const c = correlator.nextId();
  const cancelled = correlator.wait(c);
  correlator.cancelAll('connection closed');
  await assert.rejects(cancelled, JsonRpcRemoteError);
  assert.equal(correlator.inFlight, 0);
});

test('endpoint pair: request/response, method-not-found, notifications', async () => {
  // Wire two endpoints back-to-back.
  let a!: JsonRpcEndpoint;
  let b!: JsonRpcEndpoint;
  a = new JsonRpcEndpoint((m) => void b.receive(m));
  b = new JsonRpcEndpoint((m) => void a.receive(m));

  b.onRequest('sum', (params) => {
    const { x, y } = params as { x: number; y: number };
    return x + y;
  });
  const seen: unknown[] = [];
  b.onNotification('log', (params) => seen.push(params));

  assert.equal(await a.request('sum', { x: 2, y: 3 }), 5);
  await a.notify('log', { level: 'info' });
  assert.deepEqual(seen, [{ level: 'info' }]);
  await assert.rejects(a.request('missing'), (error: unknown) => {
    assert.ok(error instanceof JsonRpcRemoteError);
    assert.equal(error.rpcError.code, JsonRpcErrorCodes.MethodNotFound);
    return true;
  });
});
