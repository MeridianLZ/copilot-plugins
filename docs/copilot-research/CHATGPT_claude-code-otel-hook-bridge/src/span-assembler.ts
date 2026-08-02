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
import { flattenAttributes } from './security.js';
import {
  getArray,
  getBoolean,
  getNumber,
  getObject,
  getString,
  type HookEnvelope,
  type HookEventName,
  type HookPayload,
  type JsonObject
} from './types.js';
import {
  contextFromSpan,
  contextFromSpanContext,
  linkFromSpanContext,
  parseTraceparent,
  startPointSpan
} from './otel.js';

interface OpenSpanRecord {
  span: Span;
  startedAtMs: number;
  sessionId: string;
  promptId?: string;
  key: string;
  kind: string;
}

interface OpenToolRecord extends OpenSpanRecord {
  toolUseId: string;
  toolName?: string;
}

const DURATION_START_EVENTS = new Set<HookEventName>([
  'UserPromptSubmit',
  'PreToolUse',
  'MessageDisplay',
  'SubagentStart',
  'TaskCreated',
  'PreCompact',
  'Elicitation'
]);

function dateFromEnvelope(envelope: HookEnvelope): Date {
  const fromPayload = getString(envelope.payload, 'timestamp');
  if (fromPayload) {
    const parsed = new Date(fromPayload);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(envelope.observed_at_unix_ms);
}

function promptId(payload: HookPayload): string | undefined {
  return getString(payload, 'prompt_id');
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
  if (!link) return;
  if (links.some((candidate) => sameSpanContext(candidate.context, link.context))) return;
  links.push(link);
}

function normalizedStatus(event: HookEventName): { code: SpanStatusCode; message?: string } | undefined {
  if (event === 'PostToolUseFailure' || event === 'StopFailure') {
    return { code: SpanStatusCode.ERROR, message: event };
  }
  if (event === 'PostToolUse' || event === 'Stop' || event === 'TaskCompleted') {
    return { code: SpanStatusCode.OK };
  }
  return undefined;
}

function coreAttributes(envelope: HookEnvelope): Attributes {
  const payload = envelope.payload;
  const attributes: Attributes = {
    'claude.hook.event.name': payload.hook_event_name,
    'claude.hook.event.id': envelope.event_id,
    'claude.hook.source': envelope.source,
    'claude.session.id': payload.session_id,
    'claude.hook.observed_at_unix_ms': envelope.observed_at_unix_ms,
    'claude.hook.schema_version': envelope.schema_version
  };

  const common: readonly [string, string][] = [
    ['prompt_id', 'claude.prompt.id'],
    ['cwd', 'claude.cwd'],
    ['permission_mode', 'claude.permission.mode'],
    ['agent_id', 'claude.agent.id'],
    ['agent_type', 'claude.agent.type'],
    ['transcript_path', 'claude.transcript.path'],
    ['tool_name', 'claude.tool.name'],
    ['tool_use_id', 'claude.tool.use_id'],
    ['task_id', 'claude.task.id'],
    ['elicitation_id', 'claude.elicitation.id'],
    ['compact_id', 'claude.compaction.id'],
    ['new_cwd', 'claude.cwd.new'],
    ['old_cwd', 'claude.cwd.old'],
    ['file_path', 'claude.file.path'],
    ['worktree_path', 'claude.worktree.path'],
    ['turn_id', 'claude.turn.id'],
    ['message_id', 'claude.message.id']
  ];
  for (const [inputKey, outputKey] of common) {
    const value = getString(payload, inputKey);
    if (value !== undefined) attributes[outputKey] = value;
  }

  const booleans: readonly [string, string][] = [
    ['success', 'claude.success'],
    ['is_interrupt', 'claude.stop.is_interrupt'],
    ['is_error', 'claude.error'],
    ['final', 'claude.message.final']
  ];
  for (const [inputKey, outputKey] of booleans) {
    const value = getBoolean(payload, inputKey);
    if (value !== undefined) attributes[outputKey] = value;
  }

  const numbers: readonly [string, string][] = [
    ['index', 'claude.message.index'],
    ['duration_ms', 'claude.duration_ms']
  ];
  for (const [inputKey, outputKey] of numbers) {
    const value = getNumber(payload, inputKey);
    if (value !== undefined) attributes[outputKey] = value;
  }

  const effort = getObject(payload, 'effort');
  const effortLevel = effort ? getString(effort, 'level') : undefined;
  if (effortLevel) attributes['claude.effort.level'] = effortLevel;

  const promotedStrings: readonly [string, string][] = [
    ['model', 'claude.model'],
    ['task_subject', 'claude.task.subject'],
    ['teammate_name', 'claude.teammate.name'],
    ['team_name', 'claude.team.name'],
    ['mcp_server_name', 'claude.mcp.server.name'],
    ['action', 'claude.elicitation.action'],
    ['mode', 'claude.elicitation.mode'],
    ['trigger', 'claude.trigger'],
    ['expansion_type', 'claude.prompt.expansion.type'],
    ['command_name', 'claude.command.name'],
    ['command_source', 'claude.command.source'],
    ['memory_type', 'claude.instructions.memory_type'],
    ['load_reason', 'claude.instructions.load_reason'],
    ['notification_type', 'claude.notification.type'],
    ['error_type', 'error.type'],
    ['reason', 'claude.event.reason'],
    ['name', 'claude.worktree.name'],
    ['agent_transcript_path', 'claude.agent.transcript.path']
  ];
  for (const [inputKey, outputKey] of promotedStrings) {
    const value = getString(payload, inputKey);
    if (value !== undefined) attributes[outputKey] = value;
  }

  const model = getString(payload, 'model');
  if (model) attributes['gen_ai.request.model'] = model;

  const source = getString(payload, 'source');
  if (source) {
    attributes[payload.hook_event_name === 'SessionStart' ? 'claude.session.source' : 'claude.config.source'] = source;
  }

  const fileEvent = getString(payload, 'event');
  if (payload.hook_event_name === 'FileChanged' && fileEvent) attributes['claude.file.event'] = fileEvent;

  const countArrays: readonly [string, string][] = [
    ['tool_calls', 'claude.tool.batch.count'],
    ['background_tasks', 'claude.background_task.count'],
    ['session_crons', 'claude.session_cron.count'],
    ['globs', 'claude.instructions.glob.count'],
    ['permission_suggestions', 'claude.permission.suggestion.count']
  ];
  for (const [inputKey, outputKey] of countArrays) {
    const value = getArray(payload, inputKey);
    if (value) attributes[outputKey] = value.length;
  }

  return {
    ...attributes,
    ...flattenAttributes(payload, 'claude.hook.payload', 3, 96)
  };
}

function durationAttributes(
  envelope: HookEnvelope,
  kind: string,
  correlationKey: string
): Attributes {
  return {
    ...coreAttributes(envelope),
    'claude.lifecycle.kind': kind,
    'claude.lifecycle.correlation_key': correlationKey,
    'claude.lifecycle.start_event': envelope.payload.hook_event_name
  };
}

function chooseOnlyOpenInSession<T extends OpenSpanRecord>(
  records: Iterable<T>,
  sessionId: string
): T | undefined {
  const matches = [...records].filter((record) => record.sessionId === sessionId);
  return matches.length === 1 ? matches[0] : undefined;
}

export class SpanAssembler {
  private readonly turns = new Map<string, OpenSpanRecord>();
  private readonly tools = new Map<string, OpenToolRecord>();
  private readonly completedTools = new Map<string, SpanContext>();
  private readonly messages = new Map<string, OpenSpanRecord>();
  private readonly subagents = new Map<string, OpenSpanRecord>();
  private readonly tasks = new Map<string, OpenSpanRecord>();
  private readonly compactions = new Map<string, OpenSpanRecord>();
  private readonly elicitations = new Map<string, OpenSpanRecord>();
  private readonly lastTurnBySession = new Map<string, SpanContext>();

  public constructor(
    private readonly tracer: Tracer,
    private readonly config: BridgeConfig
  ) {}

  public process(envelope: HookEnvelope): void {
    this.expireStale(envelope.observed_at_unix_ms);

    const timestamp = dateFromEnvelope(envelope);
    const payload = envelope.payload;
    const event = payload.hook_event_name;
    const inheritedContext = parseTraceparent(envelope.traceparent);

    if (DURATION_START_EVENTS.has(event)) {
      this.startDuration(envelope, timestamp, inheritedContext);
    }

    const { parentContext, links } = this.resolvePointParentAndLinks(envelope, inheritedContext);
    const point = startPointSpan(
      this.tracer,
      `claude.hook.${event}`,
      timestamp,
      coreAttributes(envelope),
      parentContext,
      links
    );
    const status = normalizedStatus(event);
    if (status) point.setStatus(status);
    if (event === 'PostToolUseFailure' || event === 'StopFailure') {
      const error = getString(payload, 'error') ?? getString(payload, 'error_message');
      if (error) point.recordException(new Error(error));
    }
    point.end(timestamp);

    this.finishDuration(envelope, timestamp);
  }

  private turnKey(payload: HookPayload): string {
    return `${payload.session_id}:${promptId(payload) ?? 'unscoped'}`;
  }

  private messageKey(payload: HookPayload): string {
    return `${payload.session_id}:${promptId(payload) ?? 'unscoped'}:${getString(payload, 'message_id') ?? 'display'}`;
  }

  private compactKey(payload: HookPayload): string {
    return `${payload.session_id}:${getString(payload, 'compact_id') ?? promptId(payload) ?? 'latest'}`;
  }

  private elicitationKey(payload: HookPayload): string {
    return `${payload.session_id}:${getString(payload, 'elicitation_id') ?? promptId(payload) ?? 'latest'}`;
  }

  private startDuration(
    envelope: HookEnvelope,
    timestamp: Date,
    inherited: SpanContext | undefined
  ): void {
    const payload = envelope.payload;
    const event = payload.hook_event_name;
    const currentPromptId = promptId(payload);
    const links: Link[] = [];
    let parentContext: Context = inherited ? contextFromSpanContext(inherited) : ROOT_CONTEXT;

    if (event === 'UserPromptSubmit') {
      const key = this.turnKey(payload);
      const existing = this.turns.get(key);
      if (existing) this.endRecovered(existing, timestamp, 'duplicate_start');
      const span = this.tracer.startSpan(
        'claude.turn',
        {
          startTime: timestamp,
          attributes: durationAttributes(envelope, 'turn', key),
          links
        },
        parentContext
      );
      this.turns.set(key, {
        span,
        startedAtMs: timestamp.getTime(),
        sessionId: payload.session_id,
        ...(currentPromptId ? { promptId: currentPromptId } : {}),
        key,
        kind: 'turn'
      });
      return;
    }

    const turn = this.turns.get(this.turnKey(payload));
    if (!inherited && turn) parentContext = contextFromSpan(turn.span);
    if (inherited && turn) {
      appendLink(links, spanContextOf(turn.span), { 'claude.link.reason': 'logical_turn' });
    }

    if (event === 'PreToolUse') {
      const toolUseId = getString(payload, 'tool_use_id');
      if (!toolUseId) return;
      const existing = this.tools.get(toolUseId);
      if (existing) this.endRecovered(existing, timestamp, 'duplicate_start');
      const span = this.tracer.startSpan(
        'claude.tool.lifecycle',
        {
          startTime: timestamp,
          attributes: durationAttributes(envelope, 'tool', toolUseId),
          links
        },
        parentContext
      );
      const toolName = getString(payload, 'tool_name');
      this.tools.set(toolUseId, {
        span,
        startedAtMs: timestamp.getTime(),
        sessionId: payload.session_id,
        ...(currentPromptId ? { promptId: currentPromptId } : {}),
        key: toolUseId,
        kind: 'tool',
        toolUseId,
        ...(toolName ? { toolName } : {})
      });
      return;
    }

    if (event === 'MessageDisplay') {
      const messageIndex = getNumber(payload, 'index') ?? 0;
      if (messageIndex !== 0) return;
      const key = this.messageKey(payload);
      const span = this.tracer.startSpan(
        'claude.message.display',
        {
          startTime: timestamp,
          attributes: durationAttributes(envelope, 'message_display', key),
          links
        },
        parentContext
      );
      this.messages.set(key, {
        span,
        startedAtMs: timestamp.getTime(),
        sessionId: payload.session_id,
        ...(currentPromptId ? { promptId: currentPromptId } : {}),
        key,
        kind: 'message_display'
      });
      return;
    }

    if (event === 'SubagentStart') {
      const agentId = getString(payload, 'agent_id') ?? `${payload.session_id}:${timestamp.getTime()}`;
      const candidateAgentTools = [...this.tools.values()].filter(
        (record) =>
          record.sessionId === payload.session_id &&
          (currentPromptId === undefined || record.promptId === currentPromptId) &&
          (record.toolName === 'Agent' || record.toolName === 'Task')
      );
      const uniqueAgentTool = candidateAgentTools.length === 1 ? candidateAgentTools[0] : undefined;
      if (uniqueAgentTool) {
        appendLink(links, spanContextOf(uniqueAgentTool.span), {
          'claude.link.reason': 'probable_agent_spawn_tool',
          'claude.link.heuristic': true
        });
      }
      const span = this.tracer.startSpan(
        'claude.subagent',
        {
          startTime: timestamp,
          attributes: durationAttributes(envelope, 'subagent', agentId),
          links
        },
        parentContext
      );
      this.subagents.set(agentId, {
        span,
        startedAtMs: timestamp.getTime(),
        sessionId: payload.session_id,
        ...(currentPromptId ? { promptId: currentPromptId } : {}),
        key: agentId,
        kind: 'subagent'
      });
      return;
    }

    if (event === 'TaskCreated') {
      const taskId = getString(payload, 'task_id') ?? `${payload.session_id}:${timestamp.getTime()}`;
      const span = this.tracer.startSpan(
        'claude.task',
        {
          startTime: timestamp,
          attributes: durationAttributes(envelope, 'task', taskId),
          links
        },
        parentContext
      );
      this.tasks.set(taskId, {
        span,
        startedAtMs: timestamp.getTime(),
        sessionId: payload.session_id,
        ...(currentPromptId ? { promptId: currentPromptId } : {}),
        key: taskId,
        kind: 'task'
      });
      return;
    }

    if (event === 'PreCompact') {
      const key = this.compactKey(payload);
      const span = this.tracer.startSpan(
        'claude.compaction',
        {
          startTime: timestamp,
          attributes: durationAttributes(envelope, 'compaction', key),
          links
        },
        parentContext
      );
      this.compactions.set(key, {
        span,
        startedAtMs: timestamp.getTime(),
        sessionId: payload.session_id,
        ...(currentPromptId ? { promptId: currentPromptId } : {}),
        key,
        kind: 'compaction'
      });
      return;
    }

    if (event === 'Elicitation') {
      const key = this.elicitationKey(payload);
      const span = this.tracer.startSpan(
        'claude.elicitation',
        {
          startTime: timestamp,
          attributes: durationAttributes(envelope, 'elicitation', key),
          links
        },
        parentContext
      );
      this.elicitations.set(key, {
        span,
        startedAtMs: timestamp.getTime(),
        sessionId: payload.session_id,
        ...(currentPromptId ? { promptId: currentPromptId } : {}),
        key,
        kind: 'elicitation'
      });
    }
  }

  private resolvePointParentAndLinks(
    envelope: HookEnvelope,
    inherited: SpanContext | undefined
  ): { parentContext: Context; links: Link[] } {
    const payload = envelope.payload;
    const event = payload.hook_event_name;
    const currentPromptId = promptId(payload);
    const links: Link[] = [];
    let selectedSpan: Span | undefined;

    const toolUseId = getString(payload, 'tool_use_id');
    if (toolUseId) selectedSpan = this.tools.get(toolUseId)?.span;

    if (!selectedSpan && (event === 'PermissionRequest' || event === 'PermissionDenied')) {
      const toolName = getString(payload, 'tool_name');
      const candidates = [...this.tools.values()].filter(
        (record) =>
          record.sessionId === payload.session_id &&
          (currentPromptId === undefined || record.promptId === currentPromptId) &&
          (toolName === undefined || record.toolName === toolName)
      );
      if (candidates.length === 1) {
        const candidateSpan = candidates[0]?.span;
        appendLink(links, spanContextOf(candidateSpan), {
          'claude.link.reason': 'permission_to_open_tool',
          'claude.link.heuristic': true
        });
      }
    }

    if (!selectedSpan && event === 'MessageDisplay') selectedSpan = this.messages.get(this.messageKey(payload))?.span;
    if (!selectedSpan && event === 'SubagentStop') {
      selectedSpan = this.subagents.get(getString(payload, 'agent_id') ?? '')?.span;
    }
    if (!selectedSpan && event === 'TaskCompleted') {
      selectedSpan = this.tasks.get(getString(payload, 'task_id') ?? '')?.span;
    }
    if (!selectedSpan && event === 'PostCompact') selectedSpan = this.compactions.get(this.compactKey(payload))?.span;
    if (!selectedSpan && event === 'ElicitationResult') selectedSpan = this.elicitations.get(this.elicitationKey(payload))?.span;
    if (!selectedSpan) selectedSpan = this.turns.get(this.turnKey(payload))?.span;

    if (event === 'PostToolBatch') {
      const calls = getArray(payload, 'tool_calls') ?? [];
      for (const call of calls) {
        if (typeof call !== 'object' || call === null || Array.isArray(call)) continue;
        const callObject = call as JsonObject;
        const callId = getString(callObject, 'tool_use_id');
        if (!callId) continue;
        const context = this.tools.get(callId)?.span.spanContext() ?? this.completedTools.get(callId);
        appendLink(links, context, {
          'claude.link.reason': 'post_tool_batch_member',
          'claude.tool.use_id': callId
        });
      }
    }

    const selectedContext = spanContextOf(selectedSpan);
    if (inherited && selectedContext && !sameSpanContext(inherited, selectedContext)) {
      appendLink(links, inherited, { 'claude.link.reason': 'native_traceparent' });
    }

    if (!selectedSpan && !inherited) {
      const lastTurn = this.lastTurnBySession.get(payload.session_id);
      if (lastTurn) {
        appendLink(links, lastTurn, { 'claude.link.reason': 'last_completed_turn' });
      }
    }

    if (selectedSpan) return { parentContext: contextFromSpan(selectedSpan), links };
    if (inherited) return { parentContext: contextFromSpanContext(inherited), links };
    return { parentContext: ROOT_CONTEXT, links };
  }

  private finishDuration(envelope: HookEnvelope, timestamp: Date): void {
    const payload = envelope.payload;
    const event = payload.hook_event_name;
    let record: OpenSpanRecord | undefined;
    let map: Map<string, OpenSpanRecord> | undefined;
    let key: string | undefined;

    if (event === 'Stop' || event === 'StopFailure') {
      key = this.turnKey(payload);
      map = this.turns;
      record = map.get(key) ?? chooseOnlyOpenInSession(this.turns.values(), payload.session_id);
      if (record) key = record.key;
    } else if (event === 'PostToolUse' || event === 'PostToolUseFailure' || event === 'PermissionDenied') {
      key = getString(payload, 'tool_use_id');
      if (key) record = this.tools.get(key);
    } else if (event === 'MessageDisplay') {
      const final = getBoolean(payload, 'final') ?? false;
      if (final) {
        key = this.messageKey(payload);
        map = this.messages;
        record = map.get(key);
      }
    } else if (event === 'SubagentStop') {
      key = getString(payload, 'agent_id');
      map = this.subagents;
      if (key) record = map.get(key);
    } else if (event === 'TaskCompleted') {
      key = getString(payload, 'task_id');
      map = this.tasks;
      if (key) record = map.get(key);
    } else if (event === 'PostCompact') {
      key = this.compactKey(payload);
      map = this.compactions;
      record = map.get(key) ?? chooseOnlyOpenInSession(this.compactions.values(), payload.session_id);
      if (record) key = record.key;
    } else if (event === 'ElicitationResult') {
      key = this.elicitationKey(payload);
      map = this.elicitations;
      record = map.get(key) ?? chooseOnlyOpenInSession(this.elicitations.values(), payload.session_id);
      if (record) key = record.key;
    }

    if (!record) return;
    record.span.addEvent(`claude.lifecycle.${event}`, coreAttributes(envelope), timestamp);
    const status = normalizedStatus(event);
    if (status) record.span.setStatus(status);
    if (event === 'PostToolUseFailure' || event === 'StopFailure') {
      const message = getString(payload, 'error') ?? getString(payload, 'error_message') ?? event;
      record.span.recordException(new Error(message), timestamp);
    }
    record.span.setAttribute('claude.lifecycle.end_event', event);
    record.span.end(timestamp);

    if (record.kind === 'turn') {
      const context = spanContextOf(record.span);
      if (context) this.lastTurnBySession.set(record.sessionId, context);
    }
    if (record.kind === 'tool') {
      const tool = record as OpenToolRecord;
      const context = spanContextOf(tool.span);
      if (context) this.rememberCompletedTool(tool.toolUseId, context);
      this.tools.delete(tool.toolUseId);
    } else if (map && key) {
      map.delete(key);
    }
  }

  private rememberCompletedTool(toolUseId: string, context: SpanContext): void {
    this.completedTools.set(toolUseId, context);
    while (this.completedTools.size > 2_048) {
      const oldest = this.completedTools.keys().next().value as string | undefined;
      if (!oldest) break;
      this.completedTools.delete(oldest);
    }
  }

  private endRecovered(record: OpenSpanRecord, timestamp: Date, reason: string): void {
    record.span.setAttribute('claude.lifecycle.recovered_end', true);
    record.span.setAttribute('claude.lifecycle.recovered_reason', reason);
    record.span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
    record.span.end(timestamp);
  }

  private expireStale(nowMs: number): void {
    const collections: Array<Map<string, OpenSpanRecord> | Map<string, OpenToolRecord>> = [
      this.turns,
      this.tools,
      this.messages,
      this.subagents,
      this.tasks,
      this.compactions,
      this.elicitations
    ];
    for (const collection of collections) {
      for (const [key, record] of collection) {
        if (nowMs - record.startedAtMs <= this.config.openSpanTimeoutMs) continue;
        this.endRecovered(record, new Date(nowMs), 'open_span_timeout');
        collection.delete(key);
      }
    }
  }

  public shutdown(timestamp = new Date()): void {
    const collections: Array<Map<string, OpenSpanRecord> | Map<string, OpenToolRecord>> = [
      this.turns,
      this.tools,
      this.messages,
      this.subagents,
      this.tasks,
      this.compactions,
      this.elicitations
    ];
    for (const collection of collections) {
      for (const record of collection.values()) this.endRecovered(record, timestamp, 'bridge_shutdown');
      collection.clear();
    }
  }
}
