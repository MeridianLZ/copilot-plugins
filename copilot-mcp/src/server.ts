import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  BlastTimer,
  registerBlastTimer,
  registerMarco,
  registerPing,
  withCheckIn,
} from '@agent-fannypack/mcp';
import type { CopilotBridge } from './bridge/copilot-bridge.js';
import { loadConfig } from './config.js';
import { loadPersonas, type Persona } from './personas.js';

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
  /** Persona tools to expose (default: loaded from config personaDir). */
  personas?: Persona[];
}

const sessionInfoSchema = z.object({
  session_id: z.string(),
  created_at: z.string(),
  last_used_at: z.string(),
  model: z.string().optional(),
  event_count: z.number(),
});

function textResult<T>(output: T): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: T;
} {
  return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
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
      const result = await bridge.ask(args);
      const { model, ...rest } = result;
      return textResult({ ...rest, ...(model !== undefined ? { model } : {}) });
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
      const info = await bridge.createSession({ ...(model !== undefined ? { model } : {}) });
      const { model: m, ...rest } = info;
      return textResult({ ...rest, ...(m !== undefined ? { model: m } : {}) });
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
    withCheckIn(timer, async () =>
      textResult({
        sessions: bridge.listSessions().map(({ model, ...rest }) => ({
          ...rest,
          ...(model !== undefined ? { model } : {}),
        })),
      }),
    ),
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
    withCheckIn(timer, async ({ session_id, last }: { session_id: string; last?: number }) =>
      textResult({ events: bridge.sessionEvents(session_id, last) }),
    ),
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
      await bridge.destroySession(session_id, { ...(del !== undefined ? { delete: del } : {}) });
      return textResult({ destroyed: true as const, session_id });
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
      const models = await bridge.listModels();
      return textResult({ models: models.map(({ id, name }) => ({ id, ...(name !== undefined ? { name } : {}) })) });
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
    withCheckIn(timer, async () => textResult(await bridge.status())),
  );

  // --- Peer persona tools (chewy / buzz / goose) -------------------------
  // Each tool is a first-class peer copilot: same contract as `ask`, but the
  // session pins a single SDK custom agent (agent select-at-create, infer:false)
  // built from the persona's fused markdown and its .agent.md-pinned model.
  // session_id persists the peer's context.
  const personas = opts.personas ?? loadPersonas(loadConfig().personaDir);
  for (const persona of personas) {
    server.registerTool(
      persona.name,
      {
        title: `Ask peer copilot ${persona.name}`,
        description: persona.description,
        inputSchema: z.object({
          prompt: z.string().describe(`The question/task for ${persona.name}`),
          session_id: z.string().optional().describe('Continue this peer\'s existing session'),
          timeout_ms: z.number().positive().optional().describe('Turn timeout override'),
        }),
        outputSchema: z.object({
          answer: z.string(),
          session_id: z.string(),
          turn_ms: z.number(),
          model: z.string().optional(),
          tool_calls: z.array(
            z.object({ tool: z.string(), status: z.enum(['complete', 'failed']) }),
          ),
        }),
      },
      withCheckIn(
        timer,
        async (args: { prompt: string; session_id?: string; timeout_ms?: number }) => {
          const result = await bridge.ask({
            ...args,
            persona: {
              name: persona.name,
              displayName: persona.name.charAt(0).toUpperCase() + persona.name.slice(1),
              description: persona.description,
              prompt: persona.systemMessage,
              ...(persona.model !== undefined ? { model: persona.model } : {}),
            },
          });
          const { model, ...rest } = result;
          return textResult({ ...rest, ...(model !== undefined ? { model } : {}) });
        },
      ),
    );
  }

  return server;
}
