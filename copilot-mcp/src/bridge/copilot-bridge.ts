import {
  CopilotClient,
  RuntimeConnection,
  type CopilotSession,
  type PermissionHandler,
  type SessionEvent,
} from '@github/copilot-sdk';
import type { CopilotMcpConfig } from '../config.js';

/** Peer persona pinned to a session via SDK customAgents + agent select-at-create. */
export interface SessionPersona {
  name: string;
  displayName?: string;
  description?: string;
  /** The persona instructions (CustomAgentConfig.prompt). */
  prompt: string;
  model?: string;
}

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
}

interface TrackedSession {
  session: CopilotSession;
  createdAt: string;
  lastUsedAt: string;
  model: string | undefined;
  /** Bounded ring buffer of recent events (never grows past EVENT_BUFFER). */
  events: SessionEvent[];
  unsubscribe: () => void;
}

const EVENT_BUFFER = 500;

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

  async createSession(
    opts: { model?: string; systemMessage?: string; persona?: SessionPersona } = {},
  ): Promise<SessionInfo> {
    const client = await this.client();
    const chosenModel = opts.model ?? opts.persona?.model ?? this.config.model;
    const session = await client.createSession({
      ...(chosenModel !== undefined ? { model: chosenModel } : {}),
      ...(opts.systemMessage !== undefined
        ? { systemMessage: { mode: 'append' as const, content: opts.systemMessage } }
        : {}),
      // Persona = single custom agent pinned from the first prompt (`agent`
      // select-at-create beats a post-create select() racing the first send).
      // infer:false so the runtime never auto-delegates away from the pin.
      // NOTE: systemMessage {mode:'replace'} is deliberately never used — the
      // SDK documents it as removing all guardrails incl. security restrictions.
      ...(opts.persona !== undefined
        ? {
            customAgents: [
              {
                name: opts.persona.name,
                ...(opts.persona.displayName !== undefined
                  ? { displayName: opts.persona.displayName }
                  : {}),
                ...(opts.persona.description !== undefined
                  ? { description: opts.persona.description }
                  : {}),
                prompt: opts.persona.prompt,
                ...(chosenModel !== undefined ? { model: chosenModel } : {}),
                infer: false,
              },
            ],
            agent: opts.persona.name,
          }
        : {}),
      onPermissionRequest: this.#permissionHandler(),
    });
    return this.#track(session, chosenModel);
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
      unsubscribe,
    };
    this.#sessions.set(session.sessionId, tracked);
    return this.#info(tracked);
  }

  #info(tracked: TrackedSession): SessionInfo {
    return {
      session_id: tracked.session.sessionId,
      created_at: tracked.createdAt,
      last_used_at: tracked.lastUsedAt,
      model: tracked.model,
      event_count: tracked.events.length,
    };
  }

  async #resolve(
    sessionId: string | undefined,
    opts: { model?: string; systemMessage?: string; persona?: SessionPersona } = {},
  ): Promise<TrackedSession> {
    if (sessionId !== undefined) {
      const tracked = this.#sessions.get(sessionId);
      if (!tracked) throw new Error(`unknown session_id: ${sessionId}`);
      return tracked;
    }
    const info = await this.createSession(opts);
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
    /** Cross-cutting instructions appended when this ask creates the session. */
    systemMessage?: string;
    /** Peer persona pinned when this ask creates the session. */
    persona?: SessionPersona;
  }): Promise<AskResult> {
    const tracked = await this.#resolve(opts.session_id, {
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.systemMessage !== undefined ? { systemMessage: opts.systemMessage } : {}),
      ...(opts.persona !== undefined ? { persona: opts.persona } : {}),
    });
    const timeout = opts.timeout_ms ?? this.config.askTimeoutMs;
    const started = Date.now();
    const eventsBefore = tracked.events.length;

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

    return {
      answer,
      session_id: tracked.session.sessionId,
      turn_ms: Date.now() - started,
      model: tracked.model,
      tool_calls,
    };
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
    const events = since !== undefined ? tracked.events.slice(-Math.max(0, since)) : tracked.events;
    return events.map(sanitizeEvent);
  }

  async destroySession(sessionId: string, opts: { delete?: boolean } = {}): Promise<void> {
    const tracked = this.#sessions.get(sessionId);
    if (!tracked) throw new Error(`unknown session_id: ${sessionId}`);
    tracked.unsubscribe();
    this.#sessions.delete(sessionId);
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
    return {
      cli: status as unknown as Record<string, unknown>,
      ping: pong,
      permissions: this.config.permissions,
      sessions: this.listSessions().length,
      connection: this.config.cliUrl ?? 'sdk-managed child process',
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
