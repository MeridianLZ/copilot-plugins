import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLedgerLines, projectSessions, projectSessionTrace } from '../src/trace-projector.js';
import type { CopilotHookEventName, JsonObject } from '../src/types.js';

let counter = 0;

function line(event: CopilotHookEventName, timeMs: number, extra: JsonObject = {}): string {
  counter += 1;
  return JSON.stringify({
    schema_version: '1.0.0',
    event_id: `evt-${counter}`,
    observed_at: new Date(timeMs).toISOString(),
    observed_at_unix_ms: timeMs,
    source: 'command-hook',
    payload: {
      hook_event_name: event,
      session_id: 'sess-1',
      payload_format: 'camelCase',
      timestamp: new Date(timeMs).toISOString(),
      ...extra
    }
  });
}

const base = Date.parse('2026-08-01T00:00:00.000Z');
const ledger = [
  line('sessionStart', base, { cwd: '/repo', source: 'startup' }),
  line('userPromptSubmitted', base + 1_000, { prompt: 'do the thing' }),
  line('userPromptTransformed', base + 1_100, { transformed_prompt: 'do the thing carefully' }),
  line('preToolUse', base + 2_000, { tool_name: 'bash', tool_input: { command: 'pwd' } }),
  line('permissionRequest', base + 2_100, { tool_name: 'bash' }),
  line('postToolUse', base + 3_000, { tool_name: 'bash', tool_result: { resultType: 'success' } }),
  line('subagentStart', base + 4_000, { agent_name: 'helper' }),
  line('subagentStop', base + 6_000, { agent_name: 'helper', agent_id: 'a-1' }),
  line('preToolUse', base + 6_500, { tool_name: 'view' }),
  line('postToolUseFailure', base + 7_000, { tool_name: 'view', error: 'missing file' }),
  line('agentStop', base + 8_000, {}),
  line('notification', base + 8_500, { notification_type: 'agent_completed' }),
  line('sessionEnd', base + 9_000, { reason: 'complete' })
];

test('parseLedgerLines dedupes and tolerates junk lines', () => {
  const parsed = parseLedgerLines([...ledger, ledger[0] ?? '', 'not json', '']);
  assert.equal(parsed.length, 13);
});

test('projectSessions summarizes counts, status, and duration bounds', () => {
  const envelopes = parseLedgerLines(ledger);
  const sessions = projectSessions(envelopes);
  assert.equal(sessions.length, 1);
  const summary = sessions[0];
  assert.ok(summary);
  assert.equal(summary.session_id, 'sess-1');
  assert.equal(summary.status, 'ok');
  assert.equal(summary.end_reason, 'complete');
  assert.equal(summary.turn_count, 1);
  assert.equal(summary.tool_count, 2);
  assert.equal(summary.subagent_count, 1);
  assert.equal(summary.error_count, 1);
  assert.equal(summary.event_count, 13);
  assert.equal(summary.cwd, '/repo');
  assert.equal(summary.started_at_ms, base);
  assert.equal(summary.ended_at_ms, base + 9_000);
});

test('projectSessionTrace reconstructs lifecycle spans with correct pairing', () => {
  const envelopes = parseLedgerLines(ledger);
  const trace = projectSessionTrace(envelopes, 'sess-1');
  assert.equal(trace.events.length, 13);

  const lifecycle = trace.spans.filter((span) => span.kind !== 'point');
  const points = trace.spans.filter((span) => span.kind === 'point');
  assert.equal(points.length, 13);
  assert.deepEqual(
    lifecycle.map((span) => span.kind).sort(),
    ['session', 'subagent', 'tool', 'tool', 'turn']
  );

  const session = lifecycle.find((span) => span.kind === 'session');
  assert.ok(session);
  assert.equal(session.status, 'ok');
  assert.equal(session.end_unix_ms, base + 9_000);

  const turn = lifecycle.find((span) => span.kind === 'turn');
  assert.ok(turn);
  assert.equal(turn.parent_id, session.span_id);
  assert.equal(turn.end_unix_ms, base + 8_000);

  const bash = lifecycle.find((span) => span.tool_name === 'bash');
  assert.ok(bash);
  assert.equal(bash.status, 'ok');
  assert.equal(bash.parent_id, turn.span_id);
  assert.equal(bash.end_unix_ms, base + 3_000);

  const view = lifecycle.find((span) => span.tool_name === 'view');
  assert.ok(view);
  assert.equal(view.status, 'error');

  const subagent = lifecycle.find((span) => span.kind === 'subagent');
  assert.ok(subagent);
  assert.equal(subagent.status, 'ok');
  assert.equal(subagent.end_unix_ms, base + 6_000);
});

test('projectSessionTrace recovers spans left open at sessionEnd', () => {
  const openLedger = [
    line('sessionStart', base, {}),
    line('userPromptSubmitted', base + 1_000, {}),
    line('preToolUse', base + 2_000, { tool_name: 'bash' }),
    line('sessionEnd', base + 5_000, { reason: 'crash' })
  ];
  const trace = projectSessionTrace(parseLedgerLines(openLedger), 'sess-1');
  const lifecycle = trace.spans.filter((span) => span.kind !== 'point');
  const recovered = lifecycle.filter((span) => span.status === 'recovered');
  assert.equal(recovered.length, 2);
  const session = lifecycle.find((span) => span.kind === 'session');
  assert.ok(session);
  assert.equal(session.status, 'error');
  assert.equal(session.status_message, 'crash');
});
