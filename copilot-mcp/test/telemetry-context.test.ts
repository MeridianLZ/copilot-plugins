import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCarrier, injectCarrier, validateCarrier } from '../src/telemetry-context.js';

const VALID_TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

test('validateCarrier accepts valid W3C carrier headers', () => {
  const carrier = validateCarrier({
    traceparent: VALID_TRACEPARENT,
    tracestate: 'acme=foo,congo=t61rcWkgMzE',
    baggage: 'tenant=payments,region=us-west-2',
  });

  assert.deepEqual(carrier, {
    traceparent: VALID_TRACEPARENT,
    tracestate: 'acme=foo,congo=t61rcWkgMzE',
    baggage: 'tenant=payments,region=us-west-2',
  });
});

test('validateCarrier rejects malformed and all-zero traceparent values', () => {
  assert.deepEqual(validateCarrier({ traceparent: '00-00000000000000000000000000000000-00f067aa0ba902b7-01' }), {});
  assert.deepEqual(validateCarrier({ traceparent: 'TOP-SECRET-CANARY' }), {});
  assert.deepEqual(validateCarrier({ traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01' }), {});
});

test('injectCarrier preserves unrelated _meta keys and adds telemetry keys', () => {
  const params = {
    name: 'ask',
    _meta: {
      custom: 'keep-me',
      nested: { ok: true },
    },
  };
  const output = injectCarrier(params, validateCarrier({ traceparent: VALID_TRACEPARENT, baggage: 'scope=tests' }));
  const meta = output['_meta'] as Record<string, unknown>;

  assert.equal(meta['custom'], 'keep-me');
  assert.deepEqual(meta['nested'], { ok: true });
  assert.equal(meta['traceparent'], VALID_TRACEPARENT);
  assert.equal(meta['baggage'], 'scope=tests');
});

test('extractCarrier reads from params._meta and ignores absent/invalid metadata', () => {
  assert.deepEqual(
    extractCarrier({
      _meta: {
        traceparent: VALID_TRACEPARENT,
        tracestate: 'acme=foo',
      },
      untouched: true,
    }),
    {
      traceparent: VALID_TRACEPARENT,
      tracestate: 'acme=foo',
    },
  );

  assert.deepEqual(extractCarrier({}), {});
  assert.deepEqual(extractCarrier({ _meta: { traceparent: 'TOP-SECRET-CANARY' } }), {});
});

test('carrier validation never throws value-bearing errors', () => {
  assert.doesNotThrow(() => {
    validateCarrier({
      traceparent: 'TOP-SECRET-CANARY',
      tracestate: 'token=TOP-SECRET-CANARY',
      baggage: 'authorization=Bearer TOP-SECRET-CANARY',
    });
  });
});
