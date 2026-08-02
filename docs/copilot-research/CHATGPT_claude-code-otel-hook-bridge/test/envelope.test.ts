import assert from 'node:assert/strict';
import test from 'node:test';
import type { BridgeConfig } from '../src/config.js';
import { createEnvelope } from '../src/envelope.js';
import { HOOK_EVENTS, isHookEnvelope, isHookPayload, isJsonObject } from '../src/types.js';

const config: BridgeConfig = {
  host: '127.0.0.1',
  port: 4319,
  bridgeUrl: 'http://127.0.0.1:4319/hooks',
  dataDir: '/tmp/claude-hooks-test',
  eventsFile: '/tmp/claude-hooks-test/events.jsonl',
  spoolDir: '/tmp/claude-hooks-test/spool',
  contentMode: 'hash',
  contentMaxBytes: 32_768,
  postTimeoutMs: 250,
  openSpanTimeoutMs: 1_800_000,
  spoolDrainIntervalMs: 2_000,
  consoleMode: 'silent',
  otlpTracesEndpoint: 'http://127.0.0.1:4318/v1/traces',
  serviceName: 'test'
};

test('all documented hook names pass the payload guard', () => {
  for (const hook_event_name of HOOK_EVENTS) {
    assert.equal(isHookPayload({ session_id: 'session', hook_event_name }), true, hook_event_name);
  }
});

test('invalid hook names fail the payload guard', () => {
  assert.equal(isHookPayload({ session_id: 'session', hook_event_name: 'MadeUpHook' }), false);
  assert.equal(isHookPayload({ hook_event_name: 'Stop' }), false);
});

test('createEnvelope preserves correlation and W3C fields', () => {
  const envelope = createEnvelope(
    {
      session_id: 'session-1',
      prompt_id: 'prompt-1',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'sensitive prompt'
    },
    config,
    'command-hook',
    {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendor=value'
    }
  );

  assert.equal(isHookEnvelope(envelope), true);
  assert.equal(envelope.payload['prompt_id'], 'prompt-1');
  assert.equal(envelope.traceparent, '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  assert.equal(envelope.tracestate, 'vendor=value');
  assert.ok(isJsonObject(envelope.payload['prompt']));
});

test('StopFailure promotes fixed error type before hashing error content', () => {
  const envelope = createEnvelope(
    {
      session_id: 'session-1',
      prompt_id: 'prompt-1',
      hook_event_name: 'StopFailure',
      error: 'rate_limit',
      error_details: '429 contains sensitive details'
    },
    config,
    'command-hook'
  );

  assert.equal(envelope.payload['error_type'], 'rate_limit');
  assert.ok(isJsonObject(envelope.payload['error']));
  assert.ok(isJsonObject(envelope.payload['error_details']));
});
