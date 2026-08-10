import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createEnvelope } from './envelope.js';
import { appendJsonLine, drainSpool, ensureDataDirectories } from './io.js';
import { initializeTelemetry } from './otel.js';
import { SpanAssembler } from './span-assembler.js';
import { conversationToMarkdown, projectConversation } from './conversation-projector.js';
import { createPayloadDeduper } from './dedupe.js';
import { NativeSessionCache } from './native-cache.js';
import { eventTimeMs, parseLedgerLines, projectSessions, projectSessionTrace } from './trace-projector.js';
import { isCopilotHookEventName, isHookEnvelope, type HookEnvelope } from './types.js';

function uiIndexPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.basename(path.dirname(moduleDir)) === 'dist'
    ? path.resolve(moduleDir, '../..')
    : path.resolve(moduleDir, '..');
  return path.join(root, 'ui', 'index.html');
}

async function readLedger(eventsFile: string): Promise<HookEnvelope[]> {
  let raw: string;
  try {
    raw = await readFile(eventsFile, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return parseLedgerLines(raw.split('\n'));
}

async function readRequestJson(request: IncomingMessage, maxBytes = 16 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new Error(`request exceeded ${maxBytes} bytes`);
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function requestHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(serialized)
  });
  response.end(serialized);
}

function configuredEventFromRequest(request: IncomingMessage, pathname: string): string | undefined {
  const fromHeader = requestHeader(request, 'x-copilot-hook-event');
  if (fromHeader) return fromHeader;
  const prefix = '/hooks/';
  if (!pathname.startsWith(prefix)) return undefined;
  const candidate = decodeURIComponent(pathname.slice(prefix.length));
  return candidate.length > 0 ? candidate : undefined;
}

function prettyConsole(envelope: HookEnvelope): void {
  const payload = envelope.payload;
  const tool = typeof payload['tool_name'] === 'string' ? ` tool=${payload['tool_name']}` : '';
  const agentName = typeof payload['agent_name'] === 'string' ? ` agent=${payload['agent_name']}` : '';
  const agentId = typeof payload['agent_id'] === 'string' ? ` agent_id=${payload['agent_id']}` : '';
  const reason = typeof payload['reason'] === 'string' ? ` reason=${payload['reason']}` : '';
  process.stdout.write(
    `${envelope.observed_at} ${payload.hook_event_name.padEnd(23)} session=${payload.session_id}${tool}${agentName}${agentId}${reason}\n`
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  const localTelemetry = config.localTelemetry;
  if (!localTelemetry) {
    throw new Error('local telemetry runtime configuration missing');
  }
  await ensureDataDirectories(config.dataDir, config.spoolDir);

  const telemetry = initializeTelemetry(config);
  const assembler = new SpanAssembler(telemetry.tracer, config);
  const nativeCache = new NativeSessionCache(config.copilotHome);
  let accepted = 0;
  let duplicates = 0;
  let failed = 0;
  let ingestTail: Promise<void> = Promise.resolve();
  let spoolDrainActive = false;
  const recentEventIds = new Set<string>();
  const recentEventOrder: string[] = [];

  const rememberEventId = (eventId: string): boolean => {
    if (recentEventIds.has(eventId)) return false;
    recentEventIds.add(eventId);
    recentEventOrder.push(eventId);
    while (recentEventOrder.length > 10_000) {
      const oldest = recentEventOrder.shift();
      if (oldest) recentEventIds.delete(oldest);
    }
    return true;
  };

  const payloadDeduper = createPayloadDeduper(config.dedupeWindowMs);

  const consumeUnserialized = async (envelope: HookEnvelope): Promise<void> => {
    if (!rememberEventId(envelope.event_id)) {
      duplicates += 1;
      return;
    }
    // Multiple hook installations re-emit the same payload under fresh
    // event_ids; identity is the payload itself (its ms timestamp included).
    if (payloadDeduper.isDuplicate(envelope.payload, eventTimeMs(envelope))) {
      duplicates += 1;
      return;
    }
    await appendJsonLine(config.eventsFile, envelope);
    assembler.process(envelope);
    accepted += 1;
    if (config.consoleMode === 'json') process.stdout.write(`${JSON.stringify(envelope)}\n`);
    if (config.consoleMode === 'pretty') prettyConsole(envelope);
  };

  const consume = (envelope: HookEnvelope): Promise<void> => {
    const operation = ingestTail.then(() => consumeUnserialized(envelope));
    ingestTail = operation.catch(() => undefined);
    return operation;
  };

  const replaySpool = async (): Promise<number> => {
    if (spoolDrainActive) return 0;
    spoolDrainActive = true;
    try {
      return await drainSpool(config.spoolDir, consume, (value) => {
        if (!isHookEnvelope(value)) throw new Error('invalid spooled hook envelope');
        return value;
      });
    } finally {
      spoolDrainActive = false;
    }
  };

  const initialDrained = await replaySpool();
  if (initialDrained > 0) process.stdout.write(`[bridge] replayed ${initialDrained} spooled hook events\n`);

  const spoolTimer = setInterval(() => {
    void replaySpool()
      .then((drained) => {
        if (drained > 0) process.stdout.write(`[bridge] replayed ${drained} spooled hook events\n`);
      })
      .catch((error: unknown) => {
        process.stderr.write(`[bridge] spool replay failed: ${String(error)}\n`);
      });
  }, config.spoolDrainIntervalMs);
  spoolTimer.unref();

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, {
          ok: true,
          local_runtime: true,
          proxy_mode: 'disabled',
          telemetry_host: localTelemetry.hostname,
          accepted,
          duplicates,
          failed,
          events_file: config.eventsFile,
          spool_drain_interval_ms: config.spoolDrainIntervalMs,
          otlp_traces_endpoint: config.otlpTracesEndpoint
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/flush') {
        await ingestTail;
        await telemetry.forceFlush();
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/ui' || url.pathname === '/ui/')) {
        const html = await readFile(uiIndexPath(), 'utf8');
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions') {
        await ingestTail;
        sendJson(response, 200, { sessions: projectSessions(await readLedger(config.eventsFile)) });
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/sessions/')) {
        await ingestTail;
        const remainder = decodeURIComponent(url.pathname.slice('/api/sessions/'.length));
        const conversationMatch = /^(.*)\/conversation(?:\.(md|json))?$/.exec(remainder);
        const sessionId = conversationMatch ? conversationMatch[1] ?? remainder : remainder;
        const ledger = await readLedger(config.eventsFile);
        if (conversationMatch) {
          const nativeEvents = await nativeCache.getNativeEvents(sessionId);
          const conversation = projectConversation(ledger, sessionId, nativeEvents);
          if (conversation.event_count === 0) {
            sendJson(response, 404, { error: 'session_not_found', session_id: sessionId });
            return;
          }
          const format = conversationMatch[2] ?? url.searchParams.get('format') ?? 'json';
          if (format === 'md' || format === 'markdown') {
            const markdown = conversationToMarkdown(conversation);
            response.writeHead(200, {
              'content-type': 'text/markdown; charset=utf-8',
              'content-disposition': `attachment; filename="conversation-${sessionId}.md"`
            });
            response.end(markdown);
            return;
          }
          sendJson(response, 200, conversation);
          return;
        }
        const trace = projectSessionTrace(ledger, sessionId);
        if (trace.events.length === 0) {
          sendJson(response, 404, { error: 'session_not_found', session_id: sessionId });
          return;
        }
        sendJson(response, 200, trace);
        return;
      }
      if (request.method !== 'POST' || (url.pathname !== '/hooks' && !url.pathname.startsWith('/hooks/'))) {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }

      const incoming = await readRequestJson(request);
      const isEnvelope = isHookEnvelope(incoming);
      let envelope: HookEnvelope;
      if (isEnvelope) {
        envelope = incoming;
      } else {
        const configuredEvent = configuredEventFromRequest(request, url.pathname);
        if (configuredEvent && !isCopilotHookEventName(configuredEvent) && !/^[A-Z]/.test(configuredEvent)) {
          throw new Error(`unsupported hook event path/header: ${configuredEvent}`);
        }
        envelope = createEnvelope(
          incoming,
          config,
          'http-hook',
          configuredEvent,
          {
            traceparent: requestHeader(request, 'traceparent'),
            tracestate: requestHeader(request, 'tracestate')
          }
        );
      }

      await consume(envelope);
      // A direct HTTP hook response is itself interpreted as hook control output.
      // Return an empty object so observation never accidentally grants, denies, or mutates.
      sendJson(response, isEnvelope ? 202 : 200, isEnvelope ? { accepted: true, event_id: envelope.event_id } : {});
    } catch (error: unknown) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[bridge] ${message}\n`);
      sendJson(response, 400, { error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });
  process.stdout.write(
    `[bridge] listening http://${config.host}:${config.port}; JSONL=${config.eventsFile}; OTLP=${config.otlpTracesEndpoint}\n`
  );

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`[bridge] ${signal}: closing open spans and flushing\n`);
    clearInterval(spoolTimer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await ingestTail;
    assembler.shutdown();
    await telemetry.forceFlush().catch((error: unknown) => {
      process.stderr.write(`[bridge] forceFlush failed: ${String(error)}\n`);
    });
    await telemetry.shutdown().catch((error: unknown) => {
      process.stderr.write(`[bridge] telemetry shutdown failed: ${String(error)}\n`);
    });
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal).finally(() => process.exit(0));
    });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[bridge] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
