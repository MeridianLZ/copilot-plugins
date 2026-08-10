import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLocalTelemetryEndpoint } from '../src/local-runtime.js';

test('validateLocalTelemetryEndpoint accepts explicit local runtime endpoints', () => {
  assert.equal(validateLocalTelemetryEndpoint('http://127.0.0.1:27432'), true);
  assert.equal(validateLocalTelemetryEndpoint('http://172.28.233.212:27432'), true);
});

test('validateLocalTelemetryEndpoint rejects non-local hosts', () => {
  assert.equal(validateLocalTelemetryEndpoint('http://example.com:27432'), false);
});

test('validateLocalTelemetryEndpoint rejects endpoints with url userinfo', () => {
  assert.equal(validateLocalTelemetryEndpoint('http://canary-user:canary-pass@127.0.0.1:27432'), false);
});
