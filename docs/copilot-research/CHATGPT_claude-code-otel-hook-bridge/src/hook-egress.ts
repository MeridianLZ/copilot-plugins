import { loadConfig } from './config.js';
import { createEnvelope } from './envelope.js';
import { ensureDataDirectories, readStdin, writeSpoolFile } from './io.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const input = await readStdin();
  const payload = JSON.parse(input) as unknown;
  const envelope = createEnvelope(payload, config, 'command-hook', {
    traceparent: process.env['TRACEPARENT'],
    tracestate: process.env['TRACESTATE'],
    bridgeSessionId: process.env['CLAUDE_CODE_BRIDGE_SESSION_ID']
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
  // Observability must fail open. Never emit stdout because several Claude hooks
  // interpret stdout as context or a decision payload.
  try {
    const config = loadConfig();
    await ensureDataDirectories(config.dataDir, config.spoolDir);
    const emergency = {
      schema_version: '1.0.0',
      event_id: `egress-error-${Date.now()}-${process.pid}`,
      observed_at: new Date().toISOString(),
      observed_at_unix_ms: Date.now(),
      source: 'command-hook',
      payload: {
        hook_event_name: 'Notification',
        session_id: 'unknown',
        notification_type: 'hook_egress_error',
        message: error instanceof Error ? error.message : String(error)
      }
    } as const;
    await writeSpoolFile(config.spoolDir, emergency);
  } catch {
    // Intentionally empty: never break Claude Code because telemetry failed.
  }
  process.exitCode = 0;
});
