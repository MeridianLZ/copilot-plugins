import { z } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';

export interface PingOptions {
  /** Tool name override. Default: "ping". */
  name?: string;
  /** Extra fields merged into the pong payload (e.g. server identity). */
  identity?: Record<string, string>;
}

export interface PongPayload {
  pong: true;
  ts: string;
  uptime_ms: number;
  echo?: string;
  identity?: Record<string, string>;
}

const inputSchema = z.object({
  echo: z.string().optional().describe('Optional payload echoed back verbatim'),
});

const outputSchema = z.object({
  pong: z.literal(true),
  ts: z.string(),
  uptime_ms: z.number(),
  echo: z.string().optional(),
  identity: z.record(z.string(), z.string()).optional(),
});

/**
 * Transport-liveness signal. The pong is produced synchronously by the MCP
 * server process itself — no model or agent in the loop — so it answers on the
 * open tool connection regardless of agent status.
 */
export function registerPing(server: McpServer, opts: PingOptions = {}): RegisteredTool {
  const registeredAt = Date.now();
  return server.registerTool(
    opts.name ?? 'ping',
    {
      title: 'Ping',
      description:
        'Agent-to-agent transport liveness probe. Pongs the open MCP connection immediately, regardless of agent status.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ echo }) => {
      const output: PongPayload = {
        pong: true,
        ts: new Date().toISOString(),
        uptime_ms: Date.now() - registeredAt,
        ...(echo !== undefined ? { echo } : {}),
        ...(opts.identity !== undefined ? { identity: opts.identity } : {}),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
}
