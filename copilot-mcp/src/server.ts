import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  BlastTimer,
  registerBlastTimer,
  registerMarco,
  registerPing,
  withCheckIn,
} from '@agent-fannypack/mcp';
import type { CopilotBridge, PeerToolLinkContext } from './bridge/copilot-bridge.js';
import { activePeerRequestContext, sanitizePeerRequestId, validateCarrier, type TelemetryCarrier } from './telemetry-context.js';

export const SERVER_NAME = 'copilot-mcp';
export const SERVER_VERSION = '0.1.0';

export interface BuildServerOptions {
  bridge: CopilotBridge;
  /**
   * Shared dead-man watchdog. One per process so stateless HTTP handlers
   * (fresh McpServer per request) still arm/reset the same countdown.
   */
  timer?: BlastTimer;
  /** What "blown up to nothing" means for the hosting transport. */
  onDetonate?: () => void | Promise<void>;
  /** Per-request inherited telemetry context (typically extracted from params._meta). */
  requestCarrier?: TelemetryCarrier;
  /** Peer request identity from the outer transport/message envelope. */
  peerRequestId?: string;
  /** Best-effort transport hint (stdio/http/ws). */
  transport?: string;
}

const sessionInfoSchema = z.object({
  session_id: z.string(),
  created_at: z.string(),
  last_used_at: z.string(),
  model: z.string().optional(),
  event_count: z.number(),
  peer_trace_id: z.string().optional(),
  peer_span_id: z.string().optional(),
  peer_request_id: z.string().optional(),
  peer_transport: z.string().optional(),
  peer_link_count: z.number().optional(),
});

function textResult<T>(output: T): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: T;
} {
  return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
}

function resolvePeerContext(opts: BuildServerOptions, toolName: string): PeerToolLinkContext | undefined {
  const active = activePeerRequestContext();
  const requestCarrier = validateCarrier(active?.requestCarrier ?? opts.requestCarrier ?? {});
  if (!requestCarrier.traceparent) return undefined;
  const peerRequestId = sanitizePeerRequestId(active?.peerRequestId ?? opts.peerRequestId);
  const transport = active?.transport ?? opts.transport;
  return {
    requestCarrier,
    ...(peerRequestId !== undefined ? { peerRequestId } : {}),
    ...(transport !== undefined ? { transport } : {}),
    toolName,
  };
}

function recordPeer(
  bridge: CopilotBridge,
  peer: PeerToolLinkContext | undefined,
  status: 'complete' | 'failed',
  sessionId?: string,
): void {
  if (!peer) return;
  bridge.recordPeerLink({
    server: SERVER_NAME,
    toolName: peer.toolName ?? 'unknown',
    status,
    ...(peer.transport !== undefined ? { transport: peer.transport } : {}),
    ...(peer.peerRequestId !== undefined ? { peerRequestId: peer.peerRequestId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    requestCarrier: peer.requestCarrier,
  });
}

/**
 * MCP server exposing the wrapped Copilot CLI process. Fresh instances are
 * cheap: all real state lives in the shared {@link CopilotBridge} and the
 * shared {@link BlastTimer}.
 */
export function buildServer(opts: BuildServerOptions): McpServer {
  const { bridge } = opts;
  const timer = opts.timer ?? new BlastTimer();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'Wraps a full GitHub Copilot CLI agentic process. Use `ask` to query Copilot; sessions persist across calls via session_id. ping/marco/blast_timer are agent-to-agent liveness signals.',
    },
  );

  // --- @agent-fannypack/mcp signals -------------------------------------
  registerPing(server, { identity: { server: SERVER_NAME, version: SERVER_VERSION } });
  registerMarco(server, { respond: (input) => bridge.respondToMarco(input) });
  registerBlastTimer(server, {
    timer,
    ...(opts.onDetonate !== undefined ? { onDetonate: opts.onDetonate } : {}),
  });

  // --- Copilot tools (every action call doubles as a watchdog check-in) --
  server.registerTool(
    'ask',
    {
      title: 'Ask Copilot',
      description:
        'Send a prompt to the wrapped GitHub Copilot CLI agent and wait for the completed turn. Reuses a session when session_id is given; otherwise creates one.',
      inputSchema: z.object({
        prompt: z.string().describe('The prompt/question for Copilot'),
        session_id: z.string().optional().describe('Continue an existing session'),
        model: z.string().optional().describe('Model for a newly created session'),
        timeout_ms: z.number().positive().optional().describe('Turn timeout override'),
      }),
      outputSchema: z.object({
        answer: z.string(),
        session_id: z.string(),
        turn_ms: z.number(),
        model: z.string().optional(),
        tool_calls: z.array(z.object({ tool: z.string(), status: z.enum(['complete', 'failed']) })),
      }),
    },
    withCheckIn(timer, async (args: { prompt: string; session_id?: string; model?: string; timeout_ms?: number }) => {
      const peer = resolvePeerContext(opts, 'ask');
      try {
        const result = await bridge.ask(args, peer);
        recordPeer(bridge, peer, 'complete', result.session_id);
        const { model, ...rest } = result;
        return textResult({ ...rest, ...(model !== undefined ? { model } : {}) });
      } catch (error) {
        recordPeer(bridge, peer, 'failed', args.session_id);
        throw error;
      }
    }),
  );

  server.registerTool(
    'session_create',
    {
      title: 'Create Copilot session',
      description: 'Create a persistent Copilot session for multi-turn conversations.',
      inputSchema: z.object({ model: z.string().optional() }),
      outputSchema: sessionInfoSchema,
    },
    withCheckIn(timer, async ({ model }: { model?: string }) => {
      const peer = resolvePeerContext(opts, 'session_create');
      try {
        const info = await bridge.createSession(model, peer);
        recordPeer(bridge, peer, 'complete', info.session_id);
        const { model: m, ...rest } = info;
        return textResult({ ...rest, ...(m !== undefined ? { model: m } : {}) });
      } catch (error) {
        recordPeer(bridge, peer, 'failed');
        throw error;
      }
    }),
  );

  server.registerTool(
    'session_list',
    {
      title: 'List Copilot sessions',
      description: 'List live sessions owned by this server.',
      inputSchema: z.object({}),
      outputSchema: z.object({ sessions: z.array(sessionInfoSchema) }),
      annotations: { readOnlyHint: true },
    },
    withCheckIn(timer, async () => {
      const peer = resolvePeerContext(opts, 'session_list');
      try {
        const result = textResult({
          sessions: bridge.listSessions().map(({ model, ...rest }) => ({
            ...rest,
            ...(model !== undefined ? { model } : {}),
          })),
        });
        recordPeer(bridge, peer, 'complete');
        return result;
      } catch (error) {
        recordPeer(bridge, peer, 'failed');
        throw error;
      }
    }),
  );

  server.registerTool(
    'session_events',
    {
      title: 'Session events',
      description:
        'Recent lifecycle/tool events for a session (sanitized: reasoning withheld, verbose tool output dropped). Newest last.',
      inputSchema: z.object({
        session_id: z.string(),
        last: z.number().positive().optional().describe('Only the last N events'),
      }),
      outputSchema: z.object({ events: z.array(z.looseObject({})) }),
      annotations: { readOnlyHint: true },
    },
    withCheckIn(timer, async ({ session_id, last }: { session_id: string; last?: number }) => {
      const peer = resolvePeerContext(opts, 'session_events');
      try {
        const result = textResult({ events: bridge.sessionEvents(session_id, last) });
        recordPeer(bridge, peer, 'complete', session_id);
        return result;
      } catch (error) {
        recordPeer(bridge, peer, 'failed', session_id);
        throw error;
      }
    }),
  );

  server.registerTool(
    'session_destroy',
    {
      title: 'Destroy Copilot session',
      description:
        'Disconnect a session (resumable later). Set delete=true to permanently remove its on-disk state.',
      inputSchema: z.object({
        session_id: z.string(),
        delete: z.boolean().optional(),
      }),
      outputSchema: z.object({ destroyed: z.literal(true), session_id: z.string() }),
    },
    withCheckIn(timer, async ({ session_id, delete: del }: { session_id: string; delete?: boolean }) => {
      const peer = resolvePeerContext(opts, 'session_destroy');
      try {
        await bridge.destroySession(session_id, { ...(del !== undefined ? { delete: del } : {}) });
        recordPeer(bridge, peer, 'complete', session_id);
        return textResult({ destroyed: true as const, session_id });
      } catch (error) {
        recordPeer(bridge, peer, 'failed', session_id);
        throw error;
      }
    }),
  );

  server.registerTool(
    'models_list',
    {
      title: 'List Copilot models',
      description: 'Models available to the wrapped Copilot CLI.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        models: z.array(z.object({ id: z.string(), name: z.string().optional() })),
      }),
      annotations: { readOnlyHint: true },
    },
    withCheckIn(timer, async () => {
      const peer = resolvePeerContext(opts, 'models_list');
      try {
        const models = await bridge.listModels();
        const result = textResult({ models: models.map(({ id, name }) => ({ id, ...(name !== undefined ? { name } : {}) })) });
        recordPeer(bridge, peer, 'complete');
        return result;
      } catch (error) {
        recordPeer(bridge, peer, 'failed');
        throw error;
      }
    }),
  );

  server.registerTool(
    'status',
    {
      title: 'Copilot process status',
      description: 'Wrapped CLI process state: version, auth, connection mode, session count, permission policy.',
      inputSchema: z.object({}),
      outputSchema: z.looseObject({}),
      annotations: { readOnlyHint: true },
    },
    withCheckIn(timer, async () => {
      const peer = resolvePeerContext(opts, 'status');
      try {
        const result = textResult(await bridge.status());
        recordPeer(bridge, peer, 'complete');
        return result;
      } catch (error) {
        recordPeer(bridge, peer, 'failed');
        throw error;
      }
    }),
  );

  return server;
}
