import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  conversationToMarkdown,
  projectConversation
} from '../src/conversation-projector.js';
import { parseNativeLines } from '../src/native-session.js';
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
      session_id: 'sess-conv',
      payload_format: 'camelCase',
      timestamp: new Date(timeMs).toISOString(),
      ...extra
    }
  });
}

const base = Date.parse('2026-08-05T12:00:00.000Z');
const raw = [
  line('sessionStart', base, { cwd: '/repo', source: 'startup' }),
  line('userPromptSubmitted', base + 1_000, { prompt: 'do the thing' }),
  line('userPromptTransformed', base + 1_100, { transformed_prompt: 'do the thing carefully' }),
  line('preToolUse', base + 2_000, { tool_name: 'bash', tool_input: { command: 'pwd' } }),
  line('permissionRequest', base + 2_100, { tool_name: 'bash' }),
  line('postToolUse', base + 3_000, { tool_name: 'bash', tool_result: { resultType: 'success' } }),
  line('subagentStart', base + 4_000, { agent_name: 'helper' }),
  line('subagentStop', base + 6_000, { agent_name: 'helper', agent_id: 'a-1', response: 'ok' }),
  line('preToolUse', base + 6_500, { tool_name: 'view' }),
  line('postToolUseFailure', base + 7_000, { tool_name: 'view', error: 'missing file' }),
  line('errorOccurred', base + 7_500, { error_type: 'RateLimitError', recoverable: true }),
  line('agentStop', base + 8_000, {}),
  line('notification', base + 8_500, { notification_type: 'agent_completed', message: 'done' }),
  line('sessionEnd', base + 9_000, { reason: 'complete' })
];

function envelopes() {
  return raw.map((row) => JSON.parse(row));
}

test('projectConversation nests turn/tool/subagent chronologically', () => {
  const doc = projectConversation(envelopes(), 'sess-conv');
  assert.equal(doc.session_id, 'sess-conv');
  assert.equal(doc.status, 'ok');
  assert.equal(doc.event_count, 14);
  assert.equal(doc.turn_count, 1);
  assert.equal(doc.tool_count, 2);
  assert.equal(doc.subagent_count, 1);
  assert.equal(doc.error_count, 2);

  const session = doc.root;
  assert.equal(session.kind, 'session');
  const turn = session.children.find((child) => child.kind === 'turn');
  assert.ok(turn);
  assert.equal(turn?.status, 'ok');

  const tools = turn?.children.filter((child) => child.kind === 'tool') ?? [];
  assert.equal(tools.length, 2);
  assert.equal(tools[0]?.tool_name, 'bash');
  assert.equal(tools[0]?.status, 'ok');
  assert.equal(tools[1]?.tool_name, 'view');
  assert.equal(tools[1]?.status, 'error');

  const subagent = turn?.children.find((child) => child.kind === 'subagent');
  assert.ok(subagent);
  assert.equal(subagent?.agent_name, 'helper');
  assert.equal(subagent?.status, 'ok');

  const names = turn?.children.map((child) => child.kind + ':' + (child.event_name ?? child.title)) ?? [];
  assert.ok(names.some((name) => name.includes('userPromptSubmitted') || name.includes('User prompt')));
});

test('conversationToMarkdown is verbatim and includes nested sections', () => {
  const md = conversationToMarkdown(projectConversation(envelopes(), 'sess-conv'));
  assert.match(md, /# Conversation `sess-conv`/);
  assert.match(md, /## Verbatim chronological transcript/);
  assert.match(md, /do the thing/);
  assert.match(md, /Tool bash|tool: `bash`/);
  assert.match(md, /missing file|Failure/);
  assert.match(md, /RateLimitError|Error/);
  assert.match(md, /## Raw event ledger/);
  assert.match(md, /"hook_event_name": "sessionStart"/);
});

test('native events switch projection to native-first with hook overlay', () => {
  const nativeLines = [
    JSON.stringify({ type: 'session.start', data: { copilotVersion: '1.0.79-5' }, id: 'n1', timestamp: new Date(base).toISOString() }),
    JSON.stringify({ type: 'user.message', data: { content: 'do the thing' }, id: 'n2', timestamp: new Date(base + 1_000).toISOString() }),
    JSON.stringify({ type: 'assistant.turn_start', data: { turnId: 't-0' }, id: 'n3', timestamp: new Date(base + 1_100).toISOString() }),
    JSON.stringify({
      type: 'assistant.message',
      data: { messageId: 'm-1', model: 'gpt-5.6-terra', turnId: 't-0', content: 'Done. The thing is complete.' },
      id: 'n4',
      timestamp: new Date(base + 5_000).toISOString()
    }),
    JSON.stringify({ type: 'assistant.turn_end', data: { turnId: 't-0' }, id: 'n5', timestamp: new Date(base + 8_000).toISOString() })
  ];
  const doc = projectConversation(envelopes(), 'sess-conv', parseNativeLines(nativeLines));
  assert.equal(doc.schema_version, '1.2.0');
  assert.equal(doc.source, 'native+hooks');
  assert.equal(doc.model, 'gpt-5.6-terra');
  assert.equal(doc.turn_count, 1);
  const turn = doc.root.children.find((child) => child.kind === 'turn');
  assert.ok(turn);
  assert.equal(turn.span_name, 'github.copilot.hook.turn');
  assert.equal(turn.span_tier, 3);
  const assistant = turn.children.find((child) => String(child.id).startsWith('native-msg'));
  assert.ok(assistant);
  assert.equal(assistant.span_name, 'chat gpt-5.6-terra');
  assert.equal(assistant.span_tier, 2);
  const assistantText = JSON.stringify(turn);
  assert.ok(assistantText.includes('Done. The thing is complete.'));
  // hook-only governance overlay landed inside the turn window
  assert.ok(turn.children.some((child) => child.event_name === 'errorOccurred'));
  assert.ok(turn.children.some((child) => child.event_name === 'postToolUseFailure'));
});

test('without native events the hooks-only projection is unchanged in shape', () => {
  const doc = projectConversation(envelopes(), 'sess-conv');
  assert.equal(doc.schema_version, '1.2.0');
  assert.equal(doc.source, 'hooks-only');
  assert.equal(doc.model, undefined);
  assert.equal(doc.turn_count, 1);
  assert.equal(doc.tool_count, 2);
});
