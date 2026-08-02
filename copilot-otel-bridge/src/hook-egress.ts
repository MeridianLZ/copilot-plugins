import { loadConfig } from './config.js';
import { createEnvelope } from './envelope.js';
import { ensureDataDirectories, readStdin, writeSpoolFile } from './io.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const input = await readStdin(12 * 1024 * 1024);
  const payload = JSON.parse(input) as unknown;
  const envelope = createEnvelope(payload, config, 'command-hook', process.env['COPILOT_HOOK_EVENT'], {
    traceparent: process.env['TRACEPARENT'],
    tracestate: process.env['TRACESTATE']
  });

  try {
    const response = await fetch(config.bridgeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(config.postTimeoutMs)
    });
    if (!response.ok) throw new Error(`bridge returned HTTP ${response.status}`);
  } catch {
    await ensureDataDirectories(config.dataDir, config.spoolDir);
    await writeSpoolFile(config.spoolDir, envelope);
  }
}

main().catch(async (error: unknown) => {
  // Copilot preToolUse command hooks fail closed on any non-timeout error.
  // This observer therefore must never emit a policy decision and must always exit 0.
  try {
    const config = loadConfig();
    await ensureDataDirectories(config.dataDir, config.spoolDir);
    process.stderr.write(`[copilot-otel-egress] ${error instanceof Error ? error.message : String(error)}\n`);
  } catch {
    // Intentionally empty: telemetry must never interfere with Copilot execution.
  }
  process.exitCode = 0;
});
