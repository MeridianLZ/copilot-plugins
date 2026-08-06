import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPayloadDeduper } from '../src/dedupe.js';
import { parseLedgerLines } from '../src/trace-projector.js';
import type { NormalizedHookPayload } from '../src/types.js';

const base = Date.parse('2026-08-01T00:00:00.000Z');

function payload(event: string, timeMs: number, extra: Record<string, unknown> = {}): NormalizedHookPayload {
  return {
    hook_event_name: event,
    session_id: 'sess-1',
    payload_format: 'camelCase',
    timestamp: new Date(timeMs).toISOString(),
    ...extra
  } as NormalizedHookPayload;
}

test('identical payload within window is a duplicate', () => {
  const deduper = createPayloadDeduper(10_000);
  const p = payload('preToolUse', base, { tool_name: 'bash' });
  assert.equal(deduper.isDuplicate(p, base), false);
  assert.equal(deduper.isDuplicate(payload('preToolUse', base, { tool_name: 'bash' }), base + 600), true);
});

test('identical payload outside window is kept', () => {
  const deduper = createPayloadDeduper(10_000);
  const p = payload('preToolUse', base, { tool_name: 'bash' });
  assert.equal(deduper.isDuplicate(p, base), false);
  assert.equal(deduper.isDuplicate(p, base + 11_000), false);
});

test('distinct payloads are never duplicates', () => {
  const deduper = createPayloadDeduper(10_000);
  assert.equal(deduper.isDuplicate(payload('preToolUse', base, { tool_name: 'bash' }), base), false);
  assert.equal(deduper.isDuplicate(payload('preToolUse', base + 1, { tool_name: 'bash' }), base + 1), false);
  assert.equal(deduper.isDuplicate(payload('postToolUse', base, { tool_name: 'bash' }), base), false);
});

test('parseLedgerLines collapses double-install duplicates (fresh event_ids, same payload)', () => {
  let counter = 0;
  const envelope = (event: string, timeMs: number, observedMs: number): string => {
    counter += 1;
    return JSON.stringify({
      schema_version: '1.0.0',
      event_id: `evt-${counter}`,
      observed_at: new Date(observedMs).toISOString(),
      observed_at_unix_ms: observedMs,
      source: 'command-hook',
      payload: {
        hook_event_name: event,
        session_id: 'sess-1',
        payload_format: 'camelCase',
        timestamp: new Date(timeMs).toISOString()
      }
    });
  };
  // Each logical event emitted twice ~600ms apart with distinct event_ids,
  // exactly like two hook files firing the same egress.
  const lines = [
    envelope('sessionStart', base, base),
    envelope('sessionStart', base, base + 600),
    envelope('userPromptSubmitted', base + 1_000, base + 1_000),
    envelope('userPromptSubmitted', base + 1_000, base + 1_600),
    envelope('agentStop', base + 2_000, base + 2_000),
    envelope('agentStop', base + 2_000, base + 2_600)
  ];
  const parsed = parseLedgerLines(lines);
  assert.equal(parsed.length, 3);
  assert.deepEqual(
    parsed.map((entry) => entry.payload.hook_event_name),
    ['sessionStart', 'userPromptSubmitted', 'agentStop']
  );
});
