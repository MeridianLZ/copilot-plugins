import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correlateSources, type SourceRecord } from '../src/correlation.js';

function record(
  source_kind: SourceRecord['source_kind'],
  source_id: string,
  timestamp_ms: number,
  extra: Partial<SourceRecord> = {}
): SourceRecord {
  return { source_kind, source_id, timestamp_ms, ...extra };
}

test('correlateSources prioritizes exact trace/tool/turn/session matches', () => {
  const entries = correlateSources([
    record('native_otel', 'otel-1', 1_000, { trace_id: 'trace-1', tool_call_id: 'tool-a', session_id: 's-1' }),
    record('hook', 'hook-trace', 1_001, { trace_id: 'trace-1', tool_call_id: 'tool-b', session_id: 's-1' }),
    record('native_transcript', 'native-tool', 2_000, { tool_call_id: 'tool-call-1', session_id: 's-1' }),
    record('hook', 'hook-tool', 2_001, { tool_call_id: 'tool-call-1', session_id: 's-1' }),
    record('mcp', 'mcp-turn', 3_000, { turn_id: 'turn-1', session_id: 's-1' }),
    record('evidence', 'evidence-turn', 3_001, { turn_id: 'turn-1', session_id: 's-1' }),
    record('hook', 'hook-session', 4_000, { session_id: 's-2' }),
    record('evidence', 'evidence-session', 4_001, { session_id: 's-2' })
  ]);

  const byId = new Map(entries.map((entry) => [entry.source_id, entry]));

  assert.equal(byId.get('hook-trace')?.matched_by, 'trace_id');
  assert.equal(byId.get('hook-tool')?.matched_by, 'tool_call_id');
  assert.equal(byId.get('evidence-turn')?.matched_by, 'turn_id');
  assert.equal(byId.get('evidence-session')?.matched_by, 'session_id');
  assert.equal(byId.get('hook-trace')?.disposition, 'represented');
});

test('correlateSources prioritizes canonical message and tool identities before timestamp heuristics', () => {
  const entries = correlateSources([
    record('native_transcript', 'message-1', 10_000, {
      session_id: 's-identity',
      identity: { session_id: 's-identity', message_id: 'message-1', turn_id: 'turn-1' }
    }),
    record('native_otel', 'otel-message-1', 15_000, {
      session_id: 's-identity',
      identity: { session_id: 's-identity', message_id: 'message-1', trace_id: 'trace-1', span_id: 'span-1' }
    }),
    record('hook', 'tool-1', 20_000, {
      session_id: 's-identity',
      identity: { session_id: 's-identity', tool_call_id: 'tool-call-1' }
    }),
    record('native_otel', 'otel-tool-1', 25_000, {
      session_id: 's-identity',
      identity: { session_id: 's-identity', tool_call_id: 'tool-call-1', trace_id: 'trace-2', span_id: 'span-2' }
    })
  ]);

  const byId = new Map(entries.map((entry) => [entry.source_id, entry]));
  assert.equal(byId.get('otel-message-1')?.matched_by, 'message_id');
  assert.equal(byId.get('otel-message-1')?.disposition, 'represented');
  assert.equal(byId.get('otel-tool-1')?.matched_by, 'tool_call_id');
  assert.equal(byId.get('otel-tool-1')?.disposition, 'represented');
});

test('correlateSources ignores parentId-like fields', () => {
  const records = [
    {
      ...record('hook', 'hook-parent', 10_000, { session_id: 's-parent' }),
      parentId: 'span-parent-1'
    },
    {
      ...record('native_transcript', 'native-parent', 13_500, { session_id: 's-parent' }),
      parentId: 'span-parent-1'
    }
  ] as unknown as SourceRecord[];

  const entries = correlateSources(records);
  assert.equal(entries[1]?.disposition, 'unmatched');
  assert.equal(entries[1]?.matched_by, undefined);
});

test('correlateSources applies FIFO heuristic with deterministic tie order', () => {
  const entries = correlateSources([
    record('native_otel', 'otel-a', 5_000, { session_id: 's-fifo' }),
    record('native_transcript', 'native-a', 5_000, { session_id: 's-fifo' }),
    record('hook', 'hook-a', 5_001, { session_id: 's-fifo' })
  ]);
  const byId = new Map(entries.map((entry) => [entry.source_id, entry]));
  assert.equal(byId.get('hook-a')?.disposition, 'heuristic');
  assert.equal(byId.get('hook-a')?.matched_by, 'fifo_timestamp');
  assert.equal(byId.get('hook-a')?.canonical_id, 'native_otel:otel-a');
});

test('correlateSources preserves duplicate inputs as deduplicated entries', () => {
  const entries = correlateSources([
    record('hook', 'dup-1', 1_000, { session_id: 's-dup', trace_id: 'trace-dup' }),
    record('hook', 'dup-1', 1_001, { session_id: 's-dup', trace_id: 'trace-dup' })
  ]);
  assert.equal(entries.length, 2);
  assert.equal(entries[1]?.disposition, 'deduplicated');
  assert.equal(entries[1]?.canonical_id, 'hook:dup-1');
});

test('correlateSources labels late out-of-order records explicitly', () => {
  const entries = correlateSources([
    record('hook', 'hook-new', 9_000, { session_id: 's-late' }),
    record('native_transcript', 'native-old', 1_000, { session_id: 's-late' })
  ]);
  const byId = new Map(entries.map((entry) => [entry.source_id, entry]));
  assert.equal(byId.get('native-old')?.disposition, 'late_out_of_order');
});
