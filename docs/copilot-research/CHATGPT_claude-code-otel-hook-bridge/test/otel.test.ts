import assert from 'node:assert/strict';
import test from 'node:test';
import { TraceFlags } from '@opentelemetry/api';
import { parseTraceparent } from '../src/otel.js';

test('parseTraceparent accepts a valid sampled W3C header', () => {
  const parsed = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  assert.deepEqual(parsed, {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    traceFlags: TraceFlags.SAMPLED,
    isRemote: true
  });
});

test('parseTraceparent rejects malformed and all-zero contexts', () => {
  assert.equal(parseTraceparent('not-a-traceparent'), undefined);
  assert.equal(
    parseTraceparent('00-00000000000000000000000000000000-0000000000000000-01'),
    undefined
  );
});
