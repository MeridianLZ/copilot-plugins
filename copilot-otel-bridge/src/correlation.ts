import { redactSecrets, truncateUtf8 } from './security.js';
import { normalizeConversationIdentity, type ConversationIdentity } from './conversation-identity.js';

export type SourceKind = 'native_otel' | 'native_transcript' | 'hook' | 'mcp' | 'evidence';
export type CoverageDisposition =
  | 'rendered'
  | 'represented'
  | 'redacted'
  | 'unavailable'
  | 'unmatched'
  | 'heuristic'
  | 'deduplicated'
  | 'invalid'
  | 'late_out_of_order';

export interface SourceRecord {
  source_kind: SourceKind;
  source_id: string;
  timestamp_ms: number;
  trace_id?: string;
  span_id?: string;
  turn_id?: string;
  tool_call_id?: string;
  session_id?: string;
  identity?: ConversationIdentity;
  /**
   * Full sanitized evidence carried alongside identity fields so
   * correlation never has to reduce native OTel signal/model/usage/
   * attributes/resource/scope/status metadata before it reaches the UI.
   * Already redacted upstream (native-otel.ts / native-session.ts).
   */
  evidence?: Record<string, unknown>;
}

export interface CoverageEntry extends SourceRecord {
  disposition: CoverageDisposition;
  canonical_id?: string;
  matched_by?: 'trace_id' | 'span_id' | 'trace_span' | 'message_id' | 'agent_id' | 'hook_event_id' | 'mcp_request_id' | 'turn_id' | 'tool_call_id' | 'session_id' | 'fifo_timestamp';
  related_ids: string[];
  reason: string;
}

const SOURCE_PRIORITY: readonly SourceKind[] = ['native_otel', 'native_transcript', 'hook', 'mcp', 'evidence'];
const SOURCE_PRIORITY_RANK: Readonly<Record<SourceKind, number>> = {
  native_otel: 0,
  native_transcript: 1,
  hook: 2,
  mcp: 3,
  evidence: 4
};
type ExactMatchKey = 'message_id' | 'tool_call_id' | 'turn_id' | 'agent_id' | 'trace_span' | 'trace_id' | 'span_id' | 'hook_event_id' | 'mcp_request_id' | 'session_id';

const MATCH_PRIORITY: readonly ExactMatchKey[] = [
  'message_id',
  'tool_call_id',
  'turn_id',
  'agent_id',
  'trace_span',
  'trace_id',
  'span_id',
  'hook_event_id',
  'mcp_request_id',
  'session_id'
];
const FIFO_WINDOW_MS = 2_000;
const MAX_ID_BYTES = 256;
const MAX_REASON_BYTES = 512;

interface IndexedEntry extends CoverageEntry {
  readonly index: number;
  readonly canonical_ref: string;
  fifo_consumed: boolean;
}

function sanitizeText(value: string, maxBytes: number): string {
  const redacted = truncateUtf8(redactSecrets(value), maxBytes);
  return redacted.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeOptionalId(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const sanitized = sanitizeText(value, MAX_ID_BYTES);
  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeTimestamp(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.trunc(value);
}

function normalizeRecord(input: SourceRecord, index: number): SourceRecord {
  const sourceId = sanitizeOptionalId(input.source_id) ?? `missing-source-id-${index + 1}`;
  const normalized: SourceRecord = {
    source_kind: input.source_kind,
    source_id: sourceId,
    timestamp_ms: sanitizeTimestamp(input.timestamp_ms)
  };
  const traceId = sanitizeOptionalId(input.trace_id);
  if (traceId !== undefined) normalized.trace_id = traceId;
  const spanId = sanitizeOptionalId(input.span_id);
  if (spanId !== undefined) normalized.span_id = spanId;
  const turnId = sanitizeOptionalId(input.turn_id);
  if (turnId !== undefined) normalized.turn_id = turnId;
  const toolCallId = sanitizeOptionalId(input.tool_call_id);
  if (toolCallId !== undefined) normalized.tool_call_id = toolCallId;
  const sessionId = sanitizeOptionalId(input.session_id);
  if (sessionId !== undefined) normalized.session_id = sessionId;
  const identity = normalizeConversationIdentity({
    ...(input.identity ?? {}),
    session_id: sessionId,
    ...(turnId !== undefined ? { turn_id: turnId } : {}),
    ...(toolCallId !== undefined ? { tool_call_id: toolCallId } : {}),
    ...(traceId !== undefined ? { trace_id: traceId } : {}),
    ...(spanId !== undefined ? { span_id: spanId } : {})
  });
  if (Object.keys(identity).length > 0) normalized.identity = identity;
  // Evidence arrives already sanitized (redaction happens at the native-otel
  // / native-session parse boundary); pass it through untouched so
  // correlation never has to reduce signal/model/usage/attributes/resource/
  // scope metadata before it reaches coverage/UI.
  if (input.evidence !== undefined) normalized.evidence = input.evidence;
  return normalized;
}

function identityValue(record: SourceRecord, key: ExactMatchKey): string | undefined {
  const identity = record.identity;
  if (!identity) return undefined;
  switch (key) {
    case 'trace_span':
      return identity.trace_id !== undefined && identity.span_id !== undefined
        ? `${identity.trace_id}:${identity.span_id}`
        : undefined;
    case 'session_id':
      return identity.session_id ?? record.session_id;
    default:
      return identity[key];
  }
}

function canonicalRefOf(record: Pick<SourceRecord, 'source_kind' | 'source_id'>): string {
  return `${record.source_kind}:${record.source_id}`;
}

function isInvalidRecord(record: SourceRecord): boolean {
  if (!Number.isFinite(record.timestamp_ms) || record.timestamp_ms < 0) return true;
  if (record.source_kind !== 'native_otel') return false;
  if (record.timestamp_ms !== 0) return false;
  return (
    record.trace_id === undefined &&
    record.span_id === undefined &&
    record.turn_id === undefined &&
    record.tool_call_id === undefined &&
    record.session_id === undefined
  );
}

function rankByPriority(left: IndexedEntry, right: IndexedEntry): number {
  return (
    SOURCE_PRIORITY_RANK[left.source_kind] - SOURCE_PRIORITY_RANK[right.source_kind] ||
    left.timestamp_ms - right.timestamp_ms ||
    left.index - right.index
  );
}

function nearestByTimestamp(record: SourceRecord, candidates: readonly IndexedEntry[]): IndexedEntry | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((left, right) => {
    return (
      Math.abs(left.timestamp_ms - record.timestamp_ms) - Math.abs(right.timestamp_ms - record.timestamp_ms) ||
      rankByPriority(left, right)
    );
  })[0];
}

function findExactMatch(record: SourceRecord, active: readonly IndexedEntry[]): {
  candidate: IndexedEntry;
  matched_by: ExactMatchKey;
} | undefined {
  for (const key of MATCH_PRIORITY) {
    const value = identityValue(record, key);
    if (value === undefined) continue;
    const candidates = active.filter((entry) => {
      if (entry.source_kind === record.source_kind) return false;
      if (identityValue(entry, key) !== value) return false;
      if (key === 'session_id') {
        return Math.abs(entry.timestamp_ms - record.timestamp_ms) <= FIFO_WINDOW_MS;
      }
      return true;
    });
    if (candidates.length === 0) continue;
    if (key === 'session_id' && candidates.length > 1) continue;
    const ordered = [...candidates].sort((left, right) => {
      return (
        Math.abs(left.timestamp_ms - record.timestamp_ms) - Math.abs(right.timestamp_ms - record.timestamp_ms) ||
        rankByPriority(left, right)
      );
    });
    const candidate = ordered[0];
    if (!candidate) continue;
    return { candidate, matched_by: key };
  }
  return undefined;
}

function findFifoMatch(record: SourceRecord, active: readonly IndexedEntry[]): IndexedEntry | undefined {
  if (record.session_id === undefined) return undefined;
  const candidates = active.filter((entry) => {
    if (entry.fifo_consumed) return false;
    if (entry.source_kind === record.source_kind) return false;
    if (entry.session_id !== record.session_id) return false;
    return Math.abs(entry.timestamp_ms - record.timestamp_ms) <= FIFO_WINDOW_MS;
  });
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((left, right) => {
    return rankByPriority(left, right) || left.index - right.index;
  })[0];
}

function isLateOutOfOrder(record: SourceRecord, active: readonly IndexedEntry[]): boolean {
  if (record.session_id === undefined) return false;
  const candidates = active.filter((entry) => entry.session_id === record.session_id);
  if (candidates.length === 0) return false;
  return candidates.some((entry) => entry.timestamp_ms - record.timestamp_ms > FIFO_WINDOW_MS);
}

function addRelatedId(entry: IndexedEntry, relatedId: string): void {
  if (relatedId.length === 0) return;
  if (entry.related_ids.includes(relatedId)) return;
  entry.related_ids.push(relatedId);
}

function finalizeEntry(entry: IndexedEntry): CoverageEntry {
  const canonicalId = entry.canonical_id ? sanitizeText(entry.canonical_id, MAX_ID_BYTES) : undefined;
  const relatedIds = [...new Set(entry.related_ids.map((value) => sanitizeText(value, MAX_ID_BYTES)).filter((value) => value.length > 0))];
  const finalized: CoverageEntry = {
    source_kind: entry.source_kind,
    source_id: sanitizeText(entry.source_id, MAX_ID_BYTES),
    timestamp_ms: entry.timestamp_ms,
    disposition: entry.disposition,
    related_ids: relatedIds,
    reason: sanitizeText(entry.reason, MAX_REASON_BYTES)
  };
  if (entry.trace_id) finalized.trace_id = sanitizeText(entry.trace_id, MAX_ID_BYTES);
  if (entry.span_id) finalized.span_id = sanitizeText(entry.span_id, MAX_ID_BYTES);
  if (entry.turn_id) finalized.turn_id = sanitizeText(entry.turn_id, MAX_ID_BYTES);
  if (entry.tool_call_id) finalized.tool_call_id = sanitizeText(entry.tool_call_id, MAX_ID_BYTES);
  if (entry.session_id) finalized.session_id = sanitizeText(entry.session_id, MAX_ID_BYTES);
  if (entry.identity !== undefined) finalized.identity = entry.identity;
  if (canonicalId) finalized.canonical_id = canonicalId;
  if (entry.matched_by) finalized.matched_by = entry.matched_by;
  if (entry.evidence !== undefined) finalized.evidence = entry.evidence;
  return finalized;
}

export function correlateSources(records: readonly SourceRecord[]): CoverageEntry[] {
  const output: IndexedEntry[] = [];
  const canonicalBySource = new Map<string, IndexedEntry>();
  const active: IndexedEntry[] = [];

  for (let index = 0; index < records.length; index++) {
    const normalized = normalizeRecord(records[index]!, index);
    const canonical_ref = canonicalRefOf(normalized);
    const source_key = canonicalRefOf(normalized);

    const entry: IndexedEntry = {
      ...normalized,
      disposition: 'rendered',
      related_ids: [],
      reason: 'rendered canonical',
      index,
      canonical_ref,
      fifo_consumed: false
    };

    const duplicateOf = canonicalBySource.get(source_key);
    if (duplicateOf) {
      entry.disposition = 'deduplicated';
      entry.canonical_id = duplicateOf.canonical_ref;
      entry.reason = `duplicate source_id ${source_key}`;
      addRelatedId(entry, duplicateOf.canonical_ref);
      addRelatedId(duplicateOf, entry.canonical_ref);
      output.push(entry);
      continue;
    }
    canonicalBySource.set(source_key, entry);

    if (isInvalidRecord(normalized)) {
      entry.disposition = 'invalid';
      entry.reason = 'invalid source record';
      output.push(entry);
      continue;
    }

    if (normalized.source_kind === 'mcp' && normalized.trace_id === undefined && normalized.span_id === undefined) {
      entry.disposition = 'unavailable';
      entry.reason = 'mcp context unavailable';
      output.push(entry);
      active.push(entry);
      continue;
    }

    const exact = findExactMatch(normalized, active);
    if (exact) {
      entry.disposition = 'represented';
      entry.canonical_id = exact.candidate.canonical_ref;
      entry.matched_by = exact.matched_by;
      entry.reason = `exact match by ${exact.matched_by}`;
      addRelatedId(entry, exact.candidate.canonical_ref);
      addRelatedId(exact.candidate, entry.canonical_ref);
      output.push(entry);
      active.push(entry);
      continue;
    }

    const fifo = findFifoMatch(normalized, active);
    if (fifo) {
      entry.disposition = 'heuristic';
      entry.canonical_id = fifo.canonical_ref;
      entry.matched_by = 'fifo_timestamp';
      entry.reason = `fifo fallback within ${FIFO_WINDOW_MS}ms`;
      fifo.fifo_consumed = true;
      addRelatedId(entry, fifo.canonical_ref);
      addRelatedId(fifo, entry.canonical_ref);
      output.push(entry);
      active.push(entry);
      continue;
    }

    const sameSession = normalized.session_id
      ? active.filter((candidate) => candidate.session_id === normalized.session_id)
      : [];
    if (sameSession.length > 0) {
      const nearest = nearestByTimestamp(normalized, sameSession);
      if (nearest) {
        entry.canonical_id = nearest.canonical_ref;
        addRelatedId(entry, nearest.canonical_ref);
        addRelatedId(nearest, entry.canonical_ref);
      }
      const late = isLateOutOfOrder(normalized, active);
      entry.disposition = late ? 'late_out_of_order' : 'unmatched';
      entry.reason = late ? 'record arrived late and out of order' : 'no exact or fifo match';
      output.push(entry);
      active.push(entry);
      continue;
    }

    entry.disposition = 'rendered';
    entry.reason = 'rendered canonical';
    output.push(entry);
    active.push(entry);
  }

  return output.map((entry) => finalizeEntry(entry));
}

export const SOURCE_PRIORITY_ORDER: readonly SourceKind[] = SOURCE_PRIORITY;
