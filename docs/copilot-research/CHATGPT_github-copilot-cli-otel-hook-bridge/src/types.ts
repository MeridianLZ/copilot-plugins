export const COPILOT_HOOK_EVENTS = [
  'agentStop',
  'errorOccurred',
  'notification',
  'permissionRequest',
  'postToolUse',
  'postToolUseFailure',
  'preCompact',
  'preToolUse',
  'sessionEnd',
  'sessionStart',
  'subagentStart',
  'subagentStop',
  'userPromptSubmitted',
  'userPromptTransformed'
] as const;

export type CopilotHookEventName = (typeof COPILOT_HOOK_EVENTS)[number];
export type PayloadFormat = 'camelCase' | 'vscode-compatible';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ContentMode = 'off' | 'hash' | 'full';

export interface NormalizedHookPayload extends JsonObject {
  hook_event_name: CopilotHookEventName;
  session_id: string;
  payload_format: PayloadFormat;
  timestamp: string;
}

export interface HookEnvelope {
  schema_version: '1.0.0';
  event_id: string;
  observed_at: string;
  observed_at_unix_ms: number;
  source: 'command-hook' | 'http-hook' | 'spool-replay';
  traceparent?: string;
  tracestate?: string;
  payload: NormalizedHookPayload;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCopilotHookEventName(value: unknown): value is CopilotHookEventName {
  return typeof value === 'string' && (COPILOT_HOOK_EVENTS as readonly string[]).includes(value);
}

export function isNormalizedHookPayload(value: unknown): value is NormalizedHookPayload {
  if (!isJsonObject(value)) return false;
  return (
    isCopilotHookEventName(value['hook_event_name']) &&
    typeof value['session_id'] === 'string' &&
    (value['payload_format'] === 'camelCase' || value['payload_format'] === 'vscode-compatible') &&
    typeof value['timestamp'] === 'string'
  );
}

export function isHookEnvelope(value: unknown): value is HookEnvelope {
  if (!isJsonObject(value)) return false;
  return (
    value['schema_version'] === '1.0.0' &&
    typeof value['event_id'] === 'string' &&
    typeof value['observed_at'] === 'string' &&
    typeof value['observed_at_unix_ms'] === 'number' &&
    (value['source'] === 'command-hook' || value['source'] === 'http-hook' || value['source'] === 'spool-replay') &&
    isNormalizedHookPayload(value['payload'])
  );
}

export function getString(object: JsonObject, key: string): string | undefined {
  const value = object[key];
  return typeof value === 'string' ? value : undefined;
}

export function getNumber(object: JsonObject, key: string): number | undefined {
  const value = object[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function getBoolean(object: JsonObject, key: string): boolean | undefined {
  const value = object[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function getObject(object: JsonObject, key: string): JsonObject | undefined {
  const value = object[key];
  return isJsonObject(value) ? value : undefined;
}

export function getArray(object: JsonObject, key: string): JsonValue[] | undefined {
  const value = object[key];
  return Array.isArray(value) ? value : undefined;
}
