import type { BridgeConfig } from './config.js';
import { loadConfig } from './config.js';
import { createEnvelope } from './envelope.js';
import { ensureDataDirectories, readStdin, writeSpoolFile } from './io.js';
import { postLocalJson } from './local-runtime.js';
import { sanitizeSecrets } from './security.js';
import type { HookEnvelope } from './types.js';

type HookEgressRuntime = {
  config?: BridgeConfig;
  envelope?: HookEnvelope;
};

function safeDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return String(sanitizeSecrets(message));
}

async function spoolEnvelope(config: BridgeConfig, envelope: HookEnvelope): Promise<void> {
  await ensureDataDirectories(config.dataDir, config.spoolDir);
  await writeSpoolFile(config.spoolDir, envelope);
}

async function main(runtime: HookEgressRuntime): Promise<void> {
  const config = loadConfig();
  runtime.config = config;
  const input = await readStdin(12 * 1024 * 1024);
  const payload = JSON.parse(input) as unknown;
  const envelope = createEnvelope(payload, config, 'command-hook', process.env['COPILOT_HOOK_EVENT'], {
    traceparent: process.env['TRACEPARENT'],
    tracestate: process.env['TRACESTATE']
  });
  runtime.envelope = envelope;

  await postLocalJson(new URL(config.bridgeUrl), JSON.stringify(envelope), config.postTimeoutMs);
}

const runtime: HookEgressRuntime = {};

main(runtime).catch(async (error: unknown) => {
  // Copilot preToolUse command hooks fail closed on any non-timeout error.
  // This observer therefore must never emit a policy decision and must always exit 0.
  try {
    if (runtime.config && runtime.envelope) {
      await spoolEnvelope(runtime.config, runtime.envelope);
    }
    process.stderr.write(`[copilot-otel-egress] ${safeDiagnostic(error)}\n`);
  } catch {
    // Intentionally empty: telemetry must never interfere with Copilot execution.
  }
  process.exitCode = 0;
});
