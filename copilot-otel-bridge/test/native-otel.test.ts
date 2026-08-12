import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { NativeOtelCache, parseNativeOtelLines } from '../src/native-otel.js';
import { sanitizeNativeOtelValue } from '../src/security.js';
import type { RedactionDisposition } from '../src/types.js';

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

test('parseNativeOtelLines preserves complete sanitized OTLP entity and unknown fields', () => {
  const input = JSON.stringify({
    signal: 'trace',
    resourceSpans: [{
      resource: {
        attributes: [{ key: 'copilot.session.id', value: { stringValue: 'session-lossless' } }],
        droppedAttributesCount: 2,
        futureResourceField: { keep: 'yes' }
      },
      schemaUrl: 'https://opentelemetry.io/schemas/1.38.0',
      scopeSpans: [{
        scope: {
          name: 'copilot.native',
          version: '1.0.0',
          attributes: [{ key: 'scope.future', value: { stringValue: 'scope-value' } }],
          droppedAttributesCount: 1
        },
        schemaUrl: 'https://opentelemetry.io/schemas/genai/1.0.0',
        spans: [{
          traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
          spanId: '00f067aa0ba902b7',
          parentSpanId: 'b9c7c989f97918e1',
          traceState: 'vendor=value',
          flags: 1,
          name: 'chat',
          kind: 1,
          startTimeUnixNano: '1723298400000000000',
          endTimeUnixNano: '1723298401000000000',
          droppedAttributesCount: 3,
          attributes: [
            { key: 'gen_ai.request.model', value: { stringValue: 'gpt-5.6-terra' } },
            { key: 'copilot.turn.id', value: { stringValue: 'turn-trace-1' } },
            { key: 'copilot.tool.call.id', value: { stringValue: 'tool-trace-1' } }
          ],
          events: [{
            timeUnixNano: '1723298400500000000',
            name: 'gen_ai.content',
            droppedAttributesCount: 1,
            attributes: [{ key: 'future.event', value: { stringValue: 'event-value' } }]
          }],
          droppedEventsCount: 2,
          links: [{
            traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            spanId: 'bbbbbbbbbbbbbbbb',
            traceState: 'link=value',
            flags: 1,
            droppedAttributesCount: 1,
            attributes: [{ key: 'future.link', value: { stringValue: 'link-value' } }]
          }],
          droppedLinksCount: 4,
          status: { code: 2, message: 'failed' },
          futureSpanField: { keep: 'span' }
        }]
      }]
    }]
  });

  test('parseNativeOtelLines ingests Copilot native file-export span records', () => {
    const records = parseNativeOtelLines([JSON.stringify({
      type: 'span',
      traceId: 'trace-live',
      spanId: 'span-live',
      parentSpanId: 'parent-live',
      name: 'invoke_agent',
      startTime: [1_723_298_400, 500_000_000],
      endTime: [1_723_298_401, 0],
      attributes: {
        'gen_ai.conversation.id': 'session-live',
        'gen_ai.request.model': 'gpt-5.6-luna',
        'gen_ai.tool.call.id': 'tool-live'
      }
    })], 'native-otel-live.jsonl');

    assert.equal(records.length, 1);
    assert.equal(records[0]?.signal, 'trace');
    assert.equal(records[0]?.session_id, 'session-live');
    assert.equal(records[0]?.trace_id, 'trace-live');
    assert.equal(records[0]?.observed_at_unix_ms, 1_723_298_400_500);
    assert.equal(records[0]?.identity?.tool_call_id, 'tool-live');
  });

  test('parseNativeOtelLines ingests Copilot native file-export metric data points', () => {
    const records = parseNativeOtelLines([JSON.stringify({
      type: 'metric',
      name: 'gen_ai.client.operation.duration',
      dataPoints: [{
        attributes: { 'gen_ai.operation.name': 'invoke_agent' },
        startTime: [1_723_298_400, 500_000_000],
        endTime: [1_723_298_401, 0],
        value: { count: 1, sum: 2.5 }
      }]
    })], 'native-otel-live.jsonl');
    assert.equal(records.length, 1);
    assert.equal(records[0]?.signal, 'metric');
    assert.equal(records[0]?.observed_at_unix_ms, 1_723_298_400_500);
    assert.equal(records[0]?.attributes['metric.name'], 'gen_ai.client.operation.duration');
  });

  const record = parseNativeOtelLines([input], 'fixtures/lossless.jsonl')[0];
  assert.ok(record);
  const rawEntity = JSON.stringify(record.raw_entity);
  const rawRecord = JSON.stringify(record.raw_record);
  assert.match(rawEntity, /"futureSpanField":\{"keep":"span"\}/);
  assert.match(rawEntity, /"droppedLinksCount":4/);
  assert.match(rawEntity, /"future\.event".*"event-value"/);
  assert.match(rawEntity, /"future\.link".*"link-value"/);
  assert.match(rawRecord, /"futureResourceField":\{"keep":"yes"\}/);
  assert.match(JSON.stringify(record.raw_resource), /"droppedAttributesCount":2/);
  assert.match(JSON.stringify(record.raw_scope), /"droppedAttributesCount":1/);
  assert.equal(record.raw_scope_schema_url, 'https://opentelemetry.io/schemas/genai/1.0.0');
  assert.equal(record.identity?.session_id, 'session-lossless');
  assert.equal(record.identity?.turn_id, 'turn-trace-1');
  assert.equal(record.identity?.tool_call_id, 'tool-trace-1');
  assert.equal(JSON.stringify(record).includes('canary-pass'), false);
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

test('sanitizeNativeOtelValue applies shared opaque-reasoning redaction policy', () => {
  const disposition: RedactionDisposition = { redacted: false, policy_version: '', kinds: [], bytes: 0 };
  const sanitized = sanitizeNativeOtelValue('reasoning_ciphertext', 'opaque-ciphertext-value', disposition);
  assert.equal(sanitized, '[REDACTED_reasoning_ciphertext]');
  assert.equal(disposition.redacted, true);
  assert.equal(disposition.kinds.includes('secret_pattern'), true);
  assert.equal(disposition.bytes > 0, true);
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

test('NativeOtelCache serializes concurrent refreshes', async () => {
  await withRuntimeDirectory(async (directory) => {
    const filePath = path.join(directory, 'native-otel-logs.jsonl');
    const totalLines = 3_000;
    const lines = Array.from({ length: totalLines }, (_value, index) =>
      makeCacheLine(`session-concurrent-${index}`, 1_723_298_415_000 + index, `c${index}`)
    );
    await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');

    const cache = new NativeOtelCache(directory, totalLines + 100);
    await Promise.all(Array.from({ length: 20 }, () => cache.getRecords()));
    let records = await cache.getRecords();
    let polls = 0;
    while (records.length < totalLines && polls < 20) {
      records = await cache.getRecords();
      polls += 1;
    }

    assert.equal(records.length, totalLines);
    assert.equal(new Set(records.map((record) => record.record_id)).size, totalLines);
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
    assert.equal(after.length, 2);
    assert.equal(after[0]?.validity, 'invalid');
    assert.equal(after[0]?.attributes['reason'], 'source_truncated_reset');
    assert.equal(after[0]?.attributes['previous_byte_offset'], Buffer.byteLength(`${beforeA}\n${beforeB}\n`, 'utf8'));
    assert.equal(after[0]?.attributes['previous_line_number'], 2);
    assert.equal(after[1]?.session_id, 'session-reset-new');
    assert.equal(after[1]?.line_number, 1);
  });
});

test('NativeOtelCache emits reset when file is rewritten with a larger payload', async () => {
  await withRuntimeDirectory(async (directory) => {
    const filePath = path.join(directory, 'native-otel-logs.jsonl');
    const oldA = makeCacheLine('session-rewrite-old-a', 1_723_298_460_000, 'w1');
    const oldB = makeCacheLine('session-rewrite-old-b', 1_723_298_461_000, 'w2');
    const oldContent = `${oldA}\n${oldB}\n`;
    await writeFile(filePath, oldContent, 'utf8');

    const cache = new NativeOtelCache(directory, 100);
    const before = await cache.getRecords();
    assert.equal(before.length, 2);

    const newA = makeCacheLine('session-rewrite-new-a', 1_723_298_462_000, 'w3');
    const newB = makeCacheLine('session-rewrite-new-b', 1_723_298_463_000, 'w4');
    const newC = makeCacheLine('session-rewrite-new-c', 1_723_298_464_000, 'w5');
    await writeFile(filePath, `${newA}\n${newB}\n${newC}\n`, 'utf8');

    const after = await cache.getRecords();
    assert.equal(after.length, 4);
    assert.equal(after[0]?.validity, 'invalid');
    assert.equal(after[0]?.attributes['reason'], 'source_truncated_reset');
    assert.equal(after[0]?.attributes['previous_byte_offset'], Buffer.byteLength(oldContent, 'utf8'));
    assert.equal(after[0]?.attributes['previous_line_number'], 2);
    assert.deepEqual(
      after.slice(1).map((record) => record.session_id),
      ['session-rewrite-new-a', 'session-rewrite-new-b', 'session-rewrite-new-c']
    );
    assert.equal(after.some((record) => record.session_id?.startsWith('session-rewrite-old-') === true), false);
  });
});

test('NativeOtelCache reads large files in bounded chunks without skipping data', async () => {
  await withRuntimeDirectory(async (directory) => {
    const filePath = path.join(directory, 'native-otel-logs.jsonl');
    const totalLines = 3_000;
    const lines = Array.from({ length: totalLines }, (_value, index) =>
      makeCacheLine(`session-bounded-${index}`, 1_723_298_470_000 + index, `bound-${index}`)
    );
    await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');

    const cache = new NativeOtelCache(directory, totalLines + 10);
    const firstRead = await cache.getRecords();
    assert.equal(firstRead.length > 0, true);
    assert.equal(firstRead.length < totalLines, true);

    let records = firstRead;
    let polls = 0;
    while (records.length < totalLines && polls < 20) {
      records = await cache.getRecords();
      polls += 1;
    }

    assert.equal(records.length, totalLines);
    assert.equal(records[0]?.session_id, 'session-bounded-0');
    assert.equal(records[records.length - 1]?.session_id, `session-bounded-${totalLines - 1}`);
    assert.equal(new Set(records.map((record) => record.session_id)).size, totalLines);
    assert.equal(records.some((record) => record.session_id?.includes('\u0000') === true), false);
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
