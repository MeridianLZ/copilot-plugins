import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const runtimeRoot = path.join(projectRoot, 'test', 'fixtures', '.native-otel-api-runtime');

async function withEnvironment(
  values: Record<string, string | undefined>,
  run: () => Promise<void> | void
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    await run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function startBridge(port: number, dataDir: string, nativeOtelDirectory: string): Promise<ChildProcess> {
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
        COPILOT_HOME: path.join(dataDir, 'copilot-home'),
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

test('loadConfig defaults native OTel storage under the data directory without validating OTLP', async () => {
  const dataDir = path.join(runtimeRoot, 'config-default');
  await withEnvironment({
    COPILOT_TRACE_DATA_DIR: dataDir,
    COPILOT_TRACE_NATIVE_OTEL_DIR: undefined,
    COPILOT_TRACE_NATIVE_OTEL_MAX_RECORDS: undefined,
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://collector.example.invalid/v1/traces'
  }, () => {
    const config = loadConfig();
    assert.equal(config.nativeOtelDirectory, path.join(dataDir, 'native-otel'));
    assert.equal(config.nativeOtelMaxRecords, 100_000);
  });
});

test('collector and compose persist all native signals in a loopback-only local mount', async () => {
  const collector = await readFile(path.join(projectRoot, 'otel', 'collector.yml'), 'utf8');
  const compose = await readFile(path.join(projectRoot, 'compose.yml'), 'utf8');

  for (const signal of ['traces', 'metrics', 'logs']) {
    assert.match(collector, new RegExp(`file/${signal}:\\s+[\\s\\S]*?path: /native-otel/${signal}\\.jsonl`));
    assert.match(collector, new RegExp(`${signal}:\\s+[\\s\\S]*?exporters: \\[file/${signal}\\]`));
  }
  assert.equal((collector.match(/max_megabytes:/g) ?? []).length, 3);
  assert.equal((collector.match(/max_days:/g) ?? []).length, 3);
  assert.equal((collector.match(/max_backups:/g) ?? []).length, 3);
  assert.match(compose, /127\.0\.0\.1:\$\{OTEL_COLLECTOR_GRPC_PORT:-27431\}:4317/);
  assert.match(compose, /127\.0\.0\.1:\$\{OTEL_COLLECTOR_HTTP_PORT:-27432\}:4318/);
  assert.match(compose, /user: "0:0"/);
  assert.match(compose, /\.\/\.copilot\/telemetry-live\/native-otel:\/native-otel/);
  assert.match(compose, /COPILOT_TRACE_NATIVE_OTEL_DIR: \/native-otel/);
});

test('native OTel API returns exact sanitized records and distinguishes hook-only from missing sessions', async () => {
  const runtimeDirectory = path.join(runtimeRoot, randomUUID());
  const dataDir = path.join(runtimeDirectory, 'data');
  const nativeOtelDirectory = path.join(runtimeDirectory, 'native-otel');
  await mkdir(nativeOtelDirectory, { recursive: true });
  await writeFile(path.join(nativeOtelDirectory, 'logs.jsonl'), [
    JSON.stringify({
      signal: 'log',
      observed_at_unix_ms: 1_723_298_410_000,
      session_id: 'session-native',
      attributes: {
        message: 'https://canary-pass:canary-secret@proxy.invalid:8080',
        reasoning_ciphertext: 'opaque-reasoning'
      }
    }),
    JSON.stringify({
      signal: 'log',
      observed_at_unix_ms: 1_723_298_411_000,
      session_id: 'session-other',
      attributes: { message: 'safe' }
    }),
    '{"signal":"log"'
  ].join('\n') + '\n', 'utf8');

  const port = 15330;
  const child = await startBridge(port, dataDir, nativeOtelDirectory);
  try {
    const native = await requestJson(port, 'GET', '/api/sessions/session-native/native-otel');
    assert.equal(native.status, 200);
    assert.equal(native.body['count'], 1);
    assert.equal(Array.isArray(native.body['records']), true);
    const records = native.body['records'] as Array<Record<string, unknown>>;
    assert.equal(records[0]?.['session_id'], 'session-native');
    assert.equal(records[0]?.['validity'], 'valid');
    assert.equal(path.isAbsolute(String(records[0]?.['source_file'])), false);
    const serialized = JSON.stringify(native.body);
    assert.equal(serialized.includes('session-other'), false);
    assert.equal(serialized.includes('canary-pass'), false);
    assert.equal(serialized.includes('proxy.invalid'), false);
    assert.equal(serialized.includes('opaque-reasoning'), false);

    const hook = await requestJson(port, 'POST', '/hooks/sessionStart', {
      sessionId: 'session-hook-only',
      timestamp: 1_723_298_412_000
    });
    assert.equal(hook.status, 200);
    const hookOnly = await requestJson(port, 'GET', '/api/sessions/session-hook-only/native-otel');
    assert.equal(hookOnly.status, 200);
    assert.deepEqual(hookOnly.body['records'], []);
    assert.equal(hookOnly.body['count'], 0);

    const missing = await requestJson(port, 'GET', '/api/sessions/session-missing/native-otel');
    assert.equal(missing.status, 404);
  } finally {
    await stopBridge(child);
    await rm(runtimeDirectory, { recursive: true, force: true });
  }
});
