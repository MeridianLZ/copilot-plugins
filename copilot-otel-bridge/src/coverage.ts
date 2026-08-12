import { parseTraceparent } from './otel.js';
import { redactSecrets, truncateUtf8 } from './security.js';
import { eventTimeMs, type ProjectedSpan } from './trace-projector.js';
import { getString, type HookEnvelope, type NativeOtelRecord } from './types.js';
import type { NativeEvent } from './native-session.js';
import type {
  CoverageDisposition,
  CoverageEntry,
  SourceKind,
  SourceRecord
} from './correlation.js';
import { SOURCE_PRIORITY_ORDER } from './correlation.js';

export type { CoverageDisposition, CoverageEntry, SourceKind, SourceRecord } from './correlation.js';

const DISPOSITION_ORDER: readonly CoverageDisposition[] = [
  'rendered',
  'represented',
  'redacted',
  'unavailable',
  'unmatched',
  'heuristic',
  'deduplicated',
  'invalid',
  'late_out_of_order'
];

const MAX_ID_BYTES = 256;

export interface CoverageTotals {
  by_source: Record<SourceKind, number>;
  by_disposition: Record<CoverageDisposition, number>;
  total: number;
  balanced: boolean;
}

export interface BuildSourceRecordsInput {
  sessionId: string;
  hooks: readonly HookEnvelope[];
  nativeEvents: readonly NativeEvent[];
  nativeOtelRecords: readonly NativeOtelRecord[];
  spans: readonly ProjectedSpan[];
}

function sanitizeText(value: string, maxBytes = MAX_ID_BYTES): string {
  const redacted = truncateUtf8(redactSecrets(value), maxBytes);
  return redacted.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeOptionalId(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const sanitized = sanitizeText(value);
  return sanitized.length > 0 ? sanitized : undefined;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getStringFromRecord(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string' || value.length === 0) continue;
    const sanitized = sanitizeOptionalId(value);
    if (sanitized !== undefined) return sanitized;
  }
  return undefined;
}

function buildHookRecords(sessionId: string, hooks: readonly HookEnvelope[]): SourceRecord[] {
  const records: SourceRecord[] = [];
  const safeSession = sanitizeOptionalId(sessionId) ?? sessionId;
  for (let index = 0; index < hooks.length; index++) {
    const hook = hooks[index]!;
    if (hook.payload.session_id !== sessionId) continue;
    const spanContext = parseTraceparent(hook.traceparent);
    const source_id = sanitizeOptionalId(hook.event_id) ?? `hook-${index + 1}`;
    const record: SourceRecord = {
      source_kind: 'hook',
      source_id,
      timestamp_ms: eventTimeMs(hook),
      session_id: safeSession
    };
    if (spanContext) {
      record.trace_id = spanContext.traceId;
      record.span_id = spanContext.spanId;
    }
    const turnId = sanitizeOptionalId(getString(hook.payload, 'turn_id'));
    if (turnId !== undefined) record.turn_id = turnId;
    const toolCallId = sanitizeOptionalId(getString(hook.payload, 'tool_call_id'));
    if (toolCallId !== undefined) record.tool_call_id = toolCallId;
    records.push(record);
  }
  return records;
}

function buildMcpRecords(sessionId: string, hooks: readonly HookEnvelope[]): SourceRecord[] {
  const records: SourceRecord[] = [];
  for (let index = 0; index < hooks.length; index++) {
    const hook = hooks[index]!;
    if (hook.payload.session_id !== sessionId) continue;
    const spanContext = parseTraceparent(hook.traceparent);
    if (!spanContext) continue;
    const eventId = sanitizeOptionalId(hook.event_id) ?? `hook-${index + 1}`;
    const record: SourceRecord = {
      source_kind: 'mcp',
      source_id: `mcp:${eventId}`,
      timestamp_ms: eventTimeMs(hook),
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
      session_id: sanitizeOptionalId(sessionId) ?? sessionId
    };
    const turnId = sanitizeOptionalId(getString(hook.payload, 'turn_id'));
    if (turnId !== undefined) record.turn_id = turnId;
    const toolCallId = sanitizeOptionalId(getString(hook.payload, 'tool_call_id'));
    if (toolCallId !== undefined) record.tool_call_id = toolCallId;
    records.push(record);
  }
  return records;
}

function buildNativeTranscriptRecords(sessionId: string, nativeEvents: readonly NativeEvent[]): SourceRecord[] {
  const records: SourceRecord[] = [];
  const safeSession = sanitizeOptionalId(sessionId) ?? sessionId;
  for (let index = 0; index < nativeEvents.length; index++) {
    const event = nativeEvents[index]!;
    const data = asObject(event.data);
    const source_id = sanitizeOptionalId(event.id) ?? `native-event-${index + 1}`;
    const record: SourceRecord = {
      source_kind: 'native_transcript',
      source_id,
      timestamp_ms: parseTimestamp(event.timestamp),
      session_id: safeSession
    };
    const traceId = getStringFromRecord(data, ['traceId', 'trace_id']);
    if (traceId !== undefined) record.trace_id = traceId;
    const spanId = getStringFromRecord(data, ['spanId', 'span_id']);
    if (spanId !== undefined) record.span_id = spanId;
    const turnId = getStringFromRecord(data, ['turnId', 'turn_id']);
    if (turnId !== undefined) record.turn_id = turnId;
    const toolCallId = getStringFromRecord(data, ['toolCallId', 'tool_call_id']);
    if (toolCallId !== undefined) record.tool_call_id = toolCallId;
    records.push(record);
  }
  return records;
}

function buildNativeOtelRecords(sessionId: string, nativeOtelRecords: readonly NativeOtelRecord[]): SourceRecord[] {
  const records: SourceRecord[] = [];
  const safeSession = sanitizeOptionalId(sessionId) ?? sessionId;
  for (let index = 0; index < nativeOtelRecords.length; index++) {
    const record = nativeOtelRecords[index]!;
    if (record.session_id !== sessionId) continue;
    const source_id = sanitizeOptionalId(record.record_id) ?? `native-otel-${index + 1}`;
    const output: SourceRecord = {
      source_kind: 'native_otel',
      source_id,
      timestamp_ms: Number.isFinite(record.observed_at_unix_ms) ? Math.trunc(record.observed_at_unix_ms) : Number.NaN,
      session_id: safeSession
    };
    const traceId = sanitizeOptionalId(record.trace_id);
    if (traceId !== undefined) output.trace_id = traceId;
    const spanId = sanitizeOptionalId(record.span_id);
    if (spanId !== undefined) output.span_id = spanId;
    const turnId = sanitizeOptionalId(record.turn_id);
    if (turnId !== undefined) output.turn_id = turnId;
    const toolCallId = sanitizeOptionalId(record.tool_call_id);
    if (toolCallId !== undefined) output.tool_call_id = toolCallId;
    // Carry the complete sanitized native OTel record (signal, parent span,
    // model, usage, attributes, resource, instrumentation scope, validity,
    // and redaction accounting) so coverage/UI never has to reconstruct it
    // from a reduced identity-only projection.
    output.evidence = {
      signal: record.signal,
      parent_span_id: record.parent_span_id,
      model: record.model,
      usage: record.usage,
      attributes: record.attributes,
      resource: record.resource,
      instrumentation_scope: record.instrumentation_scope,
      content_disposition: record.content_disposition,
      validity: record.validity,
      source_file: record.source_file,
      line_number: record.line_number,
      source_hash: record.source_hash
    };
    records.push(output);
  }
  return records;
}

function buildEvidenceRecords(sessionId: string, spans: readonly ProjectedSpan[]): SourceRecord[] {
  const records: SourceRecord[] = [];
  const safeSession = sanitizeOptionalId(sessionId) ?? sessionId;
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index]!;
    if (span.session_id !== sessionId) continue;
    const source_id = sanitizeOptionalId(span.span_id) ?? `evidence-span-${index + 1}`;
    records.push({
      source_kind: 'evidence',
      source_id,
      timestamp_ms: span.start_unix_ms,
      span_id: source_id,
      session_id: safeSession
    });
  }
  return records;
}

export function buildSourceRecords(input: BuildSourceRecordsInput): SourceRecord[] {
  const sessionId = sanitizeOptionalId(input.sessionId) ?? input.sessionId;
  const records: SourceRecord[] = [
    ...buildHookRecords(sessionId, input.hooks),
    ...buildNativeTranscriptRecords(sessionId, input.nativeEvents),
    ...buildNativeOtelRecords(sessionId, input.nativeOtelRecords),
    ...buildMcpRecords(sessionId, input.hooks),
    ...buildEvidenceRecords(sessionId, input.spans)
  ];
  return records.map((record, index) => {
    const output: SourceRecord = {
      source_kind: record.source_kind,
      source_id: sanitizeOptionalId(record.source_id) ?? `${record.source_kind}-${index + 1}`,
      timestamp_ms: record.timestamp_ms
    };
    const traceId = sanitizeOptionalId(record.trace_id);
    if (traceId !== undefined) output.trace_id = traceId;
    const spanId = sanitizeOptionalId(record.span_id);
    if (spanId !== undefined) output.span_id = spanId;
    const turnId = sanitizeOptionalId(record.turn_id);
    if (turnId !== undefined) output.turn_id = turnId;
    const toolCallId = sanitizeOptionalId(record.tool_call_id);
    if (toolCallId !== undefined) output.tool_call_id = toolCallId;
    const normalizedSessionId = sanitizeOptionalId(record.session_id);
    if (normalizedSessionId !== undefined) output.session_id = normalizedSessionId;
    // Already-sanitized full evidence (native OTel signal/model/usage/
    // attributes/resource/scope/etc.) must survive this final re-mapping
    // pass, or every upstream preservation effort is discarded here instead.
    if (record.evidence !== undefined) output.evidence = record.evidence;
    return output;
  });
}

export function summarizeCoverage(entries: readonly CoverageEntry[]): CoverageTotals {
  const by_source: Record<SourceKind, number> = {
    native_otel: 0,
    native_transcript: 0,
    hook: 0,
    mcp: 0,
    evidence: 0
  };
  const by_disposition: Record<CoverageDisposition, number> = {
    rendered: 0,
    represented: 0,
    redacted: 0,
    unavailable: 0,
    unmatched: 0,
    heuristic: 0,
    deduplicated: 0,
    invalid: 0,
    late_out_of_order: 0
  };

  for (const entry of entries) {
    by_source[entry.source_kind] += 1;
    by_disposition[entry.disposition] += 1;
  }

  const total = entries.length;
  const sourceTotal = SOURCE_PRIORITY_ORDER.reduce((sum, source) => sum + by_source[source], 0);
  const dispositionTotal = DISPOSITION_ORDER.reduce((sum, disposition) => sum + by_disposition[disposition], 0);
  const balanced = sourceTotal === total && dispositionTotal === total;

  return { by_source, by_disposition, total, balanced };
}
