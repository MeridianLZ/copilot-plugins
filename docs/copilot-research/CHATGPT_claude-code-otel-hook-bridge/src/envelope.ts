import { randomUUID } from 'node:crypto';
import type { BridgeConfig } from './config.js';
import { sanitizeJson } from './security.js';
import type { HookEnvelope, HookPayload, JsonObject } from './types.js';
import { isHookPayload } from './types.js';

export function createEnvelope(
  rawPayload: unknown,
  config: BridgeConfig,
  source: HookEnvelope['source'],
  inherited?: {
    traceparent?: string | undefined;
    tracestate?: string | undefined;
    bridgeSessionId?: string | undefined;
  }
): HookEnvelope {
  if (!isHookPayload(rawPayload)) {
    throw new Error('Hook payload is missing a valid session_id or hook_event_name');
  }

  const prepared: JsonObject = { ...(rawPayload as JsonObject) };
  if (prepared['hook_event_name'] === 'StopFailure' && typeof prepared['error'] === 'string') {
    prepared['error_type'] = prepared['error'];
  }

  const sanitized = sanitizeJson(prepared, config.contentMode, config.contentMaxBytes);
  if (!isHookPayload(sanitized)) {
    throw new Error('Sanitization unexpectedly removed required hook fields');
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
    ...(inherited?.bridgeSessionId ? { bridge_session_id: inherited.bridgeSessionId } : {}),
    payload: sanitized
  };
}
