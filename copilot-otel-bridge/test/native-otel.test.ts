import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { NativeOtelCache, parseNativeOtelLines } from '../src/native-otel.js';

const FIXTURES_DIR = path.join(process.cwd(), 'test', 'fixtures');
const RUNTIME_ROOT = path.join(FIXTURES_DIR, '.native-otel-runtime');

async function readFixtureLines(fileName: string): Promise<string[]> {
  const absolute = path.join(FIXTURES_DIR, fileName);
  const raw = await readFile(absolute, 'utf8');
  return raw.split('\n').filter((line) => line.length > 0);
}

async function withRuntimeDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = path.join(RUNTIME_ROOT, randomUUID());
  await mkdir(directory, { recursive: true });
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function makeCacheLine(sessionId: string, observedAtMs: number, suffix: string): string {
  return JSON.stringify({
    signal: 'log',
    observed_at_unix_ms: observedAtMs,
    session_id: sessionId,
    turn_id: `turn-${suffix}`,
    tool_call_id: `tool-${suffix}`,
    model: 'gpt-5.6-terra',
    attributes: {
      message: `cache-message-${suffix}`
    },
    resource: {
      'service.name': 'copilot-cli'
    },
    instrumentation_scope: {
      name: 'cache-test'
    }
  });
}

test('parseNativeOtelLines normalizes trace fixture and redacts canary content', async () => {
  const records = parseNativeOtelLines(
    await readFixtureLines('native-otel-traces.jsonl'),
    'fixtures/native-otel-traces.jsonl'
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.signal, 'trace');
  assert.equal(records[0]?.trace_id, '4bf92f3577b34da6a3ce929d0e0e4736');
  assert.equal(records[0]?.content_disposition.redacted, true);
  assert.equal(JSON.stringify(records).includes('canary-pass'), false);

  assert.equal(records[0]?.span_id, '00f067aa0ba902b7');
  assert.equal(records[0]?.parent_span_id, 'b9c7c989f97918e1');
  assert.equal(records[0]?.session_id, 'session-trace-1');
  assert.equal(records[0]?.turn_id, 'turn-trace-1');
  assert.equal(records[0]?.tool_call_id, 'tool-trace-1');
  assert.equal(records[0]?.model, 'gpt-5.6-terra');
  assert.equal(records[0]?.usage?.['input_tokens'], 42);
  assert.equal(records[0]?.usage?.['output_tokens'], 7);
  assert.equal(JSON.stringify(records).includes('AAAA=='), false);
});

test('parseNativeOtelLines normalizes metric and log fixtures', async () => {
  const metricRecords = parseNativeOtelLines(
    await readFixtureLines('native-otel-metrics.jsonl'),
    'fixtures/native-otel-metrics.jsonl'
  );
  const logRecords = parseNativeOtelLines(
    await readFixtureLines('native-otel-logs.jsonl'),
    'fixtures/native-otel-logs.jsonl'
  );

  assert.equal(metricRecords.length, 1);
  assert.equal(metricRecords[0]?.signal, 'metric');
  assert.equal(metricRecords[0]?.session_id, 'session-metric-1');
  assert.equal(metricRecords[0]?.model, 'gpt-5.6-terra');
  assert.equal(metricRecords[0]?.usage?.['prompt_tokens'], 11);
  assert.equal(metricRecords[0]?.usage?.['completion_tokens'], 38);
  assert.equal(metricRecords[0]?.content_disposition.redacted, true);

  assert.equal(logRecords.length, 1);
  assert.equal(logRecords[0]?.signal, 'log');
  assert.equal(logRecords[0]?.trace_id, '4bf92f3577b34da6a3ce929d0e0e4736');
  assert.equal(logRecords[0]?.span_id, '00f067aa0ba902b7');
  assert.equal(logRecords[0]?.session_id, 'session-log-1');
  assert.equal(logRecords[0]?.tool_call_id, 'tool-log-1');
  assert.equal(logRecords[0]?.usage?.['total_tokens'], 51);
  assert.equal(JSON.stringify(logRecords).includes('BBBBBBBB=='), false);
  assert.equal(JSON.stringify(logRecords).includes('canary-pass'), false);
});

test('parseNativeOtelLines emits invalid records for malformed json lines', () => {
  const records = parseNativeOtelLines(
    [
      '{"signal":"trace"',
      '{"signal":"log","observed_at_unix_ms":1723298411000,"session_id":"session-good","attributes":{"message":"ok"}}'
    ],
    'fixtures/native-otel-malformed.jsonl'
  );

  assert.equal(records.length, 2);
  assert.equal(records[0]?.validity, 'invalid');
  assert.equal(records[0]?.line_number, 1);
  assert.equal(records[0]?.source_file, 'fixtures/native-otel-malformed.jsonl');
  assert.equal(typeof records[0]?.source_hash, 'string');
  assert.equal(records[1]?.validity, 'valid');
  assert.equal(records[1]?.session_id, 'session-good');
});

test('NativeOtelCache incrementally appends new lines', async () => {
  await withRuntimeDirectory(async (directory) => {
    const filePath = path.join(directory, 'native-otel-logs.jsonl');
    const firstLine = makeCacheLine('session-cache-1', 1_723_298_410_000, 'one');
    const secondLine = makeCacheLine('session-cache-2', 1_723_298_411_000, 'two');
    await writeFile(filePath, `${firstLine}\n`, 'utf8');

    const cache = new NativeOtelCache(directory, 100);
    const firstRead = await cache.getRecords();
    assert.equal(firstRead.length, 1);
    assert.equal(firstRead[0]?.session_id, 'session-cache-1');

    await appendFile(filePath, `${secondLine}\n`, 'utf8');
    const secondRead = await cache.getRecords();
    assert.equal(secondRead.length, 2);
    assert.equal(secondRead[0]?.session_id, 'session-cache-1');
    assert.equal(secondRead[1]?.session_id, 'session-cache-2');
  });
});

test('NativeOtelCache buffers partial final lines until newline arrives', async () => {
  await withRuntimeDirectory(async (directory) => {
    const filePath = path.join(directory, 'native-otel-logs.jsonl');
    const firstLine = makeCacheLine('session-partial-1', 1_723_298_420_000, 'p1');
    const secondLine = makeCacheLine('session-partial-2', 1_723_298_421_000, 'p2');
    await writeFile(filePath, `${firstLine}\n${secondLine}`, 'utf8');

    const cache = new NativeOtelCache(directory, 100);
    const firstRead = await cache.getRecords();
    assert.equal(firstRead.length, 1);
    assert.equal(firstRead[0]?.session_id, 'session-partial-1');

    await appendFile(filePath, '\n', 'utf8');
    const secondRead = await cache.getRecords();
    assert.equal(secondRead.length, 2);
    assert.equal(secondRead[1]?.session_id, 'session-partial-2');
  });
});

test('NativeOtelCache restarts a file when truncation occurs', async () => {
  await withRuntimeDirectory(async (directory) => {
    const filePath = path.join(directory, 'native-otel-logs.jsonl');
    const beforeA = makeCacheLine('session-reset-old-a', 1_723_298_430_000, 'r1');
    const beforeB = makeCacheLine('session-reset-old-b', 1_723_298_431_000, 'r2');
    await writeFile(filePath, `${beforeA}\n${beforeB}\n`, 'utf8');

    const cache = new NativeOtelCache(directory, 100);
    const before = await cache.getRecords();
    assert.equal(before.length, 2);

    const afterLine = makeCacheLine('session-reset-new', 1_723_298_440_000, 'r3');
    await writeFile(filePath, `${afterLine}\n`, 'utf8');

    const after = await cache.getRecords();
    assert.equal(after.length, 1);
    assert.equal(after[0]?.session_id, 'session-reset-new');
    assert.equal(after[0]?.line_number, 1);
  });
});

test('NativeOtelCache enforces maxRecords bound', async () => {
  await withRuntimeDirectory(async (directory) => {
    const filePath = path.join(directory, 'native-otel-logs.jsonl');
    const lines = [
      makeCacheLine('session-max-1', 1_723_298_450_000, 'm1'),
      makeCacheLine('session-max-2', 1_723_298_451_000, 'm2'),
      makeCacheLine('session-max-3', 1_723_298_452_000, 'm3')
    ];
    await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');

    const cache = new NativeOtelCache(directory, 2);
    const records = await cache.getRecords();
    assert.equal(records.length, 2);
    assert.deepEqual(
      records.map((record) => record.session_id),
      ['session-max-2', 'session-max-3']
    );
  });
});
