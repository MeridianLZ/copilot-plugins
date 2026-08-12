import { parseTraceparent } from './otel.js';
import { flattenAttributes } from './security.js';
import {
  getBoolean,
  getObject,
  getString,
  type CopilotHookEventName,
  type HookEnvelope,
  type JsonValue,
  type NormalizedHookPayload
} from './types.js';

export type HookAttributeValue = string | number | boolean | readonly (string | number | boolean | null | undefined)[];
export type HookAttributes = Record<string, HookAttributeValue>;

export interface HookSpanEvent {
  name: string;
  timestamp_unix_ms: number;
  attributes: Record<string, JsonValue>;
}

export interface HookSpanLink {
  trace_id: string;
  span_id: string;
  attributes: Record<string, JsonValue>;
}

export function hookSpanAttributes(envelope: HookEnvelope): HookAttributes {
  const payload = envelope.payload;
  const attributes: HookAttributes = {
    'github.copilot.hook.event.name': payload.hook_event_name,
    'github.copilot.hook.event.id': envelope.event_id,
    'github.copilot.hook.source': envelope.source,
    'github.copilot.hook.payload_format': payload.payload_format,
    'github.copilot.hook.schema_version': envelope.schema_version,
    'github.copilot.hook.observed_at_unix_ms': envelope.observed_at_unix_ms,
    'github.copilot.session.id': payload.session_id,
    'gen_ai.conversation.id': payload.session_id
  };

  const strings: readonly [string, string][] = [
    ['cwd', 'github.copilot.cwd'],
    ['source', 'github.copilot.session.source'],
    ['reason', 'github.copilot.session.end_reason'],
    ['tool_name', 'gen_ai.tool.name'],
    ['transcript_path', 'github.copilot.transcript.path'],
    ['stop_reason', 'github.copilot.stop.reason'],
    ['agent_id', 'gen_ai.agent.id'],
    ['agent_type', 'github.copilot.agent.type'],
    ['agent_name', 'gen_ai.agent.name'],
    ['agent_display_name', 'github.copilot.agent.display_name'],
    ['error_context', 'github.copilot.error.context'],
    ['trigger', 'github.copilot.compaction.trigger'],
    ['notification_type', 'github.copilot.notification.type'],
    ['error_type', 'error.type']
  ];
  for (const [input, output] of strings) {
    const value = getString(payload, input);
    if (value !== undefined) attributes[output] = value;
  }

  const booleans: readonly [string, string][] = [
    ['recoverable', 'github.copilot.error.recoverable'],
    ['stop_hook_active', 'github.copilot.stop_hook_active']
  ];
  for (const [input, output] of booleans) {
    const value = getBoolean(payload, input);
    if (value !== undefined) attributes[output] = value;
  }

  const toolResult = getObject(payload, 'tool_result');
  if (toolResult) {
    const resultType = getString(toolResult, 'resultType') ?? getString(toolResult, 'result_type');
    if (resultType) attributes['github.copilot.tool.result_type'] = resultType;
  }

  return {
    ...attributes,
    ...flattenAttributes(payload, 'github.copilot.hook.payload', 3, 96)
  };
}

export function hookLifecycleAttributes(
  envelope: HookEnvelope,
  kind: 'session' | 'turn' | 'tool' | 'subagent',
  correlationKey: string
): HookAttributes {
  return {
    ...hookSpanAttributes(envelope),
    'github.copilot.hook.lifecycle.kind': kind,
    'github.copilot.hook.lifecycle.correlation_key': correlationKey,
    'github.copilot.hook.lifecycle.start_event': envelope.payload.hook_event_name
  };
}

export function hookSpanEvents(envelope: HookEnvelope): HookSpanEvent[] {
  const event = envelope.payload.hook_event_name;
  if (event !== 'errorOccurred' && event !== 'postToolUseFailure') return [];
  const payload = envelope.payload;
  const error = getString(payload, 'error');
  const object = getObject(payload, 'error');
  const message = error ?? (object ? getString(object, 'message') : undefined);
  return [{
    name: 'exception',
    timestamp_unix_ms: envelope.observed_at_unix_ms,
    attributes: {
      'exception.type': getString(payload, 'error_type') ?? event,
      ...(message !== undefined ? { 'exception.message': message } : {})
    }
  }];
}

export function hookSpanLinks(envelope: HookEnvelope): HookSpanLink[] {
  const parsed = parseTraceparent(envelope.traceparent);
  if (!parsed) return [];
  return [{
    trace_id: parsed.traceId,
    span_id: parsed.spanId,
    attributes: { 'github.copilot.link.reason': 'native_traceparent' }
  }];
}

export function hookPointStatus(event: CopilotHookEventName): {
  status: 'ok' | 'error' | 'open';
  message?: string;
} {
  if (event === 'postToolUseFailure' || event === 'errorOccurred') {
    return { status: 'error', message: event };
  }
  if (event === 'postToolUse' || event === 'agentStop' || event === 'subagentStop' || event === 'sessionEnd') {
    return { status: 'ok' };
  }
  return { status: 'open' };
}

export function jsonAttributes(attributes: HookAttributes): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    } else {
      output[key] = [...value].filter(
        (entry): entry is string | number | boolean =>
          typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
      );
    }
  }
  return output;
}
