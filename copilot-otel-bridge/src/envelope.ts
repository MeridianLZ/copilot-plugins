import { randomUUID } from 'node:crypto';
import type { BridgeConfig } from './config.js';
import { normalizeHookPayload } from './normalize.js';
import { sanitizeJson } from './security.js';
import type { HookEnvelope, NormalizedHookPayload } from './types.js';
import { isNormalizedHookPayload } from './types.js';

export function createEnvelope(
  rawPayload: unknown,
  config: BridgeConfig,
  source: HookEnvelope['source'],
  configuredEvent?: string,
  inherited?: { traceparent?: string | undefined; tracestate?: string | undefined }
): HookEnvelope {
  const normalized = normalizeHookPayload(rawPayload, configuredEvent);
  const sanitized = sanitizeJson(normalized, config.contentMode, config.contentMaxBytes);
  if (!isNormalizedHookPayload(sanitized)) {
    throw new Error('Sanitization unexpectedly removed required Copilot hook fields');
  }

  const now = new Date();
  return {
    schema_version: '1.0.0',
    event_id: randomUUID(),
    observed_at: now.toISOString(),
    observed_at_unix_ms: now.getTime(),
    source,
    ...(inherited?.traceparent ? { traceparent: inherited.traceparent } : {}),
    ...(inherited?.tracestate ? { tracestate: inherited.tracestate } : {}),
    payload: sanitized as NormalizedHookPayload
  };
}

export function sanitizeEnvelope(envelope: HookEnvelope, config: BridgeConfig): HookEnvelope {
  const sanitized = sanitizeJson(envelope.payload, config.contentMode, config.contentMaxBytes);
  if (!isNormalizedHookPayload(sanitized)) {
    throw new Error('Sanitization unexpectedly removed required Copilot hook fields');
  }
  return { ...envelope, payload: sanitized };
}
