import {
  CopilotClient,
  RuntimeConnection,
  type CopilotSession,
  type PermissionHandler,
  type SessionEvent,
} from '@github/copilot-sdk';
import type { CopilotMcpConfig } from '../config.js';
import { sanitizePeerRequestId, traceContextIds, validateCarrier, type TelemetryCarrier } from '../telemetry-context.js';

export interface AskResult {
  answer: string;
  session_id: string;
  turn_ms: number;
  model: string | undefined;
  tool_calls: Array<{ tool: string; status: 'complete' | 'failed' }>;
}

export interface SessionInfo {
  session_id: string;
  created_at: string;
  last_used_at: string;
  model: string | undefined;
  event_count: number;
  peer_trace_id?: string;
  peer_span_id?: string;
  peer_request_id?: string;
  peer_transport?: string;
  peer_link_count?: number;
}

export interface PeerToolLinkContext {
  requestCarrier?: TelemetryCarrier;
  peerRequestId?: string;
  transport?: string;
  toolName?: string;
}

export interface RecordPeerLinkInput {
  server: string;
  toolName: string;
  status: 'complete' | 'failed';
  requestCarrier?: TelemetryCarrier;
  sessionId?: string;
  peerRequestId?: string;
  transport?: string;
}

interface TrackedSession {
  session: CopilotSession;
  createdAt: string;
  lastUsedAt: string;
  model: string | undefined;
  /** Bounded ring buffer of recent events (never grows past EVENT_BUFFER). */
  events: SessionEvent[];
  peerLinks: Array<Record<string, unknown>>;
  peerLinkKeys: Set<string>;
  unsubscribe: () => void;
}

const EVENT_BUFFER = 500;
const PEER_LINK_BUFFER = 200;

/** Permission kinds treated as read-only-safe under the "readonly" policy. */
const READONLY_KINDS = new Set(['read']);

/**
 * Owns exactly one wrapped Copilot CLI process (spawned by the SDK over
 * JSON-RPC, or attached via `cliUrl` to an external `copilot --headless`) and
 * a registry of live sessions with bounded event buffers.
 */
export class CopilotBridge {
  #client: CopilotClient | undefined;
  #starting: Promise<CopilotClient> | undefined;
  readonly #sessions = new Map<string, TrackedSession>();
  readonly #peerBySession = new Map<
    string,
    {
      traceId: string;
      spanId: string;
      requestId?: string;
      transport?: string;
      linkCount: number;
      firstSeenAt: string;
      lastSeenAt: string;
    }
  >();

  constructor(private readonly config: CopilotMcpConfig) {}

  async client(): Promise<CopilotClient> {
    if (this.#client) return this.#client;
    this.#starting ??= (async () => {
      const client = this.config.cliUrl
        ? new CopilotClient({ connection: RuntimeConnection.forUri(this.config.cliUrl) })
        : new CopilotClient();
      await client.start();
      this.#client = client;
      return client;
    })();
    try {
      return await this.#starting;
    } catch (error) {
      this.#starting = undefined;
      throw error;
    }
  }

  #permissionHandler(): PermissionHandler {
    if (this.config.permissions === 'approve-all') {
      return () => ({ kind: 'approve-once' });
    }
    return (request) =>
      READONLY_KINDS.has(request.kind)
        ? { kind: 'approve-once' }
        : { kind: 'reject' };
  }

  #sanitizeStableId(value: string | undefined, maxBytes = 128): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) return undefined;
    if (Buffer.byteLength(cleaned, 'utf8') <= maxBytes) return cleaned;
    let truncated = cleaned;
    while (truncated.length > 0 && Buffer.byteLength(truncated, 'utf8') > maxBytes) {
      truncated = truncated.slice(0, -1);
    }
    return truncated.length > 0 ? truncated : undefined;
  }

  #pushPeerLink(tracked: TrackedSession, event: Record<string, unknown>): void {
    tracked.peerLinks.push(event);
    if (tracked.peerLinks.length > PEER_LINK_BUFFER) {
      tracked.peerLinks.splice(0, tracked.peerLinks.length - PEER_LINK_BUFFER);
    }
  }

  recordPeerLink(input: RecordPeerLinkInput): void {
    const carrier = validateCarrier(input.requestCarrier ?? {});
    const ids = traceContextIds(carrier);
    if (!ids) return;
    const toolName = this.#sanitizeStableId(input.toolName, 64) ?? 'unknown';
    const status = input.status === 'failed' ? 'failed' : 'complete';
    const sessionId = this.#sanitizeStableId(input.sessionId, 128);
    const requestId = sanitizePeerRequestId(input.peerRequestId);
    const transport = this.#sanitizeStableId(input.transport, 32);
    const key = `${toolName}|${status}|${sessionId ?? ''}|${requestId ?? ''}|${ids.traceId}|${ids.spanId}`;
    const tracked = sessionId ? this.#sessions.get(sessionId) : undefined;
    if (tracked && tracked.peerLinkKeys.has(key)) return;

    const now = new Date().toISOString();
    if (sessionId) {
      const summary = this.#peerBySession.get(sessionId);
      if (!summary) {
        this.#peerBySession.set(sessionId, {
          traceId: ids.traceId,
          spanId: ids.spanId,
          ...(requestId !== undefined ? { requestId } : {}),
          ...(transport !== undefined ? { transport } : {}),
          linkCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
        });
      } else {
        summary.traceId = ids.traceId;
        summary.spanId = ids.spanId;
        if (requestId !== undefined) summary.requestId = requestId;
        if (transport !== undefined) summary.transport = transport;
        summary.linkCount += 1;
        summary.lastSeenAt = now;
      }
    }

    if (!sessionId) return;
    if (!tracked) return;
    tracked.peerLinkKeys.add(key);
    this.#pushPeerLink(tracked, {
      type: 'mcp.peer_link',
      timestamp: now,
      server: this.#sanitizeStableId(input.server, 64) ?? 'copilot-mcp',
      tool_name: toolName,
      status,
      trace_id: ids.traceId,
      span_id: ids.spanId,
      session_id: sessionId,
      ...(requestId !== undefined ? { peer_request_id: requestId } : {}),
      ...(transport !== undefined ? { peer_transport: transport } : {}),
    });
  }

  async createSession(model?: string, peer?: PeerToolLinkContext): Promise<SessionInfo> {
    const client = await this.client();
    const chosenModel = model ?? this.config.model;
    const session = await client.createSession({
      ...(chosenModel !== undefined ? { model: chosenModel } : {}),
      onPermissionRequest: this.#permissionHandler(),
    });
    const info = this.#track(session, chosenModel);
    if (peer) {
      this.recordPeerLink({
        server: 'copilot-mcp',
        toolName: peer.toolName || 'session_create',
        status: 'complete',
        requestCarrier: peer.requestCarrier,
        sessionId: info.session_id,
        peerRequestId: peer.peerRequestId,
        transport: peer.transport,
      });
    }
    return this.#info(this.#sessions.get(info.session_id)!);
  }

  #track(session: CopilotSession, model: string | undefined): SessionInfo {
    const now = new Date().toISOString();
    const events: SessionEvent[] = [];
    // Subscribe before any send so no lifecycle event is missed; tolerate
    // unknown event types (SDK is public preview).
    const unsubscribe = session.on((event) => {
      events.push(event);
      if (events.length > EVENT_BUFFER) events.splice(0, events.length - EVENT_BUFFER);
    });
    const tracked: TrackedSession = {
      session,
      createdAt: now,
      lastUsedAt: now,
      model,
      events,
      peerLinks: [],
      peerLinkKeys: new Set<string>(),
      unsubscribe,
    };
    this.#sessions.set(session.sessionId, tracked);
    return this.#info(tracked);
  }

  #info(tracked: TrackedSession): SessionInfo {
    const peer = this.#peerBySession.get(tracked.session.sessionId);
    return {
      session_id: tracked.session.sessionId,
      created_at: tracked.createdAt,
      last_used_at: tracked.lastUsedAt,
      model: tracked.model,
      event_count: tracked.events.length,
      ...(peer
        ? {
            peer_trace_id: peer.traceId,
            peer_span_id: peer.spanId,
            ...(peer.requestId !== undefined ? { peer_request_id: peer.requestId } : {}),
            ...(peer.transport !== undefined ? { peer_transport: peer.transport } : {}),
            peer_link_count: peer.linkCount,
          }
        : {}),
    };
  }

  async #resolve(sessionId: string | undefined, model?: string): Promise<TrackedSession> {
    if (sessionId !== undefined) {
      const tracked = this.#sessions.get(sessionId);
      if (!tracked) throw new Error(`unknown session_id: ${sessionId}`);
      return tracked;
    }
    const info = await this.createSession(model);
    const tracked = this.#sessions.get(info.session_id);
    if (!tracked) throw new Error('session vanished during creation');
    return tracked;
  }

  /**
   * The headline call: send a prompt into the wrapped agentic Copilot process
   * and wait for the completed turn. `sendAndWait` resolves on the session's
   * idle signal — the completed-turn contract — with a hard timeout guard.
   */
  async ask(opts: {
    prompt: string;
    session_id?: string;
    model?: string;
    timeout_ms?: number;
  }, peer?: PeerToolLinkContext): Promise<AskResult> {
    const tracked = await this.#resolve(opts.session_id, opts.model);
    const timeout = opts.timeout_ms ?? this.config.askTimeoutMs;
    const started = Date.now();
    const eventsBefore = tracked.events.length;
    try {
      const message = await tracked.session.sendAndWait({ prompt: opts.prompt }, timeout);
      tracked.lastUsedAt = new Date().toISOString();

      const turnEvents = tracked.events.slice(eventsBefore);
      // Root-agent text only: sub-agent events share the stream (agentId set)
      // and would duplicate or pollute the answer.
      const answer =
        message !== undefined && message.agentId === undefined
          ? extractText(message)
          : turnEvents
              .filter(
                (e): e is SessionEvent & { type: 'assistant.message' } =>
                  e.type === 'assistant.message' && (e as { agentId?: string }).agentId === undefined,
              )
              .map((e) => extractText(e))
              .join('\n');

      const tool_calls = turnEvents
        .filter((e) => e.type === 'tool.execution_complete')
        .map((e) => {
          const data = (e as { data?: { toolName?: string; success?: boolean } }).data ?? {};
          return {
            tool: data.toolName ?? 'unknown',
            status: data.success === false ? ('failed' as const) : ('complete' as const),
          };
        });

      const output = {
        answer,
        session_id: tracked.session.sessionId,
        turn_ms: Date.now() - started,
        model: tracked.model,
        tool_calls,
      };
      if (peer) {
        this.recordPeerLink({
          server: 'copilot-mcp',
          toolName: peer.toolName || 'ask',
          status: 'complete',
          requestCarrier: peer.requestCarrier,
          sessionId: output.session_id,
          peerRequestId: peer.peerRequestId,
          transport: peer.transport,
        });
      }
      return output;
    } catch (error) {
      if (peer) {
        this.recordPeerLink({
          server: 'copilot-mcp',
          toolName: peer.toolName || 'ask',
          status: 'failed',
          requestCarrier: peer.requestCarrier,
          sessionId: tracked.session.sessionId,
          peerRequestId: peer.peerRequestId,
          transport: peer.transport,
        });
      }
      throw error;
    }
  }

  /** Fast-path agent-liveness responder for the marco signal. */
  async respondToMarco(input: string): Promise<string> {
    const result = await this.ask({
      prompt: `Liveness check. Reply with exactly the single word "polo" and nothing else. (Signal received: ${input})`,
      timeout_ms: 60_000,
    });
    return result.answer.trim();
  }

  listSessions(): SessionInfo[] {
    return [...this.#sessions.values()].map((t) => this.#info(t));
  }

  /** Recent (sanitized) events for a session, newest last. */
  sessionEvents(sessionId: string, since?: number): Array<Record<string, unknown>> {
    const tracked = this.#sessions.get(sessionId);
    if (!tracked) throw new Error(`unknown session_id: ${sessionId}`);
    const nativeEvents = tracked.events.map(sanitizeEvent);
    const combined = [...nativeEvents, ...tracked.peerLinks].sort((left, right) =>
      String(left['timestamp'] ?? '').localeCompare(String(right['timestamp'] ?? '')),
    );
    return since !== undefined ? combined.slice(-Math.max(0, since)) : combined;
  }

  async destroySession(sessionId: string, opts: { delete?: boolean } = {}): Promise<void> {
    const tracked = this.#sessions.get(sessionId);
    if (!tracked) throw new Error(`unknown session_id: ${sessionId}`);
    tracked.unsubscribe();
    this.#sessions.delete(sessionId);
    this.#peerBySession.delete(sessionId);
    await tracked.session.disconnect();
    if (opts.delete) await (await this.client()).deleteSession(sessionId);
  }

  async listModels(): Promise<Array<{ id: string; name?: string }>> {
    const client = await this.client();
    const models = await client.listModels();
    return models.map((m) => {
      const raw = m as unknown as Record<string, unknown>;
      const id = typeof raw['id'] === 'string' ? (raw['id'] as string) : String(raw['modelId'] ?? raw['name'] ?? 'unknown');
      const name = typeof raw['name'] === 'string' ? (raw['name'] as string) : undefined;
      return { id, ...(name !== undefined ? { name } : {}) };
    });
  }

  async status(): Promise<Record<string, unknown>> {
    const client = await this.client();
    const [pong, status] = await Promise.all([client.ping('copilot-mcp'), client.getStatus()]);
    const peerLinks = this.listSessions()
      .filter((session) => session.peer_trace_id !== undefined)
      .map((session) => ({
        session_id: session.session_id,
        peer_trace_id: session.peer_trace_id,
        ...(session.peer_span_id !== undefined ? { peer_span_id: session.peer_span_id } : {}),
        ...(session.peer_request_id !== undefined ? { peer_request_id: session.peer_request_id } : {}),
        ...(session.peer_transport !== undefined ? { peer_transport: session.peer_transport } : {}),
        ...(session.peer_link_count !== undefined ? { peer_link_count: session.peer_link_count } : {}),
      }));
    return {
      cli: status as unknown as Record<string, unknown>,
      ping: pong,
      permissions: this.config.permissions,
      sessions: this.listSessions().length,
      connection: this.config.cliUrl ?? 'sdk-managed child process',
      peer_links: peerLinks,
    };
  }

  /** Blow the bridge state up to nothing (blast-timer detonation, shutdown). */
  async destroyAll(): Promise<void> {
    const ids = [...this.#sessions.keys()];
    await Promise.allSettled(ids.map((id) => this.destroySession(id)));
    if (this.#client) {
      const client = this.#client;
      this.#client = undefined;
      this.#starting = undefined;
      await client.stop();
    }
  }
}

function extractText(event: unknown): string {
  const data = (event as { data?: { content?: unknown } }).data;
  const content = data?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === 'string' ? block : typeof (block as { text?: string }).text === 'string' ? (block as { text: string }).text : '',
      )
      .join('');
  }
  return '';
}

/**
 * Redaction per the harness research doc: withhold reasoning content and
 * drop verbose tool `detailedContent` (may carry diffs/secrets the model
 * never saw); keep lineage fields for trace reconstruction.
 */
function sanitizeEvent(event: SessionEvent): Record<string, unknown> {
  const raw = event as unknown as {
    id: string;
    parentId: string | null;
    agentId?: string;
    timestamp: string;
    type: string;
    ephemeral?: boolean;
    data?: unknown;
  };
  const base: Record<string, unknown> = {
    id: raw.id,
    parent_id: raw.parentId,
    ...(raw.agentId !== undefined ? { agent_id: raw.agentId } : {}),
    timestamp: raw.timestamp,
    type: raw.type,
    ...(raw.ephemeral !== undefined ? { ephemeral: raw.ephemeral } : {}),
  };
  if (raw.type.startsWith('assistant.reasoning')) {
    return { ...base, data: { withheld: true } };
  }
  if (raw.type === 'tool.execution_complete') {
    const data = (raw.data ?? {}) as Record<string, unknown>;
    const result = (data['result'] ?? {}) as Record<string, unknown>;
    return {
      ...base,
      data: {
        toolName: data['toolName'],
        toolCallId: data['toolCallId'],
        success: data['success'],
        result: { content: result['content'] },
      },
    };
  }
  return { ...base, data: raw.data };
}
