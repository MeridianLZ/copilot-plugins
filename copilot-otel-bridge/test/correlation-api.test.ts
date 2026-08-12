import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import {
  projectConversation,
  type ConversationDocument
} from '../src/conversation-projector.js';
import type { CoverageEntry } from '../src/correlation.js';
import type { CopilotHookEventName, JsonObject } from '../src/types.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const runtimeRoot = path.join(projectRoot, 'test', 'fixtures', '.correlation-api-runtime');

function startBridge(port: number, dataDir: string, nativeOtelDirectory: string, copilotHome: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/bridge.ts'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        COPILOT_TRACE_BRIDGE_HOST: '127.0.0.1',
        COPILOT_TRACE_BRIDGE_PORT: String(port),
        COPILOT_TRACE_DATA_DIR: dataDir,
        COPILOT_TRACE_NATIVE_OTEL_DIR: nativeOtelDirectory,
        COPILOT_TRACE_CONSOLE_MODE: 'silent',
        COPILOT_HOME: copilotHome,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:27432/v1/traces'
      }
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('bridge did not start in time'));
    }, 10_000);

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (!chunk.includes('[bridge] listening')) return;
      clearTimeout(timeout);
      resolve(child);
    });

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`bridge exited ${String(code)}: ${stderr}`));
    });
  });
}

async function stopBridge(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(resolve, 2_000);
  });
}

function requestJson(
  port: number,
  method: 'GET' | 'POST',
  pathname: string,
  body?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const call = request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: serialized === undefined
        ? undefined
        : {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(serialized)
          }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        try {
          resolve({
            status: response.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    call.on('error', reject);
    if (serialized !== undefined) call.write(serialized);
    call.end();
  });
}

let counter = 0;
function line(event: CopilotHookEventName, sessionId: string, timeMs: number, extra: JsonObject = {}): string {
  counter += 1;
  return JSON.stringify({
    schema_version: '1.0.0',
    event_id: `evt-${counter}`,
    observed_at: new Date(timeMs).toISOString(),
    observed_at_unix_ms: timeMs,
    source: 'command-hook',
    payload: {
      hook_event_name: event,
      session_id: sessionId,
      payload_format: 'camelCase',
      timestamp: new Date(timeMs).toISOString(),
      ...extra
    }
  });
}

test('coverage API applies exact session filtering and keeps totals balanced', async () => {
  const runtimeDirectory = path.join(runtimeRoot, randomUUID());
  const dataDir = path.join(runtimeDirectory, 'data');
  const nativeOtelDirectory = path.join(runtimeDirectory, 'native-otel');
  const copilotHome = path.join(runtimeDirectory, 'copilot-home');
  const sessionId = 'sess-coverage-api';
  await mkdir(nativeOtelDirectory, { recursive: true });
  await mkdir(path.join(copilotHome, 'session-state', sessionId), { recursive: true });

  await writeFile(path.join(nativeOtelDirectory, 'logs.jsonl'), [
    JSON.stringify({
      signal: 'log',
      observed_at_unix_ms: 1_723_300_000_000,
      session_id: sessionId,
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      span_id: '00f067aa0ba902b7',
      tool_call_id: 'https://canary-pass:canary-secret@proxy.invalid:8080',
      attributes: { message: 'https://canary-pass:canary-secret@proxy.invalid:8080' }
    }),
    JSON.stringify({
      signal: 'log',
      observed_at_unix_ms: 1_723_300_001_000,
      session_id: 'sess-other',
      attributes: { message: 'safe' }
    })
  ].join('\n') + '\n', 'utf8');

  await writeFile(
    path.join(copilotHome, 'session-state', sessionId, 'events.jsonl'),
    JSON.stringify({
      type: 'tool.execution_start',
      id: 'native-tool-1',
      timestamp: new Date(1_723_300_000_500).toISOString(),
      parentId: 'unreliable-parent-id',
      data: {
        toolCallId: 'https://canary-pass:canary-secret@proxy.invalid:8080',
        toolName: 'view'
      }
    }) + '\n',
    'utf8'
  );

  const port = 15331;
  const child = await startBridge(port, dataDir, nativeOtelDirectory, copilotHome);
  try {
    const hook = await requestJson(port, 'POST', '/hooks/sessionStart', {
      sessionId,
      timestamp: 1_723_300_000_100,
      initialPrompt: 'https://canary-pass:canary-secret@proxy.invalid:8080'
    });
    assert.equal(hook.status, 200);

    const hookOnly = await requestJson(port, 'POST', '/hooks/sessionStart', {
      sessionId: 'sess-hook-only',
      timestamp: 1_723_300_002_000
    });
    assert.equal(hookOnly.status, 200);

    const covered = await requestJson(port, 'GET', `/api/sessions/${sessionId}/coverage`);
    assert.equal(covered.status, 200);
    const coveredEntries = covered.body['entries'] as Array<Record<string, unknown>>;
    assert.equal(Array.isArray(coveredEntries), true);
    assert.equal(coveredEntries.length > 0, true);
    assert.equal(coveredEntries.every((entry) => entry['session_id'] === sessionId), true);

    const totals = covered.body['totals'] as Record<string, unknown>;
    assert.equal(typeof totals, 'object');
    assert.equal(totals['balanced'], true);
    assert.equal(totals['total'], coveredEntries.length);

    const serialized = JSON.stringify(covered.body);
    assert.equal(serialized.includes('sess-other'), false);
    assert.equal(serialized.includes('canary-pass'), false);
    assert.equal(serialized.includes('proxy.invalid'), false);

    const hookOnlyCoverage = await requestJson(port, 'GET', '/api/sessions/sess-hook-only/coverage');
    assert.equal(hookOnlyCoverage.status, 200);
    const hookOnlyTotals = hookOnlyCoverage.body['totals'] as Record<string, unknown>;
    assert.equal(hookOnlyTotals['balanced'], true);

    const missing = await requestJson(port, 'GET', '/api/sessions/sess-missing/coverage');
    assert.equal(missing.status, 404);
  } finally {
    await stopBridge(child);
    await rm(runtimeDirectory, { recursive: true, force: true });
  }
});

test('projectConversation emits visible gap nodes for non-represented coverage entries', () => {
  const sessionId = 'sess-gap';
  const base = Date.parse('2026-08-10T12:00:00.000Z');
  const envelopes = [JSON.parse(line('sessionStart', sessionId, base))];

  const coverage: CoverageEntry[] = [
    {
      source_kind: 'native_otel',
      source_id: 'https://canary-pass:canary-secret@proxy.invalid:8080',
      session_id: sessionId,
      timestamp_ms: base + 10,
      disposition: 'unmatched',
      related_ids: [],
      reason: 'unmatched https://canary-pass:canary-secret@proxy.invalid:8080'
    },
    {
      source_kind: 'native_transcript',
      source_id: 'cov-invalid',
      session_id: sessionId,
      timestamp_ms: base + 20,
      disposition: 'invalid',
      related_ids: [],
      reason: 'invalid'
    },
    {
      source_kind: 'mcp',
      source_id: 'cov-unavailable',
      session_id: sessionId,
      timestamp_ms: base + 30,
      disposition: 'unavailable',
      related_ids: [],
      reason: 'unavailable'
    },
    {
      source_kind: 'evidence',
      source_id: 'cov-late',
      session_id: sessionId,
      timestamp_ms: base + 40,
      disposition: 'late_out_of_order',
      related_ids: [],
      reason: 'late'
    }
  ];

  const conversation: ConversationDocument = projectConversation(envelopes, sessionId, [], coverage);
  const gaps = conversation.root.children.filter((node) => node.id.startsWith('coverage-gap:'));

  assert.equal(gaps.length, 4);
  assert.ok(gaps.every((node) => node.kind === 'event'));
  const serialized = JSON.stringify(conversation);
  assert.equal(serialized.includes('canary-pass'), false);
  assert.equal(serialized.includes('proxy.invalid'), false);
});
