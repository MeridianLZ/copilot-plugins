import { getString, type CopilotHookEventName, type JsonValue, type NormalizedHookPayload } from './types.js';

/**
 * Single source of truth for the three-tier span/attribute taxonomy.
 * Every span name and payload→attribute mapping the bridge emits (SpanAssembler),
 * projects (trace-projector), or renders (conversation-projector / UI) is defined
 * here, and docs/SPAN_SSOT.md's catalog block is generated from it
 * (renderCatalogMarkdown, guarded by test/span-taxonomy.test.ts).
 *
 * Precedence (enforced, highest first):
 *   1 — OTel GenAI semconv (gen_ai.*, error.*): chat / invoke_agent / execute_tool / execute_hook
 *   2 — native Copilot, non-duped (github.copilot.* minus hook.*, native events.jsonl signals);
 *       a tier-2 attr that dupes a tier-1 attr survives only when it carries MORE info (noted)
 *   3 — custom hook spans (github.copilot.hook.*), residual
 */

export type SpanTier = 1 | 2 | 3;
export type LifecycleKind = 'session' | 'turn' | 'tool' | 'subagent';

export function lifecycleSpanName(kind: LifecycleKind, target?: string): string {
  switch (kind) {
    case 'tool':
      return `execute_tool ${target ?? 'unknown'}`;
    case 'subagent':
      return `invoke_agent ${target ?? 'unknown'}`;
    case 'session':
      return 'github.copilot.hook.session';
    case 'turn':
      // 'chat' would dupe the native lane's chat spans — stays tier 3.
      return 'github.copilot.hook.turn';
  }
}

export function pointSpanName(event: CopilotHookEventName): string {
  return `execute_hook ${event}`;
}

export function spanTier(kind: LifecycleKind | 'point'): SpanTier {
  if (kind === 'tool' || kind === 'subagent' || kind === 'point') return 1;
  return 3;
}

/**
 * Taxonomy name for a native events.jsonl signal, so replica nodes always carry
 * a span name. Names are NOMINAL for the native lane: the bridge reports which
 * span owns the signal in the taxonomy, not a span it observed being exported.
 */
export function nativeNodeSpan(
  type: string,
  ctx: { model?: string | undefined; tool?: string | undefined; agent?: string | undefined } = {}
): { name: string; tier: SpanTier } {
  switch (type) {
    case 'user.message':
    case 'assistant.message':
      return { name: `chat ${ctx.model ?? 'unknown'}`, tier: 2 };
    case 'tool.execution_start':
      return { name: `execute_tool ${ctx.tool ?? 'unknown'}`, tier: 1 };
    case 'subagent.started':
      return { name: `invoke_agent ${ctx.agent ?? 'unknown'}`, tier: 1 };
    case 'permission.requested':
      return { name: pointSpanName('permissionRequest'), tier: 1 };
    case 'turn':
      return { name: lifecycleSpanName('turn'), tier: 3 };
    case 'session':
      return { name: lifecycleSpanName('session'), tier: 3 };
    default:
      // Native-only signal with no span in any lane (e.g. session.model_change).
      return { name: `native:${type}`, tier: 2 };
  }
}

export interface AttributeMapping {
  payloadKey: string;
  attribute: string;
  valueType: 'string' | 'boolean';
  tier: SpanTier;
  dupeOf?: string;
  note?: string;
  /** Present in the catalog for the dupe record, never emitted. */
  dropped?: boolean;
}

export const ATTRIBUTE_MAP: readonly AttributeMapping[] = [
  // Tier 1 — GenAI semconv
  { payloadKey: 'session_id', attribute: 'gen_ai.conversation.id', valueType: 'string', tier: 1 },
  { payloadKey: 'tool_name', attribute: 'gen_ai.tool.name', valueType: 'string', tier: 1 },
  { payloadKey: 'agent_id', attribute: 'gen_ai.agent.id', valueType: 'string', tier: 1 },
  { payloadKey: 'agent_name', attribute: 'gen_ai.agent.name', valueType: 'string', tier: 1 },
  { payloadKey: 'error_type', attribute: 'error.type', valueType: 'string', tier: 1 },
  // Tier 2 — native Copilot, non-duped (or richer than the tier-1 dupe)
  {
    payloadKey: 'session_id',
    attribute: 'github.copilot.session.id',
    valueType: 'string',
    tier: 2,
    dupeOf: 'gen_ai.conversation.id',
    dropped: true,
    note: 'equal-info dupe — precedence drops it; re-key queries on gen_ai.conversation.id'
  },
  {
    payloadKey: 'agent_type',
    attribute: 'github.copilot.agent.type',
    valueType: 'string',
    tier: 2,
    note: 'Copilot agent classification (builtin/custom/plugin) — no gen_ai equivalent'
  },
  {
    payloadKey: 'agent_display_name',
    attribute: 'github.copilot.agent.display_name',
    valueType: 'string',
    tier: 2,
    dupeOf: 'gen_ai.agent.name',
    note: 'kept: human display variant carries more info than the slug in gen_ai.agent.name'
  },
  { payloadKey: 'cwd', attribute: 'github.copilot.cwd', valueType: 'string', tier: 2 },
  { payloadKey: 'source', attribute: 'github.copilot.session.source', valueType: 'string', tier: 2 },
  { payloadKey: 'reason', attribute: 'github.copilot.session.end_reason', valueType: 'string', tier: 2 },
  { payloadKey: 'transcript_path', attribute: 'github.copilot.transcript.path', valueType: 'string', tier: 2 },
  { payloadKey: 'stop_reason', attribute: 'github.copilot.stop.reason', valueType: 'string', tier: 2 },
  { payloadKey: 'error_context', attribute: 'github.copilot.error.context', valueType: 'string', tier: 2 },
  { payloadKey: 'trigger', attribute: 'github.copilot.compaction.trigger', valueType: 'string', tier: 2 },
  { payloadKey: 'notification_type', attribute: 'github.copilot.notification.type', valueType: 'string', tier: 2 },
  { payloadKey: 'recoverable', attribute: 'github.copilot.error.recoverable', valueType: 'boolean', tier: 2 },
  { payloadKey: 'stop_hook_active', attribute: 'github.copilot.stop_hook_active', valueType: 'boolean', tier: 2 }
] as const;

export interface ContentMapping {
  /** First present payload key wins (snake_case then camelCase spellings). */
  payloadKeys: readonly string[];
  attribute: string;
  /** Wrap the value as a semconv chat-message array with this role. */
  role?: 'user' | 'assistant';
}

/** Tier-1 opt-in content attributes — emitted ONLY when contentMode === 'full'
 * (payload values are already redacted/truncated at ingest in that mode). */
export const CONTENT_ATTRIBUTES: readonly ContentMapping[] = [
  { payloadKeys: ['prompt', 'initial_prompt', 'initialPrompt'], attribute: 'gen_ai.input.messages', role: 'user' },
  {
    payloadKeys: ['response', 'last_assistant_message', 'lastAssistantMessage'],
    attribute: 'gen_ai.output.messages',
    role: 'assistant'
  },
  { payloadKeys: ['custom_instructions', 'additional_context', 'additionalContext'], attribute: 'gen_ai.system_instructions' },
  { payloadKeys: ['tool_input', 'tool_args', 'toolArgs'], attribute: 'gen_ai.tool.call.arguments' },
  { payloadKeys: ['tool_result', 'toolResult'], attribute: 'gen_ai.tool.call.result' }
] as const;

function serialize(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function contentAttributes(payload: NormalizedHookPayload): Record<string, string> {
  const output: Record<string, string> = {};
  for (const mapping of CONTENT_ATTRIBUTES) {
    for (const key of mapping.payloadKeys) {
      const value = payload[key];
      if (value === undefined || value === null) continue;
      // Skip hashed/off placeholders — content attrs are full-mode only.
      if (typeof value === 'object' && !Array.isArray(value) && (value as { redacted?: unknown })['redacted'] === true) break;
      output[mapping.attribute] = mapping.role
        ? JSON.stringify([{ role: mapping.role, parts: [{ type: 'text', content: serialize(value) }] }])
        : serialize(value);
      break;
    }
  }
  return output;
}

interface CatalogSpan {
  name: string;
  tier: SpanTier;
  operation: string;
  source: string;
  note: string;
}

const SPAN_CATALOG: readonly CatalogSpan[] = [
  {
    name: 'chat {model}',
    tier: 2,
    operation: 'chat',
    source: 'native OTel lane; replica nodes from events.jsonl user.message/assistant.message (nominal)',
    note: 'native lane owns the real span (tokens, finish_reasons); bridge never re-emits it'
  },
  {
    name: 'invoke_agent {agent}',
    tier: 1,
    operation: 'invoke_agent',
    source: 'hook lifecycle subagentStart→subagentStop; native subagent.started/completed (nominal)',
    note: 'gen_ai.agent.name/id + kept tier-2 display_name/type'
  },
  {
    name: 'execute_tool {tool}',
    tier: 1,
    operation: 'execute_tool',
    source: 'hook lifecycle preToolUse→postToolUse|postToolUseFailure; native tool.execution_start/complete (nominal)',
    note: 'gen_ai.tool.name, gen_ai.tool.type=function; native lane adds gen_ai.tool.call.id (hook lane cannot)'
  },
  {
    name: 'execute_hook {event}',
    tier: 1,
    operation: 'execute_hook',
    source: 'one point span per hook event (14 events)',
    note: 'spec-directed extension: execute_hook not yet a registered semconv operation; payload flattened under github.copilot.hook.payload.*'
  },
  {
    name: 'github.copilot.hook.session',
    tier: 3,
    operation: '—',
    source: 'hook lifecycle sessionStart→sessionEnd',
    note: 'conversation identity lives in gen_ai.conversation.id, not the span name'
  },
  {
    name: 'github.copilot.hook.turn',
    tier: 3,
    operation: '—',
    source: 'hook lifecycle userPromptSubmitted→agentStop',
    note: "'chat' name would dupe the native lane — stays tier 3"
  },
  {
    name: 'native:{event.type}',
    tier: 2,
    operation: '—',
    source: 'native events.jsonl signal with no span in any lane (e.g. session.model_change, session.usage_checkpoint)',
    note: 'replica-node provenance label only; never exported as a span'
  }
] as const;

export function renderCatalogMarkdown(): string {
  const lines: string[] = [];
  lines.push('| Span name | Tier | gen_ai.operation.name | Source | Note |');
  lines.push('|---|---|---|---|---|');
  for (const span of SPAN_CATALOG) {
    lines.push(`| \`${span.name}\` | ${span.tier} | ${span.operation === '—' ? '—' : `\`${span.operation}\``} | ${span.source} | ${span.note} |`);
  }
  lines.push('');
  lines.push('| Payload key | Attribute | Tier | Dupe of | Emitted | Note |');
  lines.push('|---|---|---|---|---|---|');
  for (const row of ATTRIBUTE_MAP) {
    lines.push(
      `| \`${row.payloadKey}\` | \`${row.attribute}\` | ${row.tier} | ${row.dupeOf ? `\`${row.dupeOf}\`` : '—'} | ${row.dropped ? 'no (dropped)' : 'yes'} | ${row.note ?? '—'} |`
    );
  }
  lines.push('');
  lines.push('| Payload key(s) | Content attribute (opt-in, contentMode=full only) | Shape |');
  lines.push('|---|---|---|');
  for (const row of CONTENT_ATTRIBUTES) {
    lines.push(
      `| ${row.payloadKeys.map((key) => `\`${key}\``).join(' / ')} | \`${row.attribute}\` | ${row.role ? `semconv message array, role \`${row.role}\`` : 'serialized value'} |`
    );
  }
  return lines.join('\n');
}

/** Emittable payload→attribute rows (precedence applied: dropped dupes excluded). */
export function emittedAttributeRows(): readonly AttributeMapping[] {
  return ATTRIBUTE_MAP.filter((row) => row.dropped !== true);
}

export function payloadAttributes(payload: NormalizedHookPayload): Record<string, string | boolean> {
  const output: Record<string, string | boolean> = {};
  for (const row of emittedAttributeRows()) {
    if (row.valueType === 'string') {
      const value = getString(payload, row.payloadKey);
      if (value !== undefined) output[row.attribute] = value;
    } else {
      const value = payload[row.payloadKey];
      if (typeof value === 'boolean') output[row.attribute] = value;
    }
  }
  return output;
}
