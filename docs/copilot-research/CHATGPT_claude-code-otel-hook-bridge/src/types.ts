export const HOOK_EVENTS = [
  'SessionStart',
  'Setup',
  'InstructionsLoaded',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'MessageDisplay',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'PermissionDenied',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'Stop',
  'StopFailure',
  'TeammateIdle',
  'ConfigChange',
  'CwdChanged',
  'FileChanged',
  'WorktreeCreate',
  'WorktreeRemove',
  'PreCompact',
  'PostCompact',
  'SessionEnd',
  'Elicitation',
  'ElicitationResult'
] as const;

export type HookEventName = (typeof HOOK_EVENTS)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface HookPayload extends JsonObject {
  hook_event_name: HookEventName;
  session_id: string;
}

export interface HookEnvelope {
  schema_version: '1.0.0';
  event_id: string;
  observed_at: string;
  observed_at_unix_ms: number;
  source: 'command-hook' | 'http-hook' | 'spool-replay';
  traceparent?: string;
  tracestate?: string;
  bridge_session_id?: string;
  payload: HookPayload;
}

export type ContentMode = 'off' | 'hash' | 'full';

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHookEventName(value: unknown): value is HookEventName {
  return typeof value === 'string' && (HOOK_EVENTS as readonly string[]).includes(value);
}

export function isHookPayload(value: unknown): value is HookPayload {
  if (!isJsonObject(value)) return false;
  return isHookEventName(value['hook_event_name']) && typeof value['session_id'] === 'string';
}

export function isHookEnvelope(value: unknown): value is HookEnvelope {
  if (!isJsonObject(value)) return false;
  return (
    value['schema_version'] === '1.0.0' &&
    typeof value['event_id'] === 'string' &&
    typeof value['observed_at'] === 'string' &&
    typeof value['observed_at_unix_ms'] === 'number' &&
    (value['source'] === 'command-hook' || value['source'] === 'http-hook' || value['source'] === 'spool-replay') &&
    isHookPayload(value['payload'])
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
