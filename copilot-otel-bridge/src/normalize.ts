import {
  isCopilotHookEventName,
  isJsonObject,
  type CopilotHookEventName,
  type JsonObject,
  type JsonValue,
  type NormalizedHookPayload,
  type PayloadFormat
} from './types.js';

const PASCAL_TO_CANONICAL: Readonly<Record<string, CopilotHookEventName>> = {
  AgentStop: 'agentStop',
  Stop: 'agentStop',
  ErrorOccurred: 'errorOccurred',
  Notification: 'notification',
  PermissionRequest: 'permissionRequest',
  PostToolUse: 'postToolUse',
  PostToolUseFailure: 'postToolUseFailure',
  PreCompact: 'preCompact',
  PreToolUse: 'preToolUse',
  SessionEnd: 'sessionEnd',
  SessionStart: 'sessionStart',
  SubagentStart: 'subagentStart',
  SubagentStop: 'subagentStop',
  UserPromptSubmit: 'userPromptSubmitted',
  UserPromptSubmitted: 'userPromptSubmitted',
  UserPromptTransformed: 'userPromptTransformed'
};

const CAMEL_TO_SNAKE: Readonly<Record<string, string>> = {
  sessionId: 'session_id',
  initialPrompt: 'initial_prompt',
  transformedPrompt: 'transformed_prompt',
  toolName: 'tool_name',
  toolArgs: 'tool_input',
  toolResult: 'tool_result',
  transcriptPath: 'transcript_path',
  stopReason: 'stop_reason',
  agentId: 'agent_id',
  agentType: 'agent_type',
  agentName: 'agent_name',
  agentDisplayName: 'agent_display_name',
  agentDescription: 'agent_description',
  errorContext: 'error_context',
  customInstructions: 'custom_instructions',
  notificationType: 'notification_type'
};

function normalizeTimestamp(value: JsonValue | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function normalizeEvent(raw: JsonObject, configuredEvent?: string): CopilotHookEventName {
  const candidate = configuredEvent ??
    (typeof raw['hook_event_name'] === 'string' ? raw['hook_event_name'] : undefined);
  if (candidate && isCopilotHookEventName(candidate)) return candidate;
  if (candidate && PASCAL_TO_CANONICAL[candidate]) return PASCAL_TO_CANONICAL[candidate];
  throw new Error(`Unable to determine Copilot hook event from ${String(candidate)}`);
}

function normalizeToolInput(value: JsonValue | undefined): JsonValue | undefined {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return value;
  }
}

export function normalizeHookPayload(rawValue: unknown, configuredEvent?: string): NormalizedHookPayload {
  if (!isJsonObject(rawValue)) throw new Error('Copilot hook payload must be a JSON object');
  const raw: JsonObject = rawValue;
  const event = normalizeEvent(raw, configuredEvent);
  const format: PayloadFormat = typeof raw['hook_event_name'] === 'string'
    ? 'vscode-compatible'
    : 'camelCase';

  const sessionId = typeof raw['session_id'] === 'string'
    ? raw['session_id']
    : typeof raw['sessionId'] === 'string'
      ? raw['sessionId']
      : undefined;
  if (!sessionId) throw new Error('Copilot hook payload is missing sessionId/session_id');

  const normalized: JsonObject = {
    hook_event_name: event,
    session_id: sessionId,
    payload_format: format,
    timestamp: normalizeTimestamp(raw['timestamp'])
  };

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'hook_event_name' || key === 'sessionId' || key === 'session_id' || key === 'timestamp') continue;
    const target = CAMEL_TO_SNAKE[key] ?? key;
    normalized[target] = target === 'tool_input' ? (normalizeToolInput(value) ?? null) : value;
  }

  if (event === 'subagentStop' && normalized['response'] !== undefined && normalized['last_assistant_message'] === undefined) {
    normalized['last_assistant_message'] = normalized['response'] ?? null;
  }

  if (event === 'errorOccurred' && isJsonObject(normalized['error'])) {
    const error = normalized['error'];
    if (typeof error['name'] === 'string') normalized['error_type'] = error['name'];
  }

  return normalized as NormalizedHookPayload;
}
