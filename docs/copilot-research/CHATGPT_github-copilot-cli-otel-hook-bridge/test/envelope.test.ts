import assert from 'node:assert/strict';
import test from 'node:test';
import type { BridgeConfig } from '../src/config.js';
import { createEnvelope } from '../src/envelope.js';
import { normalizeHookPayload } from '../src/normalize.js';
import {
  COPILOT_HOOK_EVENTS,
  isHookEnvelope,
  isJsonObject
} from '../src/types.js';

const config: BridgeConfig = {
  host: '127.0.0.1',
  port: 14329,
  bridgeUrl: 'http://127.0.0.1:14329/hooks',
  dataDir: '/tmp/copilot-hooks-test',
  eventsFile: '/tmp/copilot-hooks-test/hook-events.jsonl',
  spoolDir: '/tmp/copilot-hooks-test/spool',
  contentMode: 'hash',
  contentMaxBytes: 32_768,
  postTimeoutMs: 250,
  openSpanTimeoutMs: 1_800_000,
  spoolDrainIntervalMs: 2_000,
  consoleMode: 'silent',
  otlpTracesEndpoint: 'http://127.0.0.1:14318/v1/traces',
  serviceName: 'test'
};

test('all 14 documented event names normalize from command-hook environment', () => {
  for (const event of COPILOT_HOOK_EVENTS) {
    const normalized = normalizeHookPayload({ sessionId: 'session', timestamp: 1_800_000_000_000 }, event);
    assert.equal(normalized.hook_event_name, event);
    assert.equal(normalized.payload_format, 'camelCase');
  }
});

test('camelCase payload normalizes core and tool fields', () => {
  const normalized = normalizeHookPayload(
    {
      sessionId: 'session-1',
      timestamp: 1_800_000_000_000,
      cwd: '/repo',
      toolName: 'bash',
      toolArgs: '{"command":"pnpm test"}'
    },
    'preToolUse'
  );
  assert.equal(normalized.hook_event_name, 'preToolUse');
  assert.equal(normalized.session_id, 'session-1');
  assert.equal(normalized['tool_name'], 'bash');
  const toolInput = normalized['tool_input'];
  assert.ok(isJsonObject(toolInput));
  assert.equal(toolInput['command'], 'pnpm test');
});

test('PascalCase configuration normalizes VS Code-compatible payloads', () => {
  const normalized = normalizeHookPayload({
    hook_event_name: 'PreToolUse',
    session_id: 'session-2',
    timestamp: '2026-08-01T00:00:00.000Z',
    tool_name: 'Bash',
    tool_input: { command: 'pnpm check' }
  });
  assert.equal(normalized.hook_event_name, 'preToolUse');
  assert.equal(normalized.payload_format, 'vscode-compatible');
  assert.equal(normalized['tool_name'], 'Bash');
});

test('createEnvelope preserves W3C fields and hashes prompt content', () => {
  const envelope = createEnvelope(
    {
      sessionId: 'session-1',
      timestamp: 1_800_000_000_000,
      prompt: 'sensitive prompt'
    },
    config,
    'command-hook',
    'userPromptSubmitted',
    {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendor=value'
    }
  );

  assert.equal(isHookEnvelope(envelope), true);
  assert.equal(envelope.traceparent, '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  assert.equal(envelope.tracestate, 'vendor=value');
  assert.ok(isJsonObject(envelope.payload['prompt']));
  assert.equal(JSON.stringify(envelope).includes('sensitive prompt'), false);
});

test('errorOccurred promotes error type before error content is hashed', () => {
  const envelope = createEnvelope(
    {
      sessionId: 'session-1',
      timestamp: 1_800_000_000_000,
      error: { name: 'RateLimitError', message: 'contains sensitive details' },
      recoverable: true
    },
    config,
    'command-hook',
    'errorOccurred'
  );

  assert.equal(envelope.payload['error_type'], 'RateLimitError');
  assert.ok(isJsonObject(envelope.payload['error']));
  assert.equal(JSON.stringify(envelope).includes('contains sensitive details'), false);
});
