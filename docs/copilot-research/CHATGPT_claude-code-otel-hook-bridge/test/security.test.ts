import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeJson, stableJson } from '../src/security.js';
import { isJsonObject, type JsonObject } from '../src/types.js';

test('stableJson sorts object keys recursively', () => {
  assert.equal(
    stableJson({ z: 1, a: { y: true, b: 'two' } }),
    '{"a":{"b":"two","y":true},"z":1}'
  );
});

test('hash mode replaces content with deterministic metadata', () => {
  const first = sanitizeJson({ prompt: 'secret prompt' }, 'hash', 32_768);
  const second = sanitizeJson({ prompt: 'secret prompt' }, 'hash', 32_768);
  assert.deepEqual(first, second);
  assert.ok(isJsonObject(first));
  const prompt = first['prompt'];
  assert.ok(isJsonObject(prompt));
  assert.equal(prompt['redacted'], true);
  assert.equal(typeof prompt['sha256'], 'string');
  assert.equal(typeof prompt['bytes'], 'number');
  assert.equal(JSON.stringify(first).includes('secret prompt'), false);
});

test('tool_calls retain structural IDs while member content is hashed', () => {
  const value: JsonObject = {
    hook_event_name: 'PostToolBatch',
    session_id: 'session-1',
    tool_calls: [
      {
        tool_name: 'Bash',
        tool_use_id: 'toolu_01',
        tool_input: { command: 'printf secret' },
        tool_response: 'secret output'
      }
    ]
  };
  const sanitized = sanitizeJson(value, 'hash', 32_768);
  assert.ok(isJsonObject(sanitized));
  const calls = sanitized['tool_calls'];
  assert.ok(Array.isArray(calls));
  const first = calls[0];
  assert.ok(isJsonObject(first));
  assert.equal(first['tool_name'], 'Bash');
  assert.equal(first['tool_use_id'], 'toolu_01');
  assert.ok(isJsonObject(first['tool_input']));
  assert.ok(isJsonObject(first['tool_response']));
  assert.equal(JSON.stringify(sanitized).includes('printf secret'), false);
  assert.equal(JSON.stringify(sanitized).includes('secret output'), false);
});

test('full mode redacts common bearer and API key formats', () => {
  const sanitized = sanitizeJson(
    { note: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz; key sk-ant-abcdefghijklmnopqrstuv' },
    'full',
    32_768
  );
  const text = JSON.stringify(sanitized);
  assert.equal(text.includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(text.includes('sk-ant-abcdefghijklmnopqrstuv'), false);
  assert.match(text, /REDACTED/);
});
