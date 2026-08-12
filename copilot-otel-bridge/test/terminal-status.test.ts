import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileTerminalStatus } from '../src/terminal-status.js';

test('neither lane has explicit status -> open, no conflict', () => {
  const result = reconcileTerminalStatus({ source: 'native' }, { source: 'hook' });
  assert.equal(result.status, 'open');
  assert.equal(result.conflict, false);
  assert.deepEqual(result.evidence, []);
});

test('only native lane closes explicitly -> native status wins, no conflict', () => {
  const result = reconcileTerminalStatus({ source: 'native', status: 'ok' }, { source: 'hook', status: 'open' });
  assert.equal(result.status, 'ok');
  assert.equal(result.conflict, false);
  assert.deepEqual(result.evidence, [{ source: 'native', status: 'ok' }]);
});

test('only hook lane closes explicitly (native never got session.shutdown) -> hook status wins', () => {
  const result = reconcileTerminalStatus(
    { source: 'native', status: 'open' },
    { source: 'hook', status: 'error', reason: 'crashed' }
  );
  assert.equal(result.status, 'error');
  assert.equal(result.conflict, false);
  assert.deepEqual(result.evidence, [{ source: 'hook', status: 'error', reason: 'crashed' }]);
});

test('both lanes agree ok -> ok, no conflict', () => {
  const result = reconcileTerminalStatus({ source: 'native', status: 'ok' }, { source: 'hook', status: 'ok' });
  assert.equal(result.status, 'ok');
  assert.equal(result.conflict, false);
});

test('native says ok but hook says error -> error wins and conflict is explicit', () => {
  const result = reconcileTerminalStatus(
    { source: 'native', status: 'ok' },
    { source: 'hook', status: 'error', reason: 'postToolUseFailure' }
  );
  assert.equal(result.status, 'error');
  assert.equal(result.conflict, true);
  assert.equal(result.evidence.length, 2);
});

test('hook recovered (never explicitly closed) with no native signal -> recovered, no conflict', () => {
  const result = reconcileTerminalStatus({ source: 'native' }, { source: 'hook', status: 'recovered', reason: 'session_end' });
  assert.equal(result.status, 'recovered');
  assert.equal(result.conflict, false);
});

test('a later explicit error still wins over an earlier recovered evidence', () => {
  const result = reconcileTerminalStatus(
    { source: 'hook', status: 'recovered', reason: 'duplicate_start' },
    { source: 'native', status: 'error', reason: 'crash' }
  );
  assert.equal(result.status, 'error');
  assert.equal(result.conflict, true);
});
