import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectUrlEncodedCandidateMetricsForTest,
  findSecretMatches,
  sanitizeJson,
  sanitizeSecrets,
  stableJson
} from '../src/security.js';
import { isJsonObject, type JsonObject } from '../src/types.js';

const canary = 'http://canary-user:canary-pass@proxy.invalid:8080';
const canaryBase64 = Buffer.from(canary, 'utf8').toString('base64');
const canaryUrlEncoded = encodeURIComponent(canary);

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
  if (!isJsonObject(first)) throw new Error('expected object');
  const prompt = first['prompt'];
  assert.ok(isJsonObject(prompt));
  assert.equal(prompt['redacted'], true);
  assert.equal(typeof prompt['sha256'], 'string');
  assert.equal(typeof prompt['bytes'], 'number');
  assert.equal(JSON.stringify(first).includes('secret prompt'), false);
});

test('tool identity remains structural while arguments and results are hashed', () => {
  const value: JsonObject = {
    hook_event_name: 'postToolUse',
    session_id: 'session-1',
    payload_format: 'camelCase',
    timestamp: '2026-08-01T00:00:00Z',
    tool_name: 'bash',
    tool_input: { command: 'printf secret' },
    tool_result: { textResultForLlm: 'secret output', resultType: 'success' }
  };
  const sanitized = sanitizeJson(value, 'hash', 32_768);
  assert.ok(isJsonObject(sanitized));
  if (!isJsonObject(sanitized)) throw new Error('expected object');
  assert.equal(sanitized['tool_name'], 'bash');
  assert.ok(isJsonObject(sanitized['tool_input']));
  assert.ok(isJsonObject(sanitized['tool_result']));
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

test('sanitizeSecrets removes raw, base64, and url-encoded credential forms', () => {
  const input = `raw=${canary}\nbase64=${canaryBase64}\nurl=${canaryUrlEncoded}`;
  const sanitized = sanitizeSecrets(input);

  assert.equal(sanitized.includes(canary), false);
  assert.equal(sanitized.includes(canaryBase64), false);
  assert.equal(sanitized.includes(canaryUrlEncoded), false);
});

test('findSecretMatches reports encoding classes without exposing secret values', () => {
  const input = `raw=${canary}\nbase64=${canaryBase64}\nurl=${canaryUrlEncoded}`;
  const matches = findSecretMatches(input);
  const serializedMatches = JSON.stringify(matches);

  assert.match(serializedMatches, /raw/i);
  assert.match(serializedMatches, /base64/i);
  assert.match(serializedMatches, /url/i);
  assert.equal(serializedMatches.includes(canary), false);
  assert.equal(serializedMatches.includes(canaryBase64), false);
  assert.equal(serializedMatches.includes(canaryUrlEncoded), false);
});

test('sanitizeSecrets keeps key prefix when redacting generic key-value secrets', () => {
  const sanitized = sanitizeSecrets('password: supersecret token=evenmoresecret');

  assert.equal(sanitized.includes('$1'), false);
  assert.equal(sanitized.includes('password: [REDACTED]'), true);
  assert.equal(sanitized.includes('token=[REDACTED]'), true);
});

test('sanitizeSecrets handles large ASCII input without percent triplets', { timeout: 1_500 }, () => {
  const input = `prefix ${'a'.repeat(150_000)} suffix`;
  const sanitized = sanitizeSecrets(input);

  assert.equal(sanitized.text, input);
  assert.deepEqual(sanitized.disposition, {
    redacted: false,
    policy_version: 'otel-redaction-policy-v1',
    kinds: [],
    bytes: Buffer.byteLength(input, 'utf8')
  });
});

test('sanitizeSecrets bounds dense url-encoded candidate scanning work', () => {
  const denseEncodedFiller = '%41'.repeat(120_000);
  const metrics = collectUrlEncodedCandidateMetricsForTest(denseEncodedFiller);

  assert.equal(metrics.rangeCount > 0, true);
  assert.equal(metrics.scanSteps <= denseEncodedFiller.length * 3, true);

  const sanitized = sanitizeSecrets(denseEncodedFiller);
  assert.equal(sanitized.text, denseEncodedFiller);
});
