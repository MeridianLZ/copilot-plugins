import {
  eventTimeMs,
  projectSessionTrace,
  type ProjectedSpan,
  type ProjectedStatus,
  type SessionTrace
} from './trace-projector.js';
import { projectNativeConversation, type NativeEvent } from './native-session.js';
import type { CoverageDisposition, CoverageEntry } from './correlation.js';
import { redactSecrets, truncateUtf8 } from './security.js';
import {
  getString,
  type CopilotHookEventName,
  type HookEnvelope,
  type JsonValue
} from './types.js';

/**
 * Deterministic, chronological conversation tree for UI + export.
 * Nesting mirrors lifecycle containment (session → turn → tool|subagent)
 * while preserving every hook event verbatim under its nearest open scope.
 */

export type ConversationNodeKind =
  | 'session'
  | 'turn'
  | 'tool'
  | 'subagent'
  | 'event'
  | 'governance';

export interface ConversationContent {
  role: 'user' | 'agent' | 'system' | 'tool' | 'meta';
  label: string;
  text?: string;
  json?: JsonValue;
  redacted?: { sha256?: string; bytes?: number };
}

export interface ConversationNode {
  id: string;
  kind: ConversationNodeKind;
  event_name?: CopilotHookEventName;
  event_id?: string;
  timestamp_ms: number;
  timestamp_iso: string;
  status?: ProjectedStatus;
  status_message?: string;
  title: string;
  depth: number;
  duration_ms?: number;
  heuristic?: boolean;
  tool_name?: string;
  agent_name?: string;
  content: ConversationContent[];
  children: ConversationNode[];
  raw_payload?: Record<string, JsonValue>;
  /** Model that produced this node (native lane only). */
  model?: string;
  /** Reasoning existed but is provider-encrypted; render a marker only. */
  reasoning_encrypted?: boolean;
  /** Subagent cross-link: the child's own hook-lane session_id. */
  child_session_id?: string;
}

export interface ConversationDocument {
  schema_version: '1.1.0';
  source: 'native+hooks' | 'hooks-only';
  model?: string;
  usage?: { total_nano_aiu?: number; total_premium_requests?: number; output_tokens?: number };
  session_id: string;
  generated_at: string;
  status: ProjectedStatus;
  end_reason?: string;
  cwd?: string;
  started_at_ms: number;
  ended_at_ms?: number;
  event_count: number;
  turn_count: number;
  tool_count: number;
  subagent_count: number;
  error_count: number;
  root: ConversationNode;
  events: HookEnvelope[];
  spans: ProjectedSpan[];
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function asText(value: JsonValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function asRedacted(value: JsonValue | undefined): ConversationContent['redacted'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (value['redacted'] !== true) return undefined;
  return {
    ...(typeof value['sha256'] === 'string' ? { sha256: value['sha256'] } : {}),
    ...(typeof value['bytes'] === 'number' ? { bytes: value['bytes'] } : {})
  };
}

function contentFromValue(
  role: ConversationContent['role'],
  label: string,
  value: JsonValue | undefined
): ConversationContent | undefined {
  if (value === undefined) return undefined;
  const redacted = asRedacted(value);
  if (redacted) return { role, label, redacted };
  const text = asText(value);
  if (text !== undefined) return { role, label, text };
  return { role, label, json: value };
}

function pushContent(node: ConversationNode, item: ConversationContent | undefined): void {
  if (item) node.content.push(item);
}

function payloadObject(envelope: HookEnvelope): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(envelope.payload)) {
    if (key === 'hook_event_name' || key === 'session_id' || key === 'payload_format' || key === 'timestamp') {
      continue;
    }
    out[key] = value as JsonValue;
  }
  return out;
}

function makeEventNode(envelope: HookEnvelope, depth: number, status?: ProjectedStatus): ConversationNode {
  const payload = envelope.payload;
  const event = payload.hook_event_name;
  const timeMs = eventTimeMs(envelope);
  const toolName = getString(payload, 'tool_name');
  const agentName = getString(payload, 'agent_name');
  const node: ConversationNode = {
    id: `event:${envelope.event_id}`,
    kind: 'event',
    event_name: event,
    event_id: envelope.event_id,
    timestamp_ms: timeMs,
    timestamp_iso: iso(timeMs),
    title: event,
    depth,
    ...(status ? { status } : {}),
    ...(toolName ? { tool_name: toolName } : {}),
    ...(agentName ? { agent_name: agentName } : {}),
    content: [],
    children: [],
    raw_payload: payloadObject(envelope)
  };

  switch (event) {
    case 'sessionStart':
      node.title = 'Session started';
      pushContent(node, contentFromValue('system', 'source', payload['source']));
      pushContent(node, contentFromValue('user', 'initial_prompt', payload['initial_prompt'] ?? payload['initialPrompt']));
      break;
    case 'sessionEnd':
      node.title = 'Session ended';
      node.status = status ?? (getString(payload, 'reason') === 'complete' || getString(payload, 'reason') === 'user_exit' ? 'ok' : 'error');
      pushContent(node, contentFromValue('system', 'reason', payload['reason']));
      break;
    case 'userPromptSubmitted':
      node.title = 'User prompt';
      pushContent(node, contentFromValue('user', 'prompt', payload['prompt'] ?? payload['initial_prompt']));
      break;
    case 'userPromptTransformed':
      node.title = 'Prompt transformed';
      pushContent(node, contentFromValue('meta', 'prompt', payload['prompt']));
      pushContent(node, contentFromValue('meta', 'transformed_prompt', payload['transformed_prompt'] ?? payload['transformedPrompt']));
      break;
    case 'preToolUse':
      node.title = `Tool ${toolName ?? 'unknown'}`;
      pushContent(node, contentFromValue('tool', 'input', payload['tool_input'] ?? payload['tool_args'] ?? payload['toolArgs']));
      break;
    case 'permissionRequest':
      node.title = `Permission · ${toolName ?? 'tool'}`;
      pushContent(node, contentFromValue('tool', 'input', payload['tool_input'] ?? payload['tool_args'] ?? payload['toolArgs']));
      break;
    case 'postToolUse':
      node.title = `Result · ${toolName ?? 'tool'}`;
      node.status = 'ok';
      pushContent(node, contentFromValue('tool', 'result', payload['tool_result'] ?? payload['toolResult']));
      break;
    case 'postToolUseFailure':
      node.title = `Failure · ${toolName ?? 'tool'}`;
      node.status = 'error';
      pushContent(node, contentFromValue('tool', 'error', payload['error']));
      break;
    case 'subagentStart':
      node.title = `Subagent ${agentName ?? 'unknown'} started`;
      pushContent(node, contentFromValue('agent', 'agent_type', payload['agent_type'] ?? payload['agentType']));
      pushContent(node, contentFromValue('agent', 'display_name', payload['agent_display_name'] ?? payload['agentDisplayName']));
      break;
    case 'subagentStop':
      node.title = `Subagent ${agentName ?? 'unknown'} finished`;
      node.status = 'ok';
      pushContent(node, contentFromValue('agent', 'agent_id', payload['agent_id'] ?? payload['agentId']));
      pushContent(node, contentFromValue('agent', 'response', payload['response'] ?? payload['last_assistant_message']));
      break;
    case 'agentStop':
      node.title = 'Turn complete';
      node.status = 'ok';
      pushContent(node, contentFromValue('agent', 'stop_reason', payload['stop_reason'] ?? payload['stopReason']));
      break;
    case 'preCompact':
      node.title = 'Context compaction';
      pushContent(node, contentFromValue('system', 'trigger', payload['trigger']));
      break;
    case 'notification':
      node.title = 'Notification';
      pushContent(node, contentFromValue('system', 'type', payload['notification_type'] ?? payload['notificationType']));
      pushContent(node, contentFromValue('system', 'message', payload['message']));
      break;
    case 'errorOccurred':
      node.title = 'Error';
      node.status = 'error';
      pushContent(node, contentFromValue('system', 'error_type', payload['error_type'] ?? payload['errorType']));
      pushContent(node, contentFromValue('system', 'error', payload['error']));
      pushContent(node, contentFromValue('system', 'recoverable', payload['recoverable']));
      break;
    default:
      break;
  }

  return node;
}

function lifecycleShell(
  kind: 'session' | 'turn' | 'tool' | 'subagent',
  span: ProjectedSpan | undefined,
  envelope: HookEnvelope,
  depth: number
): ConversationNode {
  const timeMs = eventTimeMs(envelope);
  const toolName = span?.tool_name ?? getString(envelope.payload, 'tool_name');
  const agentName = span?.agent_name ?? getString(envelope.payload, 'agent_name');
  const title =
    kind === 'session'
      ? 'Session'
      : kind === 'turn'
        ? 'Turn'
        : kind === 'tool'
          ? `Tool ${toolName ?? 'unknown'}`
          : `Subagent ${agentName ?? 'unknown'}`;
  return {
    id: span?.span_id ?? `${kind}:${envelope.event_id}`,
    kind,
    event_name: envelope.payload.hook_event_name,
    event_id: envelope.event_id,
    timestamp_ms: span?.start_unix_ms ?? timeMs,
    timestamp_iso: iso(span?.start_unix_ms ?? timeMs),
    status: span?.status ?? 'open',
    ...(span?.status_message ? { status_message: span.status_message } : {}),
    title,
    depth,
    ...(span?.end_unix_ms != null ? { duration_ms: span.end_unix_ms - span.start_unix_ms } : {}),
    ...(span?.heuristic ? { heuristic: true } : {}),
    ...(toolName ? { tool_name: toolName } : {}),
    ...(agentName ? { agent_name: agentName } : {}),
    content: [],
    children: []
  };
}

const GAP_DISPOSITIONS = new Set<CoverageDisposition>([
  'unmatched',
  'invalid',
  'unavailable',
  'late_out_of_order'
]);

function sanitizeCoverageText(value: string, maxBytes = 256): string {
  const redacted = truncateUtf8(redactSecrets(value), maxBytes);
  return redacted.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function coverageGapNode(entry: CoverageEntry, depth: number, ordinal: number): ConversationNode {
  const sourceKind = sanitizeCoverageText(entry.source_kind);
  const sourceId = sanitizeCoverageText(entry.source_id);
  const disposition = sanitizeCoverageText(entry.disposition);
  const reason = sanitizeCoverageText(entry.reason);
  const timeMs = Number.isFinite(entry.timestamp_ms) ? entry.timestamp_ms : Date.now();
  const node: ConversationNode = {
    id: `coverage-gap:${sourceKind}:${sourceId}:${ordinal}`,
    kind: 'event',
    timestamp_ms: timeMs,
    timestamp_iso: iso(timeMs),
    title: `Coverage gap · ${disposition}`,
    depth,
    status: 'error',
    content: [
      { role: 'meta', label: 'source_kind', text: sourceKind },
      { role: 'meta', label: 'source_id', text: sourceId },
      { role: 'meta', label: 'disposition', text: disposition },
      { role: 'meta', label: 'reason', text: reason }
    ],
    children: []
  };
  if (entry.canonical_id !== undefined) {
    node.content.push({ role: 'meta', label: 'canonical_id', text: sanitizeCoverageText(entry.canonical_id) });
  }
  if (entry.matched_by !== undefined) {
    node.content.push({ role: 'meta', label: 'matched_by', text: sanitizeCoverageText(entry.matched_by) });
  }
  if (entry.related_ids.length > 0) {
    node.content.push({
      role: 'meta',
      label: 'related_ids',
      json: entry.related_ids.map((value) => sanitizeCoverageText(value))
    });
  }
  return node;
}

function attachCoverageGapNodes(root: ConversationNode, entries: readonly CoverageEntry[]): void {
  const gaps = entries.filter((entry) => GAP_DISPOSITIONS.has(entry.disposition));
  if (gaps.length === 0) return;
  const depth = root.depth + 1;
  for (let index = 0; index < gaps.length; index++) {
    root.children.push(coverageGapNode(gaps[index]!, depth, index + 1));
  }
  root.children.sort((left, right) => left.timestamp_ms - right.timestamp_ms);
}

/** Hook events that always render as errors regardless of overlay grouping. */
const ERROR_OVERLAY_EVENTS = new Set<CopilotHookEventName>(['errorOccurred', 'postToolUseFailure']);

/**
 * Every hook event is overlaid onto the native-first tree — none are
 * dropped. To avoid swamping the readable transcript, each event nests under
 * one expandable "Governance events" group per host (turn or session root)
 * instead of appearing as a top-level sibling of user/assistant bubbles.
 * Every individual event remains independently selectable and stays in
 * chronological order within its group.
 */
function governanceGroupFor(host: ConversationNode, groups: Map<string, ConversationNode>): ConversationNode {
  const existing = groups.get(host.id);
  if (existing) return existing;
  const group: ConversationNode = {
    id: `governance:${host.id}`,
    kind: 'governance',
    timestamp_ms: host.timestamp_ms,
    timestamp_iso: iso(host.timestamp_ms),
    title: 'Governance events',
    depth: host.depth + 1,
    content: [],
    children: []
  };
  groups.set(host.id, group);
  host.children.push(group);
  return group;
}

function projectNativeFirst(
  trace: SessionTrace,
  sessionId: string,
  nativeEvents: readonly NativeEvent[],
  coverageEntries: readonly CoverageEntry[]
): ConversationDocument {
  const events = trace.events;
  const spans = trace.spans;
  const native = projectNativeConversation(nativeEvents, sessionId);
  const root = native.root;

  // Governance overlay: attach every hook event to the turn active at its
  // timestamp (native turns are root children), else to the session root.
  // All 14 hook event types are represented — none are hidden — grouped
  // under one governance node per host so the readable transcript stays
  // uncluttered while remaining fully inspectable.
  const turns = root.children.filter((child) => child.kind === 'turn');
  const governanceGroups = new Map<string, ConversationNode>();
  for (const envelope of events) {
    const name = envelope.payload.hook_event_name;
    const timeMs = eventTimeMs(envelope);
    const host =
      turns.find(
        (turn) => timeMs >= turn.timestamp_ms && timeMs <= turn.timestamp_ms + (turn.duration_ms ?? Number.MAX_SAFE_INTEGER)
      ) ?? root;
    const group = governanceGroupFor(host, governanceGroups);
    group.children.push(makeEventNode(envelope, group.depth + 1, ERROR_OVERLAY_EVENTS.has(name) ? 'error' : undefined));
  }
  for (const group of governanceGroups.values()) {
    group.children.sort((left, right) => left.timestamp_ms - right.timestamp_ms);
    group.timestamp_ms = group.children[0]?.timestamp_ms ?? group.timestamp_ms;
    group.timestamp_iso = iso(group.timestamp_ms);
    group.title = `Governance events (${group.children.length})`;
  }
  for (const turn of turns) turn.children.sort((left, right) => left.timestamp_ms - right.timestamp_ms);

  const cwd = events.map((e) => getString(e.payload, 'cwd')).find((value) => value !== undefined);
  const sessionSpan = spans.find((span) => span.kind === 'session');
  const hookErrorCount = events.filter(
    (e) => e.payload.hook_event_name === 'errorOccurred'
  ).length;
  attachCoverageGapNodes(root, coverageEntries);

  return {
    schema_version: '1.1.0',
    source: 'native+hooks',
    ...(native.model !== undefined ? { model: native.model } : {}),
    ...(native.usage !== undefined ? { usage: native.usage } : {}),
    session_id: sessionId,
    generated_at: new Date().toISOString(),
    status: root.status ?? sessionSpan?.status ?? 'open',
    ...(cwd ? { cwd } : {}),
    started_at_ms: native.started_at_ms ?? sessionSpan?.start_unix_ms ?? root.timestamp_ms,
    ...(root.status === 'ok' && native.last_event_at_ms !== undefined ? { ended_at_ms: native.last_event_at_ms } : {}),
    event_count: nativeEvents.length,
    turn_count: native.turn_count,
    tool_count: native.tool_count,
    subagent_count: native.subagent_count,
    error_count: native.error_count + hookErrorCount,
    root,
    events,
    spans
  };
}

export function projectConversation(
  envelopes: readonly HookEnvelope[],
  sessionId: string,
  nativeEvents: readonly NativeEvent[] = [],
  coverageEntries: readonly CoverageEntry[] = []
): ConversationDocument {
  const trace: SessionTrace = projectSessionTrace(envelopes, sessionId);
  if (nativeEvents.length > 0) return projectNativeFirst(trace, sessionId, nativeEvents, coverageEntries);
  const events = trace.events;
  const spans = trace.spans;
  const spanByStart = new Map(spans.filter((s) => s.kind !== 'point').map((s) => [s.start_event_id, s]));

  const root: ConversationNode = {
    id: `session-root:${sessionId}`,
    kind: 'session',
    timestamp_ms: events[0] ? eventTimeMs(events[0]) : Date.now(),
    timestamp_iso: iso(events[0] ? eventTimeMs(events[0]) : Date.now()),
    status: 'open',
    title: 'Session',
    depth: 0,
    content: [],
    children: []
  };

  let sessionNode: ConversationNode | undefined;
  let turnNode: ConversationNode | undefined;
  const toolStack: ConversationNode[] = [];
  const subagentStack: ConversationNode[] = [];

  const activeParent = (): ConversationNode => {
    if (toolStack.length > 0) return toolStack[toolStack.length - 1]!;
    if (subagentStack.length > 0) return subagentStack[subagentStack.length - 1]!;
    if (turnNode) return turnNode;
    if (sessionNode) return sessionNode;
    return root;
  };

  for (const envelope of events) {
    const event = envelope.payload.hook_event_name;
    const startSpan = spanByStart.get(envelope.event_id);

    switch (event) {
      case 'sessionStart': {
        sessionNode = lifecycleShell('session', startSpan, envelope, 0);
        root.children.push(sessionNode);
        root.timestamp_ms = sessionNode.timestamp_ms;
        root.timestamp_iso = sessionNode.timestamp_iso;
        sessionNode.children.push(makeEventNode(envelope, 1));
        break;
      }
      case 'userPromptSubmitted': {
        turnNode = lifecycleShell('turn', startSpan, envelope, sessionNode ? 1 : 0);
        (sessionNode ?? root).children.push(turnNode);
        turnNode.children.push(makeEventNode(envelope, turnNode.depth + 1));
        break;
      }
      case 'preToolUse': {
        const parent = turnNode ?? sessionNode ?? root;
        const toolNode = lifecycleShell('tool', startSpan, envelope, parent.depth + 1);
        parent.children.push(toolNode);
        toolStack.push(toolNode);
        toolNode.children.push(makeEventNode(envelope, toolNode.depth + 1));
        break;
      }
      case 'subagentStart': {
        const parent = turnNode ?? sessionNode ?? root;
        const sub = lifecycleShell('subagent', startSpan, envelope, parent.depth + 1);
        parent.children.push(sub);
        subagentStack.push(sub);
        sub.children.push(makeEventNode(envelope, sub.depth + 1));
        break;
      }
      case 'postToolUse':
      case 'postToolUseFailure': {
        const node = makeEventNode(envelope, activeParent().depth + 1, event === 'postToolUseFailure' ? 'error' : 'ok');
        activeParent().children.push(node);
        const open = toolStack.pop();
        if (open && startSpan == null) {
          const matched = spans.find((s) => s.kind === 'tool' && s.end_event_id === envelope.event_id);
          if (matched) {
            open.status = matched.status;
            if (matched.end_unix_ms != null) open.duration_ms = matched.end_unix_ms - matched.start_unix_ms;
            if (matched.heuristic) open.heuristic = true;
          } else {
            open.status = event === 'postToolUseFailure' ? 'error' : 'ok';
          }
        } else if (open && startSpan) {
          open.status = startSpan.status;
        } else if (open) {
          open.status = event === 'postToolUseFailure' ? 'error' : 'ok';
        }
        // Prefer end-event span match for duration/status.
        if (open) {
          const matched = spans.find((s) => s.kind === 'tool' && s.end_event_id === envelope.event_id);
          if (matched) {
            open.status = matched.status;
            if (matched.status_message) open.status_message = matched.status_message;
            if (matched.end_unix_ms != null) open.duration_ms = matched.end_unix_ms - matched.start_unix_ms;
            if (matched.heuristic) open.heuristic = true;
          }
        }
        break;
      }
      case 'subagentStop': {
        const node = makeEventNode(envelope, activeParent().depth + 1, 'ok');
        activeParent().children.push(node);
        const open = subagentStack.pop();
        if (open) {
          const matched = spans.find((s) => s.kind === 'subagent' && s.end_event_id === envelope.event_id);
          if (matched) {
            open.status = matched.status;
            if (matched.end_unix_ms != null) open.duration_ms = matched.end_unix_ms - matched.start_unix_ms;
            if (matched.heuristic) open.heuristic = true;
          } else {
            open.status = 'ok';
          }
        }
        break;
      }
      case 'agentStop': {
        const parent = turnNode ?? sessionNode ?? root;
        parent.children.push(makeEventNode(envelope, parent.depth + 1, 'ok'));
        if (turnNode) {
          const matched = spans.find((s) => s.kind === 'turn' && s.end_event_id === envelope.event_id);
          if (matched) {
            turnNode.status = matched.status;
            if (matched.end_unix_ms != null) turnNode.duration_ms = matched.end_unix_ms - matched.start_unix_ms;
          } else {
            turnNode.status = 'ok';
          }
          turnNode = undefined;
        }
        break;
      }
      case 'sessionEnd': {
        const parent = sessionNode ?? root;
        parent.children.push(makeEventNode(envelope, parent.depth + 1));
        const matched = spans.find((s) => s.kind === 'session' && s.end_event_id === envelope.event_id);
        if (sessionNode) {
          if (matched) {
            sessionNode.status = matched.status;
            if (matched.status_message) sessionNode.status_message = matched.status_message;
            if (matched.end_unix_ms != null) sessionNode.duration_ms = matched.end_unix_ms - matched.start_unix_ms;
          }
                  if (sessionNode.status !== undefined) root.status = sessionNode.status;
        }
        break;
      }
      default: {
        activeParent().children.push(makeEventNode(envelope, activeParent().depth + 1, event === 'errorOccurred' ? 'error' : undefined));
        break;
      }
    }
  }

  if (!sessionNode && root.children.length === 0) {
    for (const envelope of events) root.children.push(makeEventNode(envelope, 1));
  }

  const sessionSpan = spans.find((s) => s.kind === 'session');
  const cwd = events.map((e) => getString(e.payload, 'cwd')).find((v) => v !== undefined);
  const endReason = events
    .filter((e) => e.payload.hook_event_name === 'sessionEnd')
    .map((e) => getString(e.payload, 'reason'))
    .find((v) => v !== undefined);

  let errorCount = 0;
  let toolCount = 0;
  let turnCount = 0;
  let subagentCount = 0;
  for (const envelope of events) {
    const name = envelope.payload.hook_event_name;
    if (name === 'userPromptSubmitted') turnCount += 1;
    if (name === 'preToolUse') toolCount += 1;
    if (name === 'subagentStart') subagentCount += 1;
    if (name === 'postToolUseFailure' || name === 'errorOccurred') errorCount += 1;
  }

  const projectedRoot = sessionNode ?? root;
  attachCoverageGapNodes(projectedRoot, coverageEntries);

  return {
    schema_version: '1.1.0',
    source: 'hooks-only',
    session_id: sessionId,
    generated_at: new Date().toISOString(),
    status: sessionSpan?.status ?? root.status ?? 'open',
    ...(endReason ? { end_reason: endReason } : {}),
    ...(cwd ? { cwd } : {}),
    started_at_ms: sessionSpan?.start_unix_ms ?? root.timestamp_ms,
    ...(sessionSpan?.end_unix_ms != null ? { ended_at_ms: sessionSpan.end_unix_ms } : {}),
    event_count: events.length,
    turn_count: turnCount,
    tool_count: toolCount,
    subagent_count: subagentCount,
    error_count: errorCount,
    root: projectedRoot,
    events,
    spans
  };
}

function indent(level: number): string {
  return '  '.repeat(Math.max(0, level));
}

function fenceLanguage(label: string, value: string): string {
  if (label.includes('prompt') || label.includes('message') || label.includes('response')) return 'text';
  if (value.trimStart().startsWith('{') || value.trimStart().startsWith('[')) return 'json';
  if (label.includes('input') || label.includes('command')) return 'bash';
  return 'text';
}

function renderContentMd(content: ConversationContent[], level: number): string[] {
  const lines: string[] = [];
  for (const item of content) {
    if (item.redacted) {
      const sha = item.redacted.sha256 ? item.redacted.sha256.slice(0, 12) : '?';
      const bytes = item.redacted.bytes ?? '?';
      lines.push(`${indent(level)}- **${item.label}**: \`[redacted sha256:${sha}… ${bytes} B]\``);
      continue;
    }
    if (item.text !== undefined) {
      if (item.text.includes('\n') || item.text.length > 120) {
        const lang = fenceLanguage(item.label, item.text);
        lines.push(`${indent(level)}- **${item.label}**:`);
        lines.push(`${indent(level)}  \`\`\`${lang}`);
        for (const line of item.text.split('\n')) lines.push(`${indent(level)}  ${line}`);
        lines.push(`${indent(level)}  \`\`\``);
      } else {
        lines.push(`${indent(level)}- **${item.label}**: ${item.text}`);
      }
      continue;
    }
    if (item.json !== undefined) {
      const dumped = JSON.stringify(item.json, null, 2);
      lines.push(`${indent(level)}- **${item.label}**:`);
      lines.push(`${indent(level)}  \`\`\`json`);
      for (const line of dumped.split('\n')) lines.push(`${indent(level)}  ${line}`);
      lines.push(`${indent(level)}  \`\`\``);
    }
  }
  return lines;
}

function renderNodeMd(node: ConversationNode, level: number): string[] {
  const lines: string[] = [];
  const status = node.status ? ` · ${node.status}` : '';
  const dur = node.duration_ms != null ? ` · ${node.duration_ms}ms` : '';
  const heuristic = node.heuristic ? ' · heuristic' : '';
  const heading =
    node.kind === 'session'
      ? `#`
      : node.kind === 'turn'
        ? `##`
        : node.kind === 'tool' || node.kind === 'subagent'
          ? `###`
          : `-`;
  if (heading === '-') {
    const model = node.model ? ` · ${node.model}` : '';
    lines.push(`${indent(level)}- **${node.title}** (${node.timestamp_iso}${status}${dur}${heuristic}${model})`);
    if (node.reasoning_encrypted) lines.push(`${indent(level + 1)}- _[reasoning encrypted]_`);
    lines.push(...renderContentMd(node.content, level + 1));
  } else {
    lines.push(`${heading} ${node.title}`);
    lines.push('');
    lines.push(`- time: \`${node.timestamp_iso}\``);
    if (node.status) lines.push(`- status: \`${node.status}${node.status_message ? ` (${node.status_message})` : ''}\``);
    if (node.duration_ms != null) lines.push(`- duration_ms: \`${node.duration_ms}\``);
    if (node.tool_name) lines.push(`- tool: \`${node.tool_name}\``);
    if (node.agent_name) lines.push(`- agent: \`${node.agent_name}\``);
    if (node.model) lines.push(`- model: \`${node.model}\``);
    if (node.child_session_id) lines.push(`- child_session: \`${node.child_session_id}\``);
    if (node.heuristic) lines.push('- correlation: `heuristic`');
    lines.push('');
    lines.push(...renderContentMd(node.content, 0));
  }
  for (const child of node.children) {
    lines.push(...renderNodeMd(child, heading === '-' ? level + 1 : 0));
  }
  if (heading !== '-') lines.push('');
  return lines;
}

export function conversationToMarkdown(doc: ConversationDocument): string {
  const lines: string[] = [
    `# Conversation \`${doc.session_id}\``,
    '',
    `- generated_at: \`${doc.generated_at}\``,
    `- source: \`${doc.source}\``,
    ...(doc.model ? [`- model: \`${doc.model}\``] : []),
    `- status: \`${doc.status}${doc.end_reason ? ` (${doc.end_reason})` : ''}\``,
    ...(doc.cwd ? [`- cwd: \`${doc.cwd}\``] : []),
    `- started_at: \`${iso(doc.started_at_ms)}\``,
    ...(doc.ended_at_ms != null ? [`- ended_at: \`${iso(doc.ended_at_ms)}\``] : []),
    `- events: \`${doc.event_count}\` · turns: \`${doc.turn_count}\` · tools: \`${doc.tool_count}\` · subagents: \`${doc.subagent_count}\` · errors: \`${doc.error_count}\``,
    '',
    '## Verbatim chronological transcript',
    ''
  ];
  lines.push(...renderNodeMd(doc.root, 0));
  lines.push('## Raw event ledger');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(doc.events, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}
