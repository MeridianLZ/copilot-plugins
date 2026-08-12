import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.copilot', 'telemetry-hook-egress-test');
const spoolDir = path.join(dataDir, 'spool');

type RunResult = {
  exitCode: number | null;
  stderr: string;
  stdout: string;
};

async function cleanTestData(): Promise<void> {
  await rm(dataDir, { recursive: true, force: true });
}

function runHookEgress(): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/hook-egress.ts'], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        COPILOT_TRACE_DATA_DIR: dataDir,
        COPILOT_TRACE_BRIDGE_URL: 'http://127.0.0.1:1/hooks',
        COPILOT_TRACE_POST_TIMEOUT_MS: '50',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://user:token@example.com:4318/v1/traces',
        COPILOT_HOOK_EVENT: 'preToolUse'
      }
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.once('error', reject);
    child.once('exit', (exitCode) => {
      resolve({
        exitCode,
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        stdout: Buffer.concat(stdoutChunks).toString('utf8')
      });
    });

    child.stdin.end(
      JSON.stringify({
        sessionId: 'session-hook-egress-fallback',
        timestamp: Date.now(),
        toolName: 'bash',
        toolArgs: { command: 'echo telemetry' }
      })
    );
  });
}

test('hook egress spools sanitized envelope when local post fails even with invalid otlp endpoint', async () => {
  await cleanTestData();
  try {
    const result = await runHookEgress();
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr.includes('user:token'), false);
    assert.equal(result.stderr.includes('example.com'), false);

    const entries = (await readdir(spoolDir)).filter((entry) => entry.endsWith('.json'));
    assert.equal(entries.length, 1);
    const spooled = JSON.parse(await readFile(path.join(spoolDir, entries[0] ?? ''), 'utf8')) as Record<string, unknown>;
    assert.equal(spooled['schema_version'], '1.0.0');
    assert.equal(typeof spooled['event_id'], 'string');
    assert.equal(typeof spooled['payload'], 'object');
  } finally {
    await cleanTestData();
  }
});
