#!/usr/bin/env node
/**
 * stdio entry: newline-delimited JSON-RPC over stdin/stdout (the transport
 * Claude Code, Codex, and Cursor spawn). All diagnostics go to stderr —
 * stdout is the protocol channel.
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BlastTimer } from '@agent-fannypack/mcp';
import { loadConfig } from '../config.js';
import { CopilotBridge } from '../bridge/copilot-bridge.js';
import { buildServer } from '../server.js';

const config = loadConfig();
const bridge = new CopilotBridge(config);
const timer = new BlastTimer();

// Registered once on the shared timer (the serve factory may run per
// connection; per-call registration would stack duplicate callbacks).
timer.onExpire(async () => {
  // Blown up to nothing: destroy every copilot session, stop the CLI
  // child, and take the connection down with a non-zero exit.
  console.error('[copilot-mcp] blast timer detonated — tearing connection down');
  await bridge.destroyAll();
  process.exit(1);
});

serveStdio(() => buildServer({ bridge, timer }), {
  onerror: (error) => console.error('[copilot-mcp] stdio error:', error),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void bridge.destroyAll().finally(() => process.exit(0));
  });
}
