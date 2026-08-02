import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig } from './config.js';
import { createEnvelope } from './envelope.js';
import { appendJsonLine, drainSpool, ensureDataDirectories } from './io.js';
import { initializeTelemetry } from './otel.js';
import { SpanAssembler } from './span-assembler.js';
import { isCopilotHookEventName, isHookEnvelope, type HookEnvelope } from './types.js';

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
  await ensureDataDirectories(config.dataDir, config.spoolDir);

  const telemetry = initializeTelemetry(config);
  const assembler = new SpanAssembler(telemetry.tracer, config);
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

  const consumeUnserialized = async (envelope: HookEnvelope): Promise<void> => {
    if (!rememberEventId(envelope.event_id)) {
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
