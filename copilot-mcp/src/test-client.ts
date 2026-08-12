#!/usr/bin/env tsx
/**
 * Live-fire MCP client: exercises copilot-mcp over stdio, Streamable HTTP,
 * and WebSocket — tools/list, ping, marco, blast timer, and a real `ask`
 * against the wrapped Copilot CLI.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import WebSocket from 'ws';
import type { Transport, JSONRPCMessage } from '@modelcontextprotocol/client';
import { sendMarco } from '@agent-fannypack/mcp';
import { isJsonRpcMessage } from './jsonrpc/types.js';
import { loadConfig } from './config.js';

interface Options {
  transport: 'stdio' | 'http' | 'ws' | 'all';
  ask: boolean;
  signals: boolean;
  blast: boolean;
  help: boolean;
}

function Usage(): string {
  return `Usage: test-client [options]

Live-fire verification client for copilot-mcp.

Options:
  -t, --transport MODE   stdio | http | ws | all (default: all)
  -a, --ask              Include a real Copilot ask ("What is 2+2?")
  -s, --signals          Include marco (agent round-trip through Copilot)
  -b, --blast            Include blast-timer arm/check-in/status cycle
  -h, --help             Show this help
`;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { transport: 'all', ask: false, signals: false, blast: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '-t':
      case '--transport': {
        const value = argv[++i];
        if (value !== 'stdio' && value !== 'http' && value !== 'ws' && value !== 'all') {
          throw new Error(`--transport must be stdio|http|ws|all, got ${value}`);
        }
        options.transport = value;
        break;
      }
      case '-a':
      case '--ask':
        options.ask = true;
        break;
      case '-s':
      case '--signals':
        options.signals = true;
        break;
      case '-b':
      case '--blast':
        options.blast = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${argv[i]}. Run with --help.`);
    }
  }
  return options;
}

/** Client-side WS transport: one JSON-RPC message per text frame (SEP-1287). */
class WsClientTransport implements Transport {
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;
  #ws: WebSocket | undefined;

  constructor(private readonly url: string) {}

  async start(): Promise<void> {
    const ws = new WebSocket(this.url);
    this.#ws = ws;
    ws.on('message', (data) => {
      const parsed: unknown = JSON.parse(String(data));
      if (isJsonRpcMessage(parsed)) this.onmessage?.(parsed as JSONRPCMessage);
    });
    ws.on('close', () => this.onclose?.());
    ws.on('error', (error) => this.onerror?.(error));
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const ws = this.#ws;
    if (!ws) throw new Error('WS transport not started');
    await new Promise<void>((resolve, reject) => {
      ws.send(JSON.stringify(message), (error) => (error ? reject(error) : resolve()));
    });
  }

  async close(): Promise<void> {
    this.#ws?.close();
  }
}

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function inheritedEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function makeTransport(kind: 'stdio' | 'http' | 'ws', baseUrl: string): Transport {
  switch (kind) {
    case 'stdio':
      return new StdioClientTransport({
        command: process.execPath,
        args: [path.join(packageRoot(), 'dist', 'transports', 'stdio.js')],
        cwd: packageRoot(),
        env: inheritedEnvironment(),
      });
    case 'http':
      return new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    case 'ws':
      return new WsClientTransport(`${baseUrl.replace(/^http/, 'ws')}/mcp`);
  }
}

interface StructuredResult {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function structured<T>(result: StructuredResult): T {
  if (result.isError) {
    throw new Error(`tool error: ${result.content?.map((c) => c.text).join(' ') ?? 'unknown'}`);
  }
  return result.structuredContent as T;
}

async function exercise(kind: 'stdio' | 'http' | 'ws', options: Options, baseUrl: string): Promise<void> {
  const label = kind.toUpperCase();
  console.log(`\n=== ${label} ===`);
  const client = new Client({ name: `copilot-mcp-live-fire-${kind}`, version: '0.1.0' });
  await client.connect(makeTransport(kind, baseUrl));

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  console.log(`[${label}] tools/list → ${names.join(', ')}`);
  const required = [
    'ask', 'ping', 'marco', 'blast_timer_start', 'check_in', 'blast_timer_status',
    'session_create', 'session_list', 'session_events', 'session_destroy', 'models_list', 'status',
  ];
  const missing = required.filter((n) => !names.includes(n));
  if (missing.length > 0) throw new Error(`[${label}] missing tools: ${missing.join(', ')}`);

  const pong = structured<{ pong: boolean; uptime_ms: number }>(
    (await client.callTool({ name: 'ping', arguments: { echo: label } })) as StructuredResult,
  );
  if (!pong.pong) throw new Error(`[${label}] ping did not pong`);
  console.log(`[${label}] ping → pong (uptime ${pong.uptime_ms}ms)`);

  if (options.blast) {
    const armed = structured<{ armed: boolean; duration_ms: number }>(
      (await client.callTool({ name: 'blast_timer_start', arguments: { duration: 60 } })) as StructuredResult,
    );
    console.log(`[${label}] blast_timer_start → armed for ${armed.duration_ms}ms`);
    const checkIn = structured<{ remaining_ms: number; check_ins: number }>(
      (await client.callTool({ name: 'check_in', arguments: { signal: 'live-fire' } })) as StructuredResult,
    );
    console.log(`[${label}] check_in → remaining ${checkIn.remaining_ms}ms (#${checkIn.check_ins})`);
    const status = structured<{ armed: boolean; remaining_ms: number | null }>(
      (await client.callTool({ name: 'blast_timer_status', arguments: {} })) as StructuredResult,
    );
    console.log(`[${label}] blast_timer_status → armed=${status.armed} remaining=${status.remaining_ms}ms`);
  }

  if (options.signals) {
    const marco = await sendMarco((name, args) => client.callTool({ name, arguments: args }), {
      timeoutMs: 120_000,
    });
    console.log(`[${label}] marco → "${marco.reply}" ok=${marco.ok} rtt=${marco.rtt_ms}ms`);
    if (!marco.ok) throw new Error(`[${label}] marco round-trip failed: got "${marco.reply}"`);
  }

  if (options.ask) {
    const ask = structured<{ answer: string; session_id: string; turn_ms: number }>(
      (await client.callTool(
        { name: 'ask', arguments: { prompt: 'What is 2+2? Answer with just the number.' } },
        { timeout: 300_000 },
      )) as StructuredResult,
    );
    console.log(`[${label}] ask("What is 2+2?") → "${ask.answer.trim()}" (session ${ask.session_id}, ${ask.turn_ms}ms)`);
    if (!ask.answer.includes('4')) throw new Error(`[${label}] unexpected ask answer: ${ask.answer}`);
    await client.callTool({ name: 'session_destroy', arguments: { session_id: ask.session_id } });
    console.log(`[${label}] session_destroy(${ask.session_id}) → ok`);
  }

  await client.close();
  console.log(`[${label}] PASS`);
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(Usage());
    return 0;
  }
  const config = loadConfig();
  const baseUrl = `http://${config.host}:${config.httpPort}`;
  const kinds: Array<'stdio' | 'http' | 'ws'> =
    options.transport === 'all' ? ['stdio', 'http', 'ws'] : [options.transport];
  for (const kind of kinds) {
    await exercise(kind, options, baseUrl);
  }
  console.log('\nAll transports PASS');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('LIVE-FIRE FAILURE:', error);
    process.exit(1);
  },
);
