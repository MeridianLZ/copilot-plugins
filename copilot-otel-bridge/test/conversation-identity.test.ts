import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  identityMatchKeys,
  mergeConversationIdentity,
  normalizeConversationIdentity,
  type ConversationIdentity
} from '../src/conversation-identity.js';

test('normalizes native and telemetry ID aliases into one canonical identity', () => {
  const identity = normalizeConversationIdentity({
    sessionId: 'session-1',
    turnId: 'turn-2',
    messageId: 'message-3',
    toolCallId: 'tool-4',
    agentId: 'agent-5',
    traceId: 'trace-6',
    spanId: 'span-7',
    parentSpanId: 'parent-8',
    eventId: 'hook-9',
    requestId: 'request-10'
  });

  assert.deepEqual(identity, {
    session_id: 'session-1',
    turn_id: 'turn-2',
    message_id: 'message-3',
    tool_call_id: 'tool-4',
    agent_id: 'agent-5',
    trace_id: 'trace-6',
    span_id: 'span-7',
    parent_span_id: 'parent-8',
    hook_event_id: 'hook-9',
    mcp_request_id: 'request-10'
  });
});

test('normalizes snake-case aliases and drops blank or non-string identifiers', () => {
  const identity = normalizeConversationIdentity({
    session_id: ' session-1 ',
    turn_id: '',
    message_id: 42,
    tool_call_id: 'tool-4',
    agent_id: 'agent-5',
    trace_id: 'trace-6',
    span_id: 'span-7',
    parent_span_id: 'parent-8',
    hook_event_id: 'hook-9',
    mcp_request_id: 'request-10'
  });

  assert.deepEqual(identity, {
    session_id: 'session-1',
    tool_call_id: 'tool-4',
    agent_id: 'agent-5',
    trace_id: 'trace-6',
    span_id: 'span-7',
    parent_span_id: 'parent-8',
    hook_event_id: 'hook-9',
    mcp_request_id: 'request-10'
  });
});

test('merge keeps non-conflicting identifiers and reports conflicting values', () => {
  const left: ConversationIdentity = {
    session_id: 'session-1',
    turn_id: 'turn-1',
    tool_call_id: 'tool-1'
  };
  const right: ConversationIdentity = {
    session_id: 'session-1',
    turn_id: 'turn-2',
    message_id: 'message-1'
  };

  const merged = mergeConversationIdentity(left, right);
  assert.deepEqual(merged.identity, {
    session_id: 'session-1',
    turn_id: 'turn-1',
    tool_call_id: 'tool-1',
    message_id: 'message-1'
  });
  assert.deepEqual(merged.conflicts, [{ field: 'turn_id', left: 'turn-1', right: 'turn-2' }]);
});

test('identity match keys prioritize exact conversation identifiers before weak session fallback', () => {
  assert.deepEqual(identityMatchKeys, [
    'message_id',
    'tool_call_id',
    'turn_id',
    'agent_id',
    'trace_span',
    'hook_event_id',
    'mcp_request_id',
    'session_id'
  ]);
});
