import {
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Link,
  type Span,
  type SpanContext,
  type Tracer
} from '@opentelemetry/api';
import type { BridgeConfig } from './config.js';
import { contextFromSpan, contextFromSpanContext, linkFromSpanContext, parseTraceparent, startPointSpan } from './otel.js';
import { hookLifecycleAttributes, hookPointStatus, hookSpanAttributes } from './hook-span-contract.js';
import {
  getObject,
  getString,
  type CopilotHookEventName,
  type HookEnvelope,
  type NormalizedHookPayload
} from './types.js';

interface OpenSpanRecord {
  span: Span;
  startedAtMs: number;
  sessionId: string;
  key: string;
  kind: 'session' | 'turn' | 'tool' | 'subagent';
}

interface OpenToolRecord extends OpenSpanRecord {
  kind: 'tool';
  toolName: string;
}

interface OpenSubagentRecord extends OpenSpanRecord {
  kind: 'subagent';
  agentName: string;
}

interface Resolution {
  parentContext: Context;
  links: Link[];
  tool?: OpenToolRecord;
  subagent?: OpenSubagentRecord;
  heuristic?: boolean;
}

function dateFromEnvelope(envelope: HookEnvelope): Date {
  const parsed = new Date(envelope.payload.timestamp);
  return Number.isNaN(parsed.getTime()) ? new Date(envelope.observed_at_unix_ms) : parsed;
}

function spanContextOf(span: Span | undefined): SpanContext | undefined {
  if (!span) return undefined;
  const context = span.spanContext();
  return context.traceId === '00000000000000000000000000000000' ? undefined : context;
}

function sameSpanContext(left: SpanContext | undefined, right: SpanContext | undefined): boolean {
  return Boolean(left && right && left.traceId === right.traceId && left.spanId === right.spanId);
}

function appendLink(links: Link[], context: SpanContext | undefined, attributes: Attributes): void {
  const link = linkFromSpanContext(context, attributes);
  if (!link || links.some((candidate) => sameSpanContext(candidate.context, link.context))) return;
  links.push(link);
}

function eventStatus(event: CopilotHookEventName): { code: number; message?: string } | undefined {
  const status = hookPointStatus(event);
  if (status.status === 'error') {
    return { code: SpanStatusCode.ERROR, message: event };
  }
  if (status.status === 'ok') {
    return { code: SpanStatusCode.OK };
  }
  return undefined;
}

function errorMessage(payload: NormalizedHookPayload): string | undefined {
  const direct = getString(payload, 'error');
  if (direct) return direct;
  const object = getObject(payload, 'error');
  return object ? getString(object, 'message') : undefined;
}

function coreAttributes(envelope: HookEnvelope): Attributes {
  return hookSpanAttributes(envelope) as Attributes;
}

function lifecycleAttributes(
  envelope: HookEnvelope,
  kind: OpenSpanRecord['kind'],
  correlationKey: string
): Attributes {
  return hookLifecycleAttributes(envelope, kind, correlationKey) as Attributes;
}

function toolQueueKey(payload: NormalizedHookPayload): string {
  return `${payload.session_id}:${getString(payload, 'tool_name') ?? 'unknown'}`;
}

function subagentQueueKey(payload: NormalizedHookPayload): string {
  return `${payload.session_id}:${getString(payload, 'agent_name') ?? 'unknown'}`;
}

export class SpanAssembler {
  private readonly sessions = new Map<string, OpenSpanRecord>();
  private readonly turns = new Map<string, OpenSpanRecord>();
  private readonly tools = new Map<string, OpenToolRecord[]>();
  private readonly subagents = new Map<string, OpenSubagentRecord[]>();
  private readonly lastTurnBySession = new Map<string, SpanContext>();

  public constructor(
    private readonly tracer: Tracer,
    private readonly config: BridgeConfig
  ) {}

  public process(envelope: HookEnvelope): void {
    this.expireStale(envelope.observed_at_unix_ms);
    const timestamp = dateFromEnvelope(envelope);
    const inherited = parseTraceparent(envelope.traceparent);

    this.startLifecycle(envelope, timestamp, inherited);
    const resolution = this.resolve(envelope, inherited);
    const attributes = coreAttributes(envelope);
    if (resolution.heuristic) attributes['github.copilot.hook.relationship.heuristic'] = true;

    const point = startPointSpan(
      this.tracer,
      `github.copilot.hook.${envelope.payload.hook_event_name}`,
      timestamp,
      attributes,
      resolution.parentContext,
      resolution.links
    );
    const status = eventStatus(envelope.payload.hook_event_name);
    if (status) point.setStatus(status);
    const message = errorMessage(envelope.payload);
    if (message && (envelope.payload.hook_event_name === 'postToolUseFailure' || envelope.payload.hook_event_name === 'errorOccurred')) {
      point.recordException(new Error(message));
    }
    point.end(timestamp);

    this.finishLifecycle(envelope, timestamp, resolution);
  }

  public shutdown(): void {
    const timestamp = new Date();
    for (const record of this.allOpenRecords()) this.closeRecovered(record, timestamp, 'bridge_shutdown');
    this.sessions.clear();
    this.turns.clear();
    this.tools.clear();
    this.subagents.clear();
  }

  private startLifecycle(envelope: HookEnvelope, timestamp: Date, inherited: SpanContext | undefined): void {
    const payload = envelope.payload;
    switch (payload.hook_event_name) {
      case 'sessionStart': {
        const existing = this.sessions.get(payload.session_id);
        if (existing) this.closeRecovered(existing, timestamp, 'duplicate_start');
        const span = this.tracer.startSpan(
          'github.copilot.hook.session',
          {
            attributes: lifecycleAttributes(envelope, 'session', payload.session_id),
            startTime: timestamp
          },
          contextFromSpanContext(inherited)
        );
        this.sessions.set(payload.session_id, {
          span,
          startedAtMs: timestamp.getTime(),
          sessionId: payload.session_id,
          key: payload.session_id,
          kind: 'session'
        });
        break;
      }
      case 'userPromptSubmitted': {
        const existing = this.turns.get(payload.session_id);
        if (existing) this.closeRecovered(existing, timestamp, 'duplicate_start');
        const parent = this.sessions.get(payload.session_id)?.span;
        const span = this.tracer.startSpan(
          'github.copilot.hook.turn',
          {
            attributes: lifecycleAttributes(envelope, 'turn', payload.session_id),
            startTime: timestamp,
            links: parent && inherited && !sameSpanContext(spanContextOf(parent), inherited)
              ? [{ context: inherited, attributes: { 'github.copilot.link.reason': 'native_traceparent' } }]
              : []
          },
          parent ? contextFromSpan(parent) : contextFromSpanContext(inherited)
        );
        this.turns.set(payload.session_id, {
          span,
          startedAtMs: timestamp.getTime(),
          sessionId: payload.session_id,
          key: payload.session_id,
          kind: 'turn'
        });
        break;
      }
      case 'preToolUse': {
        const toolName = getString(payload, 'tool_name') ?? 'unknown';
        const key = `${toolQueueKey(payload)}:${envelope.event_id}`;
        const parent = this.turns.get(payload.session_id)?.span ?? this.sessions.get(payload.session_id)?.span;
        const links: Link[] = [];
        if (parent && inherited && !sameSpanContext(spanContextOf(parent), inherited)) {
          appendLink(links, inherited, { 'github.copilot.link.reason': 'native_traceparent' });
        }
        const span = this.tracer.startSpan(
          'github.copilot.hook.tool',
          {
            attributes: {
              ...lifecycleAttributes(envelope, 'tool', key),
              'gen_ai.operation.name': 'execute_tool',
              'gen_ai.tool.name': toolName,
              'gen_ai.tool.type': 'function',
              'github.copilot.hook.correlation.limit': 'no_tool_call_id_in_hook_payload'
            },
            startTime: timestamp,
            links
          },
          parent ? contextFromSpan(parent) : contextFromSpanContext(inherited)
        );
        const queueKey = toolQueueKey(payload);
        const queue = this.tools.get(queueKey) ?? [];
        queue.push({
          span,
          startedAtMs: timestamp.getTime(),
          sessionId: payload.session_id,
          key,
          kind: 'tool',
          toolName
        });
        this.tools.set(queueKey, queue);
        break;
      }
      case 'subagentStart': {
        const agentName = getString(payload, 'agent_name') ?? 'unknown';
        const key = `${subagentQueueKey(payload)}:${envelope.event_id}`;
        const parent = this.turns.get(payload.session_id)?.span ?? this.sessions.get(payload.session_id)?.span;
        const links: Link[] = [];
        if (parent && inherited && !sameSpanContext(spanContextOf(parent), inherited)) {
          appendLink(links, inherited, { 'github.copilot.link.reason': 'native_traceparent' });
        }
        const span = this.tracer.startSpan(
          'github.copilot.hook.subagent',
          {
            attributes: {
              ...lifecycleAttributes(envelope, 'subagent', key),
              'gen_ai.operation.name': 'invoke_agent',
              'gen_ai.agent.name': agentName,
              'github.copilot.hook.correlation.limit': 'subagent_start_has_no_agent_id'
            },
            startTime: timestamp,
            links
          },
          parent ? contextFromSpan(parent) : contextFromSpanContext(inherited)
        );
        const queueKey = subagentQueueKey(payload);
        const queue = this.subagents.get(queueKey) ?? [];
        queue.push({
          span,
          startedAtMs: timestamp.getTime(),
          sessionId: payload.session_id,
          key,
          kind: 'subagent',
          agentName
        });
        this.subagents.set(queueKey, queue);
        break;
      }
      default:
        break;
    }
  }

  private resolve(envelope: HookEnvelope, inherited: SpanContext | undefined): Resolution {
    const payload = envelope.payload;
    const event = payload.hook_event_name;
    const links: Link[] = [];
    let parentSpan: Span | undefined;
    let tool: OpenToolRecord | undefined;
    let subagent: OpenSubagentRecord | undefined;
    let heuristic = false;

    if (event === 'preToolUse') {
      const queue = this.tools.get(toolQueueKey(payload));
      tool = queue?.[queue.length - 1];
      parentSpan = tool?.span;
    } else if (event === 'postToolUse' || event === 'postToolUseFailure') {
      const queue = this.tools.get(toolQueueKey(payload));
      tool = queue?.[0];
      if (queue && queue.length === 1) parentSpan = tool?.span;
      else if (tool) {
        parentSpan = this.turns.get(payload.session_id)?.span ?? this.sessions.get(payload.session_id)?.span;
        appendLink(links, spanContextOf(tool.span), {
          'github.copilot.link.reason': 'fifo_tool_name_match',
          'github.copilot.link.heuristic': true
        });
        heuristic = true;
      }
    } else if (event === 'subagentStart') {
      const queue = this.subagents.get(subagentQueueKey(payload));
      subagent = queue?.[queue.length - 1];
      parentSpan = subagent?.span;
    } else if (event === 'subagentStop') {
      const queue = this.subagents.get(subagentQueueKey(payload));
      subagent = queue?.[0];
      if (queue && queue.length === 1) parentSpan = subagent?.span;
      else if (subagent) {
        parentSpan = this.turns.get(payload.session_id)?.span ?? this.sessions.get(payload.session_id)?.span;
        appendLink(links, spanContextOf(subagent.span), {
          'github.copilot.link.reason': 'fifo_agent_name_match',
          'github.copilot.link.heuristic': true
        });
        heuristic = true;
      }
    } else if (event === 'permissionRequest') {
      const candidates = this.openToolsForSession(payload.session_id);
      if (candidates.length === 1) {
        appendLink(links, spanContextOf(candidates[0]?.span), {
          'github.copilot.link.reason': 'sole_open_tool',
          'github.copilot.link.heuristic': true
        });
        heuristic = true;
      }
      parentSpan = this.turns.get(payload.session_id)?.span ?? this.sessions.get(payload.session_id)?.span;
    } else if (event === 'sessionStart' || event === 'sessionEnd') {
      parentSpan = this.sessions.get(payload.session_id)?.span;
    } else {
      parentSpan = this.turns.get(payload.session_id)?.span ?? this.sessions.get(payload.session_id)?.span;
    }

    if (!parentSpan) {
      const lastTurn = this.lastTurnBySession.get(payload.session_id);
      if (lastTurn && ['notification', 'errorOccurred', 'preCompact'].includes(event)) {
        appendLink(links, lastTurn, { 'github.copilot.link.reason': 'last_completed_turn' });
      }
    }

    const localContext = spanContextOf(parentSpan);
    if (inherited && localContext && !sameSpanContext(inherited, localContext)) {
      appendLink(links, inherited, { 'github.copilot.link.reason': 'native_traceparent' });
    }

    return {
      parentContext: parentSpan ? contextFromSpan(parentSpan) : contextFromSpanContext(inherited),
      links,
      ...(tool ? { tool } : {}),
      ...(subagent ? { subagent } : {}),
      ...(heuristic ? { heuristic: true } : {})
    };
  }

  private finishLifecycle(envelope: HookEnvelope, timestamp: Date, resolution: Resolution): void {
    const payload = envelope.payload;
    switch (payload.hook_event_name) {
      case 'postToolUse':
      case 'postToolUseFailure': {
        const record = resolution.tool;
        if (!record) break;
        const queueKey = toolQueueKey(payload);
        const queue = this.tools.get(queueKey) ?? [];
        const index = queue.indexOf(record);
        if (index >= 0) queue.splice(index, 1);
        if (queue.length === 0) this.tools.delete(queueKey);
        else this.tools.set(queueKey, queue);
        record.span.setAttribute('github.copilot.hook.lifecycle.end_event', payload.hook_event_name);
        if (payload.hook_event_name === 'postToolUse') record.span.setStatus({ code: SpanStatusCode.OK });
        else {
          record.span.setStatus({ code: SpanStatusCode.ERROR, message: 'postToolUseFailure' });
          const message = errorMessage(payload);
          if (message) record.span.recordException(new Error(message));
        }
        record.span.end(timestamp);
        break;
      }
      case 'subagentStop': {
        const record = resolution.subagent;
        if (!record) break;
        const queueKey = subagentQueueKey(payload);
        const queue = this.subagents.get(queueKey) ?? [];
        const index = queue.indexOf(record);
        if (index >= 0) queue.splice(index, 1);
        if (queue.length === 0) this.subagents.delete(queueKey);
        else this.subagents.set(queueKey, queue);
        const agentId = getString(payload, 'agent_id');
        if (agentId) record.span.setAttribute('gen_ai.agent.id', agentId);
        record.span.setAttribute('github.copilot.hook.lifecycle.end_event', 'subagentStop');
        record.span.setStatus({ code: SpanStatusCode.OK });
        record.span.end(timestamp);
        break;
      }
      case 'agentStop': {
        const record = this.turns.get(payload.session_id);
        if (!record) break;
        record.span.setAttribute('github.copilot.hook.lifecycle.end_event', 'agentStop');
        record.span.setStatus({ code: SpanStatusCode.OK });
        record.span.end(timestamp);
        this.lastTurnBySession.set(payload.session_id, record.span.spanContext());
        this.turns.delete(payload.session_id);
        break;
      }
      case 'sessionEnd': {
        this.closeSessionChildren(payload.session_id, timestamp, 'session_end');
        const record = this.sessions.get(payload.session_id);
        if (!record) break;
        const reason = getString(payload, 'reason');
        record.span.setAttribute('github.copilot.hook.lifecycle.end_event', 'sessionEnd');
        if (reason === 'complete' || reason === 'user_exit') record.span.setStatus({ code: SpanStatusCode.OK });
        else record.span.setStatus({ code: SpanStatusCode.ERROR, message: reason ?? 'sessionEnd' });
        record.span.end(timestamp);
        this.sessions.delete(payload.session_id);
        break;
      }
      default:
        break;
    }
  }

  private openToolsForSession(sessionId: string): OpenToolRecord[] {
    return [...this.tools.values()].flat().filter((record) => record.sessionId === sessionId);
  }

  private allOpenRecords(): OpenSpanRecord[] {
    return [
      ...this.sessions.values(),
      ...this.turns.values(),
      ...[...this.tools.values()].flat(),
      ...[...this.subagents.values()].flat()
    ];
  }

  private closeSessionChildren(sessionId: string, timestamp: Date, reason: string): void {
    const turn = this.turns.get(sessionId);
    if (turn) {
      this.closeRecovered(turn, timestamp, reason);
      this.turns.delete(sessionId);
    }
    for (const [key, queue] of this.tools) {
      const keep: OpenToolRecord[] = [];
      for (const record of queue) {
        if (record.sessionId === sessionId) this.closeRecovered(record, timestamp, reason);
        else keep.push(record);
      }
      if (keep.length === 0) this.tools.delete(key); else this.tools.set(key, keep);
    }
    for (const [key, queue] of this.subagents) {
      const keep: OpenSubagentRecord[] = [];
      for (const record of queue) {
        if (record.sessionId === sessionId) this.closeRecovered(record, timestamp, reason);
        else keep.push(record);
      }
      if (keep.length === 0) this.subagents.delete(key); else this.subagents.set(key, keep);
    }
  }

  private expireStale(nowMs: number): void {
    const cutoff = nowMs - this.config.openSpanTimeoutMs;
    const timestamp = new Date(nowMs);
    for (const [sessionId, record] of this.sessions) {
      if (record.startedAtMs < cutoff) {
        this.closeSessionChildren(sessionId, timestamp, 'timeout');
        this.closeRecovered(record, timestamp, 'timeout');
        this.sessions.delete(sessionId);
      }
    }
    for (const [sessionId, record] of this.turns) {
      if (record.startedAtMs < cutoff) {
        this.closeRecovered(record, timestamp, 'timeout');
        this.turns.delete(sessionId);
      }
    }
    for (const [key, queue] of this.tools) {
      const keep = queue.filter((record) => {
        if (record.startedAtMs >= cutoff) return true;
        this.closeRecovered(record, timestamp, 'timeout');
        return false;
      });
      if (keep.length === 0) this.tools.delete(key); else this.tools.set(key, keep);
    }
    for (const [key, queue] of this.subagents) {
      const keep = queue.filter((record) => {
        if (record.startedAtMs >= cutoff) return true;
        this.closeRecovered(record, timestamp, 'timeout');
        return false;
      });
      if (keep.length === 0) this.subagents.delete(key); else this.subagents.set(key, keep);
    }
  }

  private closeRecovered(record: OpenSpanRecord, timestamp: Date, reason: string): void {
    record.span.setAttributes({
      'github.copilot.hook.lifecycle.recovered_end': true,
      'github.copilot.hook.lifecycle.recovered_reason': reason
    });
    record.span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
    record.span.end(timestamp);
  }
}
