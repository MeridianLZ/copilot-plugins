import {
  getString,
  isHookEnvelope,
  type CopilotHookEventName,
  type HookEnvelope,
  type JsonValue,
  type NormalizedHookPayload
} from './types.js';

/**
 * Pure-data projection of the hook JSONL ledger into session summaries and
 * reconstructed lifecycle/point spans for the trace-viewer UI. Mirrors the
 * pairing rules of SpanAssembler (FIFO tool/subagent correlation, heuristic
 * flagging) without emitting OpenTelemetry spans, so the ledger can be
 * re-projected at read time as often as needed.
 */

export type ProjectedStatus = 'ok' | 'error' | 'open' | 'recovered';

export interface ProjectedSpan {
  span_id: string;
  kind: 'session' | 'turn' | 'tool' | 'subagent' | 'point';
  name: string;
  event?: CopilotHookEventName;
  session_id: string;
  parent_id?: string;
  start_unix_ms: number;
  end_unix_ms?: number;
  status: ProjectedStatus;
  status_message?: string;
  heuristic?: boolean;
  tool_name?: string;
  agent_name?: string;
  start_event_id: string;
  end_event_id?: string;
}

export interface SessionSummary {
  session_id: string;
  started_at_ms: number;
  ended_at_ms?: number;
  last_event_at_ms: number;
  status: ProjectedStatus;
  end_reason?: string;
  cwd?: string;
  event_count: number;
  turn_count: number;
  tool_count: number;
  subagent_count: number;
  error_count: number;
}

export interface SessionTrace {
  session_id: string;
  spans: ProjectedSpan[];
  events: HookEnvelope[];
}

export function parseLedgerLines(lines: readonly string[]): HookEnvelope[] {
  const seen = new Set<string>();
  const envelopes: HookEnvelope[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }
    if (!isHookEnvelope(parsed) || seen.has(parsed.event_id)) continue;
    seen.add(parsed.event_id);
    envelopes.push(parsed);
  }
  envelopes.sort((left, right) => eventTimeMs(left) - eventTimeMs(right));
  return envelopes;
}

export function eventTimeMs(envelope: HookEnvelope): number {
  const parsed = Date.parse(envelope.payload.timestamp);
  return Number.isNaN(parsed) ? envelope.observed_at_unix_ms : parsed;
}

function toolKey(payload: NormalizedHookPayload): string {
  return `${payload.session_id}:${getString(payload, 'tool_name') ?? 'unknown'}`;
}

function subagentKey(payload: NormalizedHookPayload): string {
  return `${payload.session_id}:${getString(payload, 'agent_name') ?? 'unknown'}`;
}

export function projectSessions(envelopes: readonly HookEnvelope[]): SessionSummary[] {
  const sessions = new Map<string, SessionSummary>();
  for (const envelope of envelopes) {
    const payload = envelope.payload;
    const timeMs = eventTimeMs(envelope);
    let summary = sessions.get(payload.session_id);
    if (!summary) {
      summary = {
        session_id: payload.session_id,
        started_at_ms: timeMs,
        last_event_at_ms: timeMs,
        status: 'open',
        event_count: 0,
        turn_count: 0,
        tool_count: 0,
        subagent_count: 0,
        error_count: 0
      };
      sessions.set(payload.session_id, summary);
    }
    summary.event_count += 1;
    summary.started_at_ms = Math.min(summary.started_at_ms, timeMs);
    summary.last_event_at_ms = Math.max(summary.last_event_at_ms, timeMs);
    const cwd = getString(payload, 'cwd');
    if (cwd) summary.cwd = cwd;

    switch (payload.hook_event_name) {
      case 'userPromptSubmitted':
        summary.turn_count += 1;
        break;
      case 'preToolUse':
        summary.tool_count += 1;
        break;
      case 'subagentStart':
        summary.subagent_count += 1;
        break;
      case 'postToolUseFailure':
      case 'errorOccurred':
        summary.error_count += 1;
        break;
      case 'sessionEnd': {
        summary.ended_at_ms = timeMs;
        const reason = getString(payload, 'reason');
        if (reason !== undefined) summary.end_reason = reason;
        summary.status = reason === 'complete' || reason === 'user_exit' ? 'ok' : 'error';
        break;
      }
      default:
        break;
    }
  }
  return [...sessions.values()].sort((left, right) => right.started_at_ms - left.started_at_ms);
}

interface OpenRecord {
  span: ProjectedSpan;
}

export function projectSessionTrace(envelopes: readonly HookEnvelope[], sessionId: string): SessionTrace {
  const events = envelopes.filter((envelope) => envelope.payload.session_id === sessionId);
  const spans: ProjectedSpan[] = [];
  let spanCounter = 0;
  const nextId = (kind: ProjectedSpan['kind']): string => `${kind}-${(spanCounter += 1)}`;

  let session: OpenRecord | undefined;
  let turn: OpenRecord | undefined;
  const tools = new Map<string, OpenRecord[]>();
  const subagents = new Map<string, OpenRecord[]>();

  const openLifecycle = (
    kind: 'session' | 'turn' | 'tool' | 'subagent',
    envelope: HookEnvelope,
    timeMs: number,
    parentId: string | undefined
  ): OpenRecord => {
    const payload = envelope.payload;
    const span: ProjectedSpan = {
      span_id: nextId(kind),
      kind,
      name: `github.copilot.hook.${kind}`,
      session_id: sessionId,
      ...(parentId ? { parent_id: parentId } : {}),
      start_unix_ms: timeMs,
      status: 'open',
      start_event_id: envelope.event_id
    };
    const toolName = getString(payload, 'tool_name');
    if (kind === 'tool' && toolName !== undefined) span.tool_name = toolName;
    const agentName = getString(payload, 'agent_name');
    if (kind === 'subagent' && agentName !== undefined) span.agent_name = agentName;
    spans.push(span);
    return { span };
  };

  const close = (
    record: OpenRecord,
    envelope: HookEnvelope | undefined,
    timeMs: number,
    status: ProjectedStatus,
    message?: string
  ): void => {
    record.span.end_unix_ms = timeMs;
    record.span.status = status;
    if (message !== undefined) record.span.status_message = message;
    if (envelope) record.span.end_event_id = envelope.event_id;
  };

  const closeSessionChildren = (timeMs: number, reason: string): void => {
    if (turn) {
      close(turn, undefined, timeMs, 'recovered', reason);
      turn = undefined;
    }
    for (const queue of tools.values()) for (const record of queue) close(record, undefined, timeMs, 'recovered', reason);
    tools.clear();
    for (const queue of subagents.values()) for (const record of queue) close(record, undefined, timeMs, 'recovered', reason);
    subagents.clear();
  };

  for (const envelope of events) {
    const payload = envelope.payload;
    const event = payload.hook_event_name;
    const timeMs = eventTimeMs(envelope);
    let parentId: string | undefined;
    let heuristic = false;
    let pointStatus: ProjectedStatus = 'ok';
    let pointMessage: string | undefined;

    switch (event) {
      case 'sessionStart': {
        if (session) close(session, undefined, timeMs, 'recovered', 'duplicate_start');
        session = openLifecycle('session', envelope, timeMs, undefined);
        parentId = session.span.span_id;
        break;
      }
      case 'sessionEnd': {
        closeSessionChildren(timeMs, 'session_end');
        parentId = session?.span.span_id;
        if (session) {
          const reason = getString(payload, 'reason');
          const ok = reason === 'complete' || reason === 'user_exit';
          close(session, envelope, timeMs, ok ? 'ok' : 'error', reason);
          session = undefined;
        }
        break;
      }
      case 'userPromptSubmitted': {
        if (turn) close(turn, undefined, timeMs, 'recovered', 'duplicate_start');
        turn = openLifecycle('turn', envelope, timeMs, session?.span.span_id);
        parentId = turn.span.span_id;
        break;
      }
      case 'agentStop': {
        parentId = turn?.span.span_id ?? session?.span.span_id;
        if (turn) {
          close(turn, envelope, timeMs, 'ok');
          turn = undefined;
        }
        break;
      }
      case 'preToolUse': {
        const record = openLifecycle('tool', envelope, timeMs, turn?.span.span_id ?? session?.span.span_id);
        const queue = tools.get(toolKey(payload)) ?? [];
        queue.push(record);
        tools.set(toolKey(payload), queue);
        parentId = record.span.span_id;
        break;
      }
      case 'postToolUse':
      case 'postToolUseFailure': {
        const key = toolKey(payload);
        const queue = tools.get(key) ?? [];
        const record = queue.shift();
        if (queue.length === 0) tools.delete(key);
        if (record) {
          heuristic = queue.length > 0;
          record.span.heuristic = record.span.heuristic === true || heuristic;
          parentId = record.span.span_id;
          const failed = event === 'postToolUseFailure';
          close(record, envelope, timeMs, failed ? 'error' : 'ok', failed ? 'postToolUseFailure' : undefined);
        } else {
          parentId = turn?.span.span_id ?? session?.span.span_id;
        }
        if (event === 'postToolUseFailure') {
          pointStatus = 'error';
          pointMessage = getString(payload, 'error') ?? 'postToolUseFailure';
        }
        break;
      }
      case 'subagentStart': {
        const record = openLifecycle('subagent', envelope, timeMs, turn?.span.span_id ?? session?.span.span_id);
        const queue = subagents.get(subagentKey(payload)) ?? [];
        queue.push(record);
        subagents.set(subagentKey(payload), queue);
        parentId = record.span.span_id;
        break;
      }
      case 'subagentStop': {
        const key = subagentKey(payload);
        const queue = subagents.get(key) ?? [];
        const record = queue.shift();
        if (queue.length === 0) subagents.delete(key);
        if (record) {
          record.span.heuristic = record.span.heuristic === true || queue.length > 0;
          parentId = record.span.span_id;
          close(record, envelope, timeMs, 'ok');
        } else {
          parentId = turn?.span.span_id ?? session?.span.span_id;
        }
        break;
      }
      case 'errorOccurred': {
        parentId = turn?.span.span_id ?? session?.span.span_id;
        pointStatus = 'error';
        pointMessage = getString(payload, 'error_type') ?? 'errorOccurred';
        break;
      }
      default: {
        parentId = turn?.span.span_id ?? session?.span.span_id;
        break;
      }
    }

    const point: ProjectedSpan = {
      span_id: nextId('point'),
      kind: 'point',
      name: `github.copilot.hook.${event}`,
      event,
      session_id: sessionId,
      ...(parentId ? { parent_id: parentId } : {}),
      start_unix_ms: timeMs,
      end_unix_ms: timeMs,
      status: pointStatus,
      ...(pointMessage !== undefined ? { status_message: pointMessage } : {}),
      ...(heuristic ? { heuristic: true } : {}),
      start_event_id: envelope.event_id
    };
    const toolName = getString(payload, 'tool_name');
    if (toolName !== undefined) point.tool_name = toolName;
    const agentName = getString(payload, 'agent_name');
    if (agentName !== undefined) point.agent_name = agentName;
    spans.push(point);
  }

  spans.sort((left, right) => left.start_unix_ms - right.start_unix_ms);
  return { session_id: sessionId, spans, events };
}

export function contentPreview(value: JsonValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && !Array.isArray(value) && value['redacted'] === true) {
    const sha = typeof value['sha256'] === 'string' ? value['sha256'].slice(0, 12) : undefined;
    const bytes = typeof value['bytes'] === 'number' ? value['bytes'] : undefined;
    if (sha !== undefined && bytes !== undefined) return `[hashed sha256:${sha}… ${bytes} B]`;
    return '[redacted]';
  }
  return JSON.stringify(value);
}
