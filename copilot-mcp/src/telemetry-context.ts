import { AsyncLocalStorage } from 'node:async_hooks';

export interface TelemetryCarrier {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
}

export interface PeerRequestContext {
  requestCarrier?: TelemetryCarrier;
  peerRequestId?: string;
  transport?: string;
}

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const TRACESTATE_KEY_PATTERN = /^[a-z0-9][a-z0-9_\-*/]{0,255}(?:@[a-z0-9][a-z0-9_\-*/]{0,240})?$/;
const BAGGAGE_KEY_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const CONTROL_OR_DELIMITER = /[\u0000-\u001f\u007f]/;
const PEER_CONTEXT = new AsyncLocalStorage<PeerRequestContext>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedHeader(value: unknown, maxBytes: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (Buffer.byteLength(trimmed, 'utf8') > maxBytes) return undefined;
  if (CONTROL_OR_DELIMITER.test(trimmed)) return undefined;
  return trimmed;
}

function parseTraceparent(value: unknown): { header: string; traceId: string; spanId: string } | undefined {
  const bounded = boundedHeader(value, 128);
  if (!bounded) return undefined;
  const match = TRACEPARENT_PATTERN.exec(bounded);
  if (!match) return undefined;
  const traceId = match[1]?.toLowerCase();
  const spanId = match[2]?.toLowerCase();
  const flags = match[3]?.toLowerCase();
  if (!traceId || !spanId || !flags) return undefined;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return undefined;
  return { header: `00-${traceId}-${spanId}-${flags}`, traceId, spanId };
}

function validateTracestate(value: unknown): string | undefined {
  const bounded = boundedHeader(value, 512);
  if (!bounded) return undefined;
  const members = bounded.split(',');
  if (members.length === 0 || members.length > 32) return undefined;
  const normalized: string[] = [];
  for (const member of members) {
    const trimmed = member.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0 || separator === trimmed.length - 1) return undefined;
    const key = trimmed.slice(0, separator);
    const stateValue = trimmed.slice(separator + 1).trim();
    if (!TRACESTATE_KEY_PATTERN.test(key)) return undefined;
    if (stateValue.length === 0 || stateValue.length > 256) return undefined;
    if (stateValue.includes(',') || CONTROL_OR_DELIMITER.test(stateValue)) return undefined;
    normalized.push(`${key}=${stateValue}`);
  }
  return normalized.join(',');
}

function validateBaggage(value: unknown): string | undefined {
  const bounded = boundedHeader(value, 8192);
  if (!bounded) return undefined;
  const members = bounded.split(',');
  if (members.length === 0 || members.length > 64) return undefined;
  const normalized: string[] = [];
  for (const member of members) {
    const segments = member
      .split(';')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    const pair = segments[0];
    if (!pair) return undefined;
    const separator = pair.indexOf('=');
    if (separator <= 0 || separator === pair.length - 1) return undefined;
    const key = pair.slice(0, separator);
    const baggageValue = pair.slice(separator + 1).trim();
    if (!BAGGAGE_KEY_PATTERN.test(key)) return undefined;
    if (baggageValue.length === 0 || baggageValue.length > 4096) return undefined;
    if (baggageValue.includes(',') || CONTROL_OR_DELIMITER.test(baggageValue)) return undefined;
    const cleanProps: string[] = [];
    for (const property of segments.slice(1)) {
      if (property.includes(',') || CONTROL_OR_DELIMITER.test(property)) return undefined;
      cleanProps.push(property);
    }
    normalized.push(cleanProps.length > 0 ? `${key}=${baggageValue};${cleanProps.join(';')}` : `${key}=${baggageValue}`);
  }
  return normalized.join(',');
}

function hasCarrierValues(carrier: TelemetryCarrier): boolean {
  return carrier.traceparent !== undefined || carrier.tracestate !== undefined || carrier.baggage !== undefined;
}

function sanitizeTransport(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 64) || undefined;
}

export function sanitizePeerRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (text.length === 0) return undefined;
  return text.slice(0, 128);
}

export function traceContextIds(carrier: TelemetryCarrier): { traceId: string; spanId: string } | undefined {
  if (!carrier.traceparent) return undefined;
  const parsed = parseTraceparent(carrier.traceparent);
  return parsed ? { traceId: parsed.traceId, spanId: parsed.spanId } : undefined;
}

export function validateCarrier(value: unknown): TelemetryCarrier {
  if (!isRecord(value)) return {};
  const carrier: TelemetryCarrier = {};
  const traceparent = parseTraceparent(value['traceparent']);
  if (traceparent) carrier.traceparent = traceparent.header;
  const tracestate = validateTracestate(value['tracestate']);
  if (tracestate) carrier.tracestate = tracestate;
  const baggage = validateBaggage(value['baggage']);
  if (baggage) carrier.baggage = baggage;
  return carrier;
}

export function injectCarrier(params: Record<string, unknown>, carrier: TelemetryCarrier): Record<string, unknown> {
  const validated = validateCarrier(carrier);
  if (!hasCarrierValues(validated)) return { ...params };
  const meta = isRecord(params['_meta']) ? { ...params['_meta'] } : {};
  if (validated.traceparent) meta['traceparent'] = validated.traceparent;
  if (validated.tracestate) meta['tracestate'] = validated.tracestate;
  if (validated.baggage) meta['baggage'] = validated.baggage;
  return { ...params, _meta: meta };
}

export function extractCarrier(params: unknown): TelemetryCarrier {
  if (!isRecord(params)) return {};
  const meta = isRecord(params['_meta']) ? params['_meta'] : params;
  return validateCarrier(meta);
}

export function activePeerRequestContext(): PeerRequestContext | undefined {
  return PEER_CONTEXT.getStore();
}

export function runWithPeerRequestContext<T>(context: PeerRequestContext, callback: () => T): T {
  const requestCarrier = validateCarrier(context.requestCarrier ?? {});
  const peerRequestId = sanitizePeerRequestId(context.peerRequestId);
  const transport = sanitizeTransport(context.transport);
  const normalized: PeerRequestContext = {
    ...(hasCarrierValues(requestCarrier) ? { requestCarrier } : {}),
    ...(peerRequestId !== undefined ? { peerRequestId } : {}),
    ...(transport !== undefined ? { transport } : {}),
  };
  if (!normalized.requestCarrier && !normalized.peerRequestId && !normalized.transport) return callback();
  return PEER_CONTEXT.run(normalized, callback);
}
