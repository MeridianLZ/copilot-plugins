import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseNativeLines, projectNativeConversation, resolveSessionStatePath } from '../src/native-session.js';
import type { ConversationNode } from '../src/conversation-projector.js';

const base = Date.parse('2026-08-01T00:00:00.000Z');

function line(type: string, offsetMs: number, data: Record<string, unknown>, agentId?: string): string {
  return JSON.stringify({
    type,
    data,
    id: `${type}-${offsetMs}`,
    timestamp: new Date(base + offsetMs).toISOString(),
    parentId: 'unreliable-do-not-use',
    ...(agentId !== undefined ? { agentId } : {})
  });
}

const fixture = [
  line('session.start', 0, { sessionId: 'sess-native', copilotVersion: '1.0.79-5' }),
  line('session.model_change', 10, { newModel: 'gpt-5.6-terra' }),
  line('user.message', 1_000, { content: 'please fix the bug', transformedContent: '<ctx/> please fix the bug' }),
  line('assistant.turn_start', 1_100, { turnId: 't-0' }),
  // chunked assistant message: 2 chunks, out of order arrival
  line('assistant.message', 1_200, {
    messageId: 'm-1', model: 'gpt-5.6-terra', turnId: 't-0', chunkIndex: 1, chunkCount: 2,
    content: ' and here is part two.'
  }),
  line('assistant.message', 1_250, {
    messageId: 'm-1', model: 'gpt-5.6-terra', turnId: 't-0', chunkIndex: 0, chunkCount: 2,
    content: 'Here is part one', reasoningText: 'thinking about the fix',
    toolRequests: [{ toolCallId: 'call-tool-1', name: 'view', arguments: { path: 'a.ts' }, intentionSummary: 'read a.ts' }]
  }),
  line('tool.execution_start', 1_300, { toolCallId: 'call-tool-1', toolName: 'view', arguments: { path: 'a.ts' }, turnId: 't-0' }),
  line('tool.execution_complete', 1_800, { toolCallId: 'call-tool-1', success: true, result: { content: 'file body with ghp_abcdefghij1234567890 token' } }),
  // subagent with its own scoped tool + message
  line('subagent.started', 2_000, { toolCallId: 'call-sub-1', agentName: 'explore', agentDisplayName: 'Explore Agent', model: 'gpt-5.4' }),
  line('tool.execution_start', 2_100, { toolCallId: 'call-sub-tool', toolName: 'grep', arguments: { pattern: 'x' } }, 'call-sub-1'),
  line('tool.execution_complete', 2_200, { toolCallId: 'call-sub-tool', success: false, error: { message: 'not found' } }, 'call-sub-1'),
  line('assistant.message', 2_300, { messageId: 'm-sub', model: 'gpt-5.4', content: 'subagent findings' }, 'call-sub-1'),
  line('subagent.completed', 2_500, { toolCallId: 'call-sub-1', agentName: 'explore', durationMs: 500, totalTokens: 42 }),
  // permission flow
  line('permission.requested', 3_000, { requestId: 'req-1', permissionRequest: { kind: 'shell', fullCommandText: 'rm -rf /tmp/x', intention: 'cleanup' } }),
  line('permission.completed', 3_100, { requestId: 'req-1', toolCallId: 'call-tool-2', result: { kind: 'approved' } }),
  // encrypted-only reasoning message (no content)
  line('assistant.message', 3_500, { messageId: 'm-2', model: 'gpt-5.6-terra', turnId: 't-0', content: '', reasoningOpaque: 'AAAA==' }),
  line('assistant.turn_end', 4_000, { turnId: 't-0' }),
  line('session.usage_checkpoint', 4_100, { totalNanoAiu: 123_000_000_000, totalPremiumRequests: 2 }),
  line('session.shutdown', 5_000, { totalNanoAiu: 130_000_000_000 }),
  'this is not json {{{',
  `{"type":"user.message","data":{"content":"line with \u2028 separator"},"id":"u2028","timestamp":"${new Date(base + 6_000).toISOString()}"}`
];

test('parseNativeLines is defensive: junk skipped, valid lines kept', () => {
  const events = parseNativeLines(fixture);
  assert.equal(events.length, fixture.length - 1); // only the corrupt line dropped
  assert.ok(events.every((event) => typeof event.type === 'string' && typeof event.timestamp === 'string'));
});

test('assistant chunks reassemble by messageId ordered by chunkIndex', () => {
  const projection = projectNativeConversation(parseNativeLines(fixture), 'sess-native');
  const turn = projection.root.children.find((node) => node.kind === 'turn');
  assert.ok(turn);
  const assistant = turn.children.find((node) => node.id === 'native-msg:m-1');
  assert.ok(assistant);
  const message = assistant.content.find((item) => item.label === 'message');
  assert.equal(message?.text, 'Here is part one and here is part two.');
  const reasoning = assistant.content.find((item) => item.label === 'reasoning');
  assert.equal(reasoning?.text, 'thinking about the fix');
  assert.equal(assistant.model, 'gpt-5.6-terra');
});

test('encrypted-only reasoning yields a marker, never ciphertext', () => {
  const projection = projectNativeConversation(parseNativeLines(fixture), 'sess-native');
  const turn = projection.root.children.find((node) => node.kind === 'turn');
  const encryptedNode = turn?.children.find((node) => node.id === 'native-msg:m-2');
  assert.ok(encryptedNode);
  assert.equal(encryptedNode.reasoning_encrypted, true);
  assert.equal(JSON.stringify(encryptedNode).includes('AAAA=='), false);
});

test('tools join by toolCallId with status, duration, and scrubbed results', () => {
  const projection = projectNativeConversation(parseNativeLines(fixture), 'sess-native');
  const turn = projection.root.children.find((node) => node.kind === 'turn');
  const tool = turn?.children.find((node) => node.kind === 'tool');
  assert.ok(tool);
  assert.equal(tool.tool_name, 'view');
  assert.equal(tool.status, 'ok');
  assert.equal(tool.duration_ms, 500);
  const result = tool.content.find((item) => item.label === 'result');
  const dumped = JSON.stringify(result?.json);
  assert.equal(dumped.includes('ghp_abcdefghij1234567890'), false);
  assert.equal(dumped.includes('[REDACTED_GITHUB_TOKEN]'), true);
});

test('subagents nest scoped events and expose child_session_id', () => {
  const projection = projectNativeConversation(parseNativeLines(fixture), 'sess-native');
  const findSubagent = (node: ConversationNode): ConversationNode | undefined => {
    if (node.kind === 'subagent') return node;
    for (const child of node.children) {
      const found = findSubagent(child);
      if (found) return found;
    }
    return undefined;
  };
  const subagent = findSubagent(projection.root);
  assert.ok(subagent);
  assert.equal(subagent.child_session_id, 'call-sub-1');
  assert.equal(subagent.status, 'ok');
  assert.equal(subagent.duration_ms, 500);
  const nestedTool = subagent.children.find((node) => node.kind === 'tool');
  assert.ok(nestedTool);
  assert.equal(nestedTool.status, 'error');
  const nestedMessage = subagent.children.find((node) => node.id === 'native-msg:m-sub');
  assert.equal(nestedMessage?.content.find((item) => item.label === 'message')?.text, 'subagent findings');
  assert.equal(projection.subagent_count, 1);
});

test('permissions join by requestId; model and usage surface on the projection', () => {
  const projection = projectNativeConversation(parseNativeLines(fixture), 'sess-native');
  const turn = projection.root.children.find((node) => node.kind === 'turn');
  const permission = turn?.children.find((node) => node.id === 'native-permission:req-1');
  assert.ok(permission);
  assert.equal(permission.status, 'ok');
  assert.equal(permission.content.find((item) => item.label === 'decision')?.text, 'approved');
  assert.equal(projection.model, 'gpt-5.6-terra');
  assert.equal(projection.usage?.total_nano_aiu, 130_000_000_000);
  assert.equal(projection.turn_count, 2); // main turn + the trailing U+2028 user message opening a new one
  assert.equal(projection.tool_count, 2); // root tool + subagent-scoped tool
});

test('resolveSessionStatePath confines session ids to the session-state dir', () => {
  const resolved = resolveSessionStatePath('..\\..\\evil', 'C:/home/.copilot');
  assert.equal(resolved.includes('..'), false);
  assert.ok(resolved.endsWith('events.jsonl'));
});
