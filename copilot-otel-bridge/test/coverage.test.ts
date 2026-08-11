import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correlateSources } from '../src/correlation.js';
import {
  buildSourceRecords,
  summarizeCoverage,
  type CoverageEntry
} from '../src/coverage.js';
import type { NativeEvent } from '../src/native-session.js';
import type { ProjectedSpan } from '../src/trace-projector.js';
import type { HookEnvelope, NativeOtelRecord } from '../src/types.js';

const base = Date.parse('2026-08-10T12:00:00.000Z');

function hookEnvelope(sessionId: string): HookEnvelope {
  return {
    schema_version: '1.0.0',
    event_id: 'hook-1',
    observed_at: new Date(base).toISOString(),
    observed_at_unix_ms: base,
    source: 'http-hook',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    payload: {
      hook_event_name: 'sessionStart',
      session_id: sessionId,
      payload_format: 'camelCase',
      timestamp: new Date(base).toISOString(),
      prompt: 'https://canary-pass:canary-secret@proxy.invalid:8080'
    }
  };
}

function nativeTranscriptEvent(sessionId: string): NativeEvent {
  return {
    type: 'tool.execution_start',
    data: {
      sessionId,
      toolCallId: 'https://canary-pass:canary-secret@proxy.invalid:8080',
      toolName: 'view',
      parentId: 'unreliable-parent-id'
    },
    id: 'native-1',
    timestamp: new Date(base + 1_000).toISOString()
  };
}

function nativeOtelRecord(sessionId: string): NativeOtelRecord {
  return {
    record_id: 'otel-1',
    source_file: 'logs.jsonl',
    line_number: 1,
    signal: 'log',
    observed_at_unix_ms: base + 2_000,
    trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
    span_id: '00f067aa0ba902b7',
    session_id: sessionId,
    turn_id: 'turn-1',
    tool_call_id: 'https://canary-pass:canary-secret@proxy.invalid:8080',
    attributes: {},
    resource: {},
    instrumentation_scope: {},
    content_disposition: { redacted: false, policy_version: 'test', kinds: [], bytes: 0 },
    validity: 'valid',
    source_hash: 'hash-1'
  };
}

function evidenceSpan(sessionId: string): ProjectedSpan {
  return {
    span_id: 'span-1',
    kind: 'turn',
    name: 'github.copilot.hook.turn',
    session_id: sessionId,
    start_unix_ms: base + 500,
    status: 'ok',
    start_event_id: 'hook-1',
    end_event_id: 'hook-1'
  };
}

test('buildSourceRecords emits hook/native/mcp/evidence records and sanitizes ids', () => {
  const sessionId = 'sess-coverage';
  const records = buildSourceRecords({
    sessionId,
    hooks: [hookEnvelope(sessionId)],
    nativeEvents: [nativeTranscriptEvent(sessionId)],
    nativeOtelRecords: [nativeOtelRecord(sessionId)],
    spans: [evidenceSpan(sessionId)]
  });

  const kinds = new Set(records.map((record) => record.source_kind));
  assert.deepEqual(
    [...kinds].sort(),
    ['evidence', 'hook', 'mcp', 'native_otel', 'native_transcript']
  );

  const hook = records.find((record) => record.source_kind === 'hook');
  assert.equal(hook?.trace_id, '4bf92f3577b34da6a3ce929d0e0e4736');

  const transcript = records.find((record) => record.source_kind === 'native_transcript');
  assert.ok(transcript);
  assert.equal(transcript?.tool_call_id?.includes('canary-pass'), false);
  assert.equal('parentId' in (transcript as unknown as Record<string, unknown>), false);
});

test('summarizeCoverage returns balanced totals with complete source/disposition accounting', () => {
  const sessionId = 'sess-coverage';
  const entries = correlateSources(
    buildSourceRecords({
      sessionId,
      hooks: [hookEnvelope(sessionId)],
      nativeEvents: [nativeTranscriptEvent(sessionId)],
      nativeOtelRecords: [nativeOtelRecord(sessionId)],
      spans: [evidenceSpan(sessionId)]
    })
  );
  const totals = summarizeCoverage(entries);

  assert.equal(totals.total, entries.length);
  assert.equal(totals.balanced, true);
  assert.equal(totals.by_source.hook > 0, true);
  assert.equal(totals.by_source.native_otel > 0, true);
  assert.equal(totals.by_disposition.rendered >= 0, true);
  assert.equal(totals.by_disposition.unmatched >= 0, true);
});

test('summarizeCoverage counts every entry disposition exactly once', () => {
  const entries: CoverageEntry[] = [
    {
      source_kind: 'hook',
      source_id: 'h-1',
      timestamp_ms: 1,
      disposition: 'rendered',
      related_ids: [],
      reason: 'rendered'
    },
    {
      source_kind: 'native_otel',
      source_id: 'n-1',
      timestamp_ms: 2,
      disposition: 'unmatched',
      related_ids: [],
      reason: 'unmatched'
    },
    {
      source_kind: 'evidence',
      source_id: 'e-1',
      timestamp_ms: 3,
      disposition: 'heuristic',
      matched_by: 'fifo_timestamp',
      canonical_id: 'hook:h-1',
      related_ids: ['hook:h-1'],
      reason: 'heuristic'
    }
  ];

  const totals = summarizeCoverage(entries);
  assert.equal(totals.total, 3);
  assert.equal(totals.by_source.hook, 1);
  assert.equal(totals.by_source.native_otel, 1);
  assert.equal(totals.by_source.evidence, 1);
  assert.equal(totals.by_disposition.rendered, 1);
  assert.equal(totals.by_disposition.unmatched, 1);
  assert.equal(totals.by_disposition.heuristic, 1);
  assert.equal(totals.balanced, true);
});
