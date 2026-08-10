import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { get } from 'node:http';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

function startBridge(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/bridge.ts'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        COPILOT_TRACE_BRIDGE_HOST: '127.0.0.1',
        COPILOT_TRACE_BRIDGE_PORT: String(port),
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:27432/v1/traces',
        COPILOT_TRACE_CONSOLE_MODE: 'silent'
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
      if (chunk.includes('[bridge] listening')) {
        clearTimeout(timeout);
        resolve(child);
      }
    });

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', () => {
      if (stderr.length > 0) {
        clearTimeout(timeout);
      }
    });
  });
}

function readHealth(port: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get(`http://127.0.0.1:${port}/health`, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
  });
}

async function stopBridge(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => resolve(), 2_000);
  });
}

test('bridge health returns only the local runtime contract', async () => {
  const port = 15329;
  const child = await startBridge(port);
  try {
    const health = await readHealth(port);
    assert.deepEqual(health, {
      local_runtime: true,
      proxy_mode: 'disabled',
      telemetry_host: '127.0.0.1'
    });
  } finally {
    await stopBridge(child);
  }
});
