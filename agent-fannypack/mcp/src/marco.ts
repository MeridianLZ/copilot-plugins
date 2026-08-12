import { z } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';

/**
 * Host hook that routes the incoming "marco" into the agent's ask/input path.
 * The receiving agent should reply "polo" as quickly as possible.
 */
export type MarcoRespond = (input: string) => string | Promise<string>;

export interface MarcoOptions {
  /** Tool name override. Default: "marco". */
  name?: string;
  /**
   * Injected agent pipeline. When omitted the tool answers "polo" from the
   * server process itself (degrades to transport-level liveness).
   */
  respond?: MarcoRespond;
  /** Abort the round trip after this many milliseconds. Default 30000. */
  timeoutMs?: number;
}

export interface MarcoResult {
  reply: string;
  rtt_ms: number;
  /** True when the reply is exactly "polo" (case/whitespace tolerant). */
  ok: boolean;
}

const inputSchema = z.object({
  payload: z
    .string()
    .optional()
    .describe('Signal string forwarded to the receiving agent. Default "marco".'),
});

const outputSchema = z.object({
  reply: z.string(),
  rtt_ms: z.number(),
  ok: z.boolean(),
});

/**
 * Agent-liveness signal (symmetric: register it in BOTH the primary and
 * secondary tool sets). The sender emits "marco" into the receiver's
 * ask/input pipeline via the injected `respond`; the receiver replies "polo"
 * as quickly as possible. Unlike `ping`, a healthy reply proves the agent
 * behind the connection is responsive, not just the transport.
 */
export function registerMarco(server: McpServer, opts: MarcoOptions = {}): RegisteredTool {
  const respond: MarcoRespond = opts.respond ?? (() => 'polo');
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return server.registerTool(
    opts.name ?? 'marco',
    {
      title: 'Marco',
      description:
        'Agent-to-agent liveness round trip: forwards "marco" into the receiving agent\'s ask/input path; the agent replies "polo" as quickly as possible.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ payload }) => {
      const started = Date.now();
      const reply = await withTimeout(Promise.resolve(respond(payload ?? 'marco')), timeoutMs);
      const output: MarcoResult = {
        reply,
        rtt_ms: Date.now() - started,
        ok: reply.trim().toLowerCase() === 'polo',
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
}

/**
 * Emitter-side helper for the primary agent. Transport-agnostic: pass any
 * `callTool(name, args)` closure (MCP client, test harness, …).
 */
export async function sendMarco(
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  opts: { name?: string; payload?: string; timeoutMs?: number } = {},
): Promise<MarcoResult> {
  const started = Date.now();
  const raw = await withTimeout(
    callTool(opts.name ?? 'marco', { payload: opts.payload ?? 'marco' }),
    opts.timeoutMs ?? 30_000,
  );
  const reply = extractReply(raw);
  return { reply, rtt_ms: Date.now() - started, ok: reply.trim().toLowerCase() === 'polo' };
}

function extractReply(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw !== null && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const structured = o['structuredContent'];
    if (structured !== null && typeof structured === 'object') {
      const reply = (structured as Record<string, unknown>)['reply'];
      if (typeof reply === 'string') return reply;
    }
    const content = o['content'];
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block !== null && typeof block === 'object' && (block as { type?: string }).type === 'text') {
          const text = (block as { text?: string }).text ?? '';
          try {
            const parsed = JSON.parse(text) as { reply?: unknown };
            if (typeof parsed.reply === 'string') return parsed.reply;
          } catch {
            return text;
          }
        }
      }
    }
    const reply = o['reply'];
    if (typeof reply === 'string') return reply;
  }
  return String(raw);
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        handle = setTimeout(() => reject(new Error(`marco timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}
