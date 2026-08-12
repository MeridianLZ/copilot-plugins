import { redactSecrets, truncateUtf8 } from './security.js';

export interface ConversationIdentity {
  session_id?: string;
  turn_id?: string;
  message_id?: string;
  tool_call_id?: string;
  agent_id?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  hook_event_id?: string;
  mcp_request_id?: string;
}

export type IdentityMatch =
  | 'message_id'
  | 'tool_call_id'
  | 'turn_id'
  | 'agent_id'
  | 'trace_span'
  | 'hook_event_id'
  | 'mcp_request_id'
  | 'session_id';

export interface IdentityConflict {
  field: keyof ConversationIdentity;
  left: string;
  right: string;
}

export interface MergedConversationIdentity {
  identity: ConversationIdentity;
  conflicts: IdentityConflict[];
}

export const identityMatchKeys: readonly IdentityMatch[] = [
  'message_id',
  'tool_call_id',
  'turn_id',
  'agent_id',
  'trace_span',
  'hook_event_id',
  'mcp_request_id',
  'session_id'
];

const ALIASES: Readonly<Record<keyof ConversationIdentity, readonly string[]>> = {
  session_id: ['session_id', 'sessionId', 'session.id', 'copilot.session.id', 'github.copilot.session.id'],
  turn_id: ['turn_id', 'turnId', 'turn.id', 'copilot.turn.id', 'copilot.turn_id'],
  message_id: ['message_id', 'messageId', 'message.id', 'gen_ai.message.id'],
  tool_call_id: ['tool_call_id', 'toolCallId', 'tool.call.id', 'gen_ai.tool.call.id', 'copilot.tool.call.id'],
  agent_id: ['agent_id', 'agentId', 'agent.id', 'gen_ai.agent.id'],
  trace_id: ['trace_id', 'traceId', 'trace.id'],
  span_id: ['span_id', 'spanId', 'span.id'],
  parent_span_id: ['parent_span_id', 'parentSpanId', 'parent.span.id'],
  hook_event_id: ['hook_event_id', 'event_id', 'eventId', 'hookEventId'],
  mcp_request_id: ['mcp_request_id', 'request_id', 'requestId', 'mcpRequestId', 'peer_request_id']
};

function cleanIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = truncateUtf8(redactSecrets(value), 256)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export function normalizeConversationIdentity(input: Record<string, unknown>): ConversationIdentity {
  const output: ConversationIdentity = {};
  for (const field of Object.keys(ALIASES) as (keyof ConversationIdentity)[]) {
    for (const alias of ALIASES[field]) {
      const value = cleanIdentifier(input[alias]);
      if (value !== undefined) {
        output[field] = value;
        break;
      }
    }
  }
  return output;
}

export function mergeConversationIdentity(
  left: ConversationIdentity,
  right: ConversationIdentity
): MergedConversationIdentity {
  const identity: ConversationIdentity = { ...left };
  const conflicts: IdentityConflict[] = [];
  for (const field of Object.keys(ALIASES) as (keyof ConversationIdentity)[]) {
    const leftValue = identity[field];
    const rightValue = cleanIdentifier(right[field]);
    if (leftValue !== undefined && rightValue !== undefined && leftValue !== rightValue) {
      conflicts.push({ field, left: leftValue, right: rightValue });
      continue;
    }
    if (leftValue === undefined && rightValue !== undefined) identity[field] = rightValue;
  }
  return { identity, conflicts };
}

export function hasTraceSpanIdentity(identity: ConversationIdentity): boolean {
  return identity.trace_id !== undefined && identity.span_id !== undefined;
}
