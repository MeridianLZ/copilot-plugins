import { createHash } from 'node:crypto';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createRedactionDispositionAccumulator,
  isOpaqueReasoningKey,
  sanitizeNativeOtelValue
} from './security.js';
import { normalizeConversationIdentity } from './conversation-identity.js';
import type {
  JsonValue,
  JsonObject,
  NativeOtelRecord,
  NativeSignal,
  RedactionDisposition
} from './types.js';

interface CandidateRecord {
  signal: NativeSignal;
  line: Record<string, unknown>;
  entity: Record<string, unknown>;
  attributes: Record<string, JsonValue>;
  resource: Record<string, JsonValue>;
  instrumentationScope: Record<string, JsonValue>;
  resourceContainer: Record<string, unknown> | undefined;
  scopeContainer: Record<string, unknown> | undefined;
  resourceSchemaUrl: string | undefined;
  scopeSchemaUrl: string | undefined;
  observedAtUnixMs: number | undefined;
  traceId: string | undefined;
  spanId: string | undefined;
  parentSpanId: string | undefined;
}

interface CacheEntry {
  byteOffset: number;
  lineOffset: number;
  remainder: string;
  records: NativeOtelRecord[];
  lastTouchedMs: number;
  fileIdentity: string | undefined;
  consumedPrefixFingerprint: string | undefined;
}

const IDLE_EVICT_MS = 10 * 60 * 1000;
const MAX_REFRESH_READ_BYTES = 256 * 1024;
const FINGERPRINT_SAMPLE_BYTES = 4 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeFileIdentity(metadata: Awaited<ReturnType<typeof stat>>): string {
  const birthtimeMs = Math.trunc(Number(metadata.birthtimeMs));
  const ctimeMs = Math.trunc(Number(metadata.ctimeMs));
  return `${birthtimeMs}:${ctimeMs}:${metadata.size}`;
}

async function readSlice(handle: Awaited<ReturnType<typeof open>>, position: number, length: number): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0);
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead <= 0) return Buffer.alloc(0);
  return buffer.subarray(0, bytesRead);
}

async function fingerprintConsumedPrefix(filePath: string, consumedBytes: number): Promise<string> {
  if (consumedBytes <= 0) return 'offset:0';
  const handle = await open(filePath, 'r');
  try {
    const headLength = Math.min(consumedBytes, FINGERPRINT_SAMPLE_BYTES);
    const tailLength = Math.min(consumedBytes, FINGERPRINT_SAMPLE_BYTES);
    const head = await readSlice(handle, 0, headLength);
    const tailStart = Math.max(0, consumedBytes - tailLength);
    const tail = tailStart === 0 ? head : await readSlice(handle, tailStart, tailLength);
    return createHash('sha256')
      .update(String(consumedBytes))
      .update(':')
      .update(head)
      .update(':')
      .update(String(tailStart))
      .update(':')
      .update(tail)
      .digest('hex');
  } finally {
    await handle.close();
  }
}

function getField(object: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) return object[key];
  }
  return undefined;
}

function stringField(object: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = getField(object, ...keys);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(object: Record<string, unknown>, ...keys: string[]): number | undefined {
  const value = getField(object, ...keys);
  return parseFiniteNumber(value);
}

function arrayField(object: Record<string, unknown>, ...keys: string[]): unknown[] {
  const value = getField(object, ...keys);
  return Array.isArray(value) ? value : [];
}

function recordField(object: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | undefined {
  const value = getField(object, ...keys);
  return isRecord(value) ? value : undefined;
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseEpochMs(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (/^-?\d+$/.test(trimmed)) {
      try {
        const numeric = BigInt(trimmed);
        const abs = numeric < 0n ? -numeric : numeric;
        if (abs >= 1_000_000_000_000_000n) return Number(numeric / 1_000_000n);
        if (abs >= 1_000_000_000_000n) return Number(numeric);
        if (abs >= 1_000_000_000n) return Number(numeric * 1_000n);
      } catch {
        return undefined;
      }
    }
    const parsedDate = Date.parse(trimmed);
    if (!Number.isNaN(parsedDate)) return parsedDate;
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const abs = Math.abs(value);
  if (abs >= 1e15) return Math.trunc(value / 1e6);
  if (abs >= 1e12) return Math.trunc(value);
  if (abs >= 1e9) return Math.trunc(value * 1e3);
  return undefined;
}

function camelToSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeFieldName(value: string): string {
  return camelToSnake(value);
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => toJsonValue(entry));
  if (!isRecord(value)) return String(value);
  const output: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) output[key] = toJsonValue(child);
  return output;
}

function decodeOtlpValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => decodeOtlpValue(entry));
  if (!isRecord(value)) return String(value);

  const scalarString = stringField(value, 'stringValue', 'string_value', 'bytesValue', 'bytes_value');
  if (scalarString !== undefined) return scalarString;
  const scalarBool = getField(value, 'boolValue', 'bool_value');
  if (typeof scalarBool === 'boolean') return scalarBool;
  const scalarNumber = parseFiniteNumber(getField(value, 'intValue', 'int_value', 'doubleValue', 'double_value'));
  if (scalarNumber !== undefined) return scalarNumber;

  const arrayContainer = recordField(value, 'arrayValue', 'array_value');
  if (arrayContainer) {
    const values = arrayField(arrayContainer, 'values');
    return values.map((entry) => decodeOtlpValue(entry));
  }

  const kvlistContainer = recordField(value, 'kvlistValue', 'kvlist_value');
  if (kvlistContainer) {
    const values = arrayField(kvlistContainer, 'values');
    return attributesToMap(values);
  }

  if (Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return decodeOtlpValue(value['value']);
  }

  return toJsonValue(value);
}

function attributesToMap(value: unknown): Record<string, JsonValue> {
  if (Array.isArray(value)) {
    const output: Record<string, JsonValue> = {};
    for (const entry of value) {
      if (!isRecord(entry)) continue;
      const key = stringField(entry, 'key');
      if (!key) continue;
      output[key] = decodeOtlpValue(entry['value']);
    }
    return output;
  }
  if (isRecord(value)) {
    const output: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) output[key] = decodeOtlpValue(entry);
    return output;
  }
  return {};
}

function resourceToMap(value: unknown): Record<string, JsonValue> {
  if (!isRecord(value)) return {};
  const output = attributesToMap(getField(value, 'attributes'));
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'attributes') continue;
    output[key] = decodeOtlpValue(entry);
  }
  return output;
}

function scopeToMap(value: unknown): Record<string, JsonValue> {
  if (!isRecord(value)) return {};
  const output: Record<string, JsonValue> = {};
  const name = stringField(value, 'name');
  if (name !== undefined) output['name'] = name;
  const version = stringField(value, 'version');
  if (version !== undefined) output['version'] = version;
  const attrs = attributesToMap(getField(value, 'attributes'));
  for (const [key, entry] of Object.entries(attrs)) output[key] = entry;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'name' || key === 'version' || key === 'attributes') continue;
    output[key] = decodeOtlpValue(entry);
  }
  return output;
}

function mergeMaps(...maps: ReadonlyArray<Record<string, JsonValue>>): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) output[key] = value;
  }
  return output;
}

function buildLookup(
  attributes: Record<string, JsonValue>,
  resource: Record<string, JsonValue>,
  scope: Record<string, JsonValue>,
  line: Record<string, unknown>,
  entity: Record<string, unknown>
): Map<string, JsonValue> {
  const output = new Map<string, JsonValue>();
  for (const [key, value] of Object.entries(attributes)) output.set(normalizeFieldName(key), value);
  for (const [key, value] of Object.entries(resource)) output.set(normalizeFieldName(key), value);
  for (const [key, value] of Object.entries(scope)) output.set(normalizeFieldName(key), value);

  const materialize = (object: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
        output.set(normalizeFieldName(key), value);
      }
    }
  };
  materialize(line);
  if (entity !== line) materialize(entity);
  return output;
}

function lookupString(lookup: Map<string, JsonValue>, aliases: readonly string[]): string | undefined {
  for (const alias of aliases) {
    const value = lookup.get(alias);
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function lookupNumber(lookup: Map<string, JsonValue>, aliases: readonly string[]): number | undefined {
  for (const alias of aliases) {
    const value = lookup.get(alias);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function inferSignalFromSourceFile(sourceFile: string): NativeSignal {
  const lower = sourceFile.toLowerCase();
  if (lower.includes('trace')) return 'trace';
  if (lower.includes('metric')) return 'metric';
  return 'log';
}

function inferSignal(line: Record<string, unknown>, sourceFile: string): NativeSignal {
  const hint = stringField(line, 'signal', 'signal_type');
  if (hint === 'trace' || hint === 'metric' || hint === 'log') return hint;
  if (Array.isArray(getField(line, 'resourceSpans', 'resource_spans'))) return 'trace';
  if (Array.isArray(getField(line, 'resourceMetrics', 'resource_metrics'))) return 'metric';
  if (Array.isArray(getField(line, 'resourceLogs', 'resource_logs'))) return 'log';
  return inferSignalFromSourceFile(sourceFile);
}

function extractObservedAtUnixMs(...objects: ReadonlyArray<Record<string, unknown>>): number | undefined {
  const keys = [
    'observed_at_unix_ms',
    'observedAtUnixMs',
    'time_unix_ms',
    'timeUnixMs',
    'observedTimeUnixNano',
    'observed_time_unix_nano',
    'timeUnixNano',
    'time_unix_nano',
    'startTimeUnixNano',
    'start_time_unix_nano',
    'endTimeUnixNano',
    'end_time_unix_nano',
    'timestamp'
  ];
  for (const object of objects) {
    for (const key of keys) {
      const parsed = parseEpochMs(getField(object, key));
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function parseTraceCandidates(line: Record<string, unknown>): CandidateRecord[] {
  const output: CandidateRecord[] = [];
  const resourceSpans = arrayField(line, 'resourceSpans', 'resource_spans');
  for (const resourceSpanCandidate of resourceSpans) {
    if (!isRecord(resourceSpanCandidate)) continue;
    const resource = resourceToMap(getField(resourceSpanCandidate, 'resource'));
    const scopeSpans = arrayField(resourceSpanCandidate, 'scopeSpans', 'scope_spans');
    const scopeContainers = scopeSpans.length > 0
      ? scopeSpans
      : [{ scope: getField(resourceSpanCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope'), spans: getField(resourceSpanCandidate, 'spans') }];
    for (const scopeSpanCandidate of scopeContainers) {
      if (!isRecord(scopeSpanCandidate)) continue;
      const instrumentationScope = scopeToMap(
        getField(scopeSpanCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope')
      );
      const spans = arrayField(scopeSpanCandidate, 'spans');
      for (const spanCandidate of spans) {
        if (!isRecord(spanCandidate)) continue;
        const attributes = attributesToMap(getField(spanCandidate, 'attributes'));
        const spanName = stringField(spanCandidate, 'name');
        if (spanName !== undefined) attributes['span.name'] = spanName;
        const spanKind = stringField(spanCandidate, 'kind');
        if (spanKind !== undefined) attributes['span.kind'] = spanKind;
        output.push({
          signal: 'trace',
          line,
          entity: spanCandidate,
          attributes,
          resource,
          instrumentationScope,
          resourceContainer: recordField(resourceSpanCandidate, 'resource'),
          scopeContainer: recordField(scopeSpanCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope'),
          resourceSchemaUrl: stringField(resourceSpanCandidate, 'schemaUrl', 'schema_url'),
          scopeSchemaUrl: stringField(scopeSpanCandidate, 'schemaUrl', 'schema_url'),
          observedAtUnixMs: extractObservedAtUnixMs(spanCandidate, scopeSpanCandidate, resourceSpanCandidate, line),
          traceId: stringField(spanCandidate, 'traceId', 'trace_id'),
          spanId: stringField(spanCandidate, 'spanId', 'span_id'),
          parentSpanId: stringField(spanCandidate, 'parentSpanId', 'parent_span_id')
        });
      }
    }
  }
  return output;
}

function collectMetricPoints(metric: Record<string, unknown>): { kind: string; point: Record<string, unknown> }[] {
  const output: { kind: string; point: Record<string, unknown> }[] = [];
  const containers: Array<[string, Record<string, unknown> | undefined]> = [
    ['sum', recordField(metric, 'sum')],
    ['gauge', recordField(metric, 'gauge')],
    ['histogram', recordField(metric, 'histogram')],
    ['exponential_histogram', recordField(metric, 'exponentialHistogram', 'exponential_histogram')],
    ['summary', recordField(metric, 'summary')]
  ];
  for (const [kind, container] of containers) {
    if (!container) continue;
    const points = arrayField(container, 'dataPoints', 'data_points');
    for (const point of points) {
      if (!isRecord(point)) continue;
      output.push({ kind, point });
    }
  }
  return output;
}

function parseMetricCandidates(line: Record<string, unknown>): CandidateRecord[] {
  const output: CandidateRecord[] = [];
  const resourceMetrics = arrayField(line, 'resourceMetrics', 'resource_metrics');
  for (const resourceMetricCandidate of resourceMetrics) {
    if (!isRecord(resourceMetricCandidate)) continue;
    const resource = resourceToMap(getField(resourceMetricCandidate, 'resource'));
    const scopeMetrics = arrayField(resourceMetricCandidate, 'scopeMetrics', 'scope_metrics');
    const scopeContainers = scopeMetrics.length > 0
      ? scopeMetrics
      : [{ scope: getField(resourceMetricCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope'), metrics: getField(resourceMetricCandidate, 'metrics') }];
    for (const scopeMetricCandidate of scopeContainers) {
      if (!isRecord(scopeMetricCandidate)) continue;
      const instrumentationScope = scopeToMap(
        getField(scopeMetricCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope')
      );
      const metrics = arrayField(scopeMetricCandidate, 'metrics');
      for (const metricCandidate of metrics) {
        if (!isRecord(metricCandidate)) continue;
        const metricName = stringField(metricCandidate, 'name');
        const metricUnit = stringField(metricCandidate, 'unit');
        const points = collectMetricPoints(metricCandidate);
        if (points.length === 0) {
          const attributes = attributesToMap(getField(metricCandidate, 'attributes'));
          if (metricName !== undefined) attributes['metric.name'] = metricName;
          if (metricUnit !== undefined) attributes['metric.unit'] = metricUnit;
          output.push({
            signal: 'metric',
            line,
            entity: metricCandidate,
            attributes,
            resource,
            instrumentationScope,
            resourceContainer: recordField(resourceMetricCandidate, 'resource'),
            scopeContainer: recordField(scopeMetricCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope'),
            resourceSchemaUrl: stringField(resourceMetricCandidate, 'schemaUrl', 'schema_url'),
            scopeSchemaUrl: stringField(scopeMetricCandidate, 'schemaUrl', 'schema_url'),
            observedAtUnixMs: extractObservedAtUnixMs(metricCandidate, scopeMetricCandidate, resourceMetricCandidate, line),
            traceId: undefined,
            spanId: undefined,
            parentSpanId: undefined
          });
          continue;
        }
        for (const item of points) {
          const attributes = attributesToMap(getField(item.point, 'attributes'));
          if (metricName !== undefined) attributes['metric.name'] = metricName;
          if (metricUnit !== undefined) attributes['metric.unit'] = metricUnit;
          attributes['metric.type'] = item.kind;
          const intValue = numberField(item.point, 'asInt', 'as_int');
          const doubleValue = numberField(item.point, 'asDouble', 'as_double');
          if (intValue !== undefined) attributes['metric.value'] = intValue;
          if (doubleValue !== undefined) attributes['metric.value'] = doubleValue;
          output.push({
            signal: 'metric',
            line,
            entity: item.point,
            attributes,
            resource,
            instrumentationScope,
            resourceContainer: recordField(resourceMetricCandidate, 'resource'),
            scopeContainer: recordField(scopeMetricCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope'),
            resourceSchemaUrl: stringField(resourceMetricCandidate, 'schemaUrl', 'schema_url'),
            scopeSchemaUrl: stringField(scopeMetricCandidate, 'schemaUrl', 'schema_url'),
            observedAtUnixMs: extractObservedAtUnixMs(item.point, metricCandidate, scopeMetricCandidate, resourceMetricCandidate, line),
            traceId: undefined,
            spanId: undefined,
            parentSpanId: undefined
          });
        }
      }
    }
  }
  return output;
}

function parseLogCandidates(line: Record<string, unknown>): CandidateRecord[] {
  const output: CandidateRecord[] = [];
  const resourceLogs = arrayField(line, 'resourceLogs', 'resource_logs');
  for (const resourceLogCandidate of resourceLogs) {
    if (!isRecord(resourceLogCandidate)) continue;
    const resource = resourceToMap(getField(resourceLogCandidate, 'resource'));
    const scopeLogs = arrayField(resourceLogCandidate, 'scopeLogs', 'scope_logs');
    const scopeContainers = scopeLogs.length > 0
      ? scopeLogs
      : [{ scope: getField(resourceLogCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope'), logRecords: getField(resourceLogCandidate, 'logRecords', 'log_records') }];
    for (const scopeLogCandidate of scopeContainers) {
      if (!isRecord(scopeLogCandidate)) continue;
      const instrumentationScope = scopeToMap(
        getField(scopeLogCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope')
      );
      const records = arrayField(scopeLogCandidate, 'logRecords', 'log_records');
      for (const logRecordCandidate of records) {
        if (!isRecord(logRecordCandidate)) continue;
        const attributes = attributesToMap(getField(logRecordCandidate, 'attributes'));
        const body = getField(logRecordCandidate, 'body');
        if (body !== undefined) attributes['body'] = decodeOtlpValue(body);
        const severityText = stringField(logRecordCandidate, 'severityText', 'severity_text');
        if (severityText !== undefined) attributes['severity_text'] = severityText;
        output.push({
          signal: 'log',
          line,
          entity: logRecordCandidate,
          attributes,
          resource,
          instrumentationScope,
          resourceContainer: recordField(resourceLogCandidate, 'resource'),
          scopeContainer: recordField(scopeLogCandidate, 'scope', 'instrumentationScope', 'instrumentation_scope'),
          resourceSchemaUrl: stringField(resourceLogCandidate, 'schemaUrl', 'schema_url'),
          scopeSchemaUrl: stringField(scopeLogCandidate, 'schemaUrl', 'schema_url'),
          observedAtUnixMs: extractObservedAtUnixMs(logRecordCandidate, scopeLogCandidate, resourceLogCandidate, line),
          traceId: stringField(logRecordCandidate, 'traceId', 'trace_id'),
          spanId: stringField(logRecordCandidate, 'spanId', 'span_id'),
          parentSpanId: undefined
        });
      }
    }
  }
  return output;
}

function parseDirectCandidate(signal: NativeSignal, line: Record<string, unknown>): CandidateRecord {
  const attributes = attributesToMap(getField(line, 'attributes'));
  const resource = resourceToMap(getField(line, 'resource'));
  const instrumentationScope = scopeToMap(
    getField(line, 'instrumentationScope', 'instrumentation_scope', 'scope')
  );
  const body = getField(line, 'body');
  if (body !== undefined) attributes['body'] = decodeOtlpValue(body);
  return {
    signal,
    line,
    entity: line,
    attributes,
    resource,
    instrumentationScope,
    resourceContainer: recordField(line, 'resource'),
    scopeContainer: recordField(line, 'instrumentationScope', 'instrumentation_scope', 'scope'),
    resourceSchemaUrl: stringField(line, 'resourceSchemaUrl', 'resource_schema_url'),
    scopeSchemaUrl: stringField(line, 'scopeSchemaUrl', 'scope_schema_url'),
    observedAtUnixMs: extractObservedAtUnixMs(line),
    traceId: stringField(line, 'traceId', 'trace_id'),
    spanId: stringField(line, 'spanId', 'span_id'),
    parentSpanId: stringField(line, 'parentSpanId', 'parent_span_id')
  };
}

function sanitizeRecordMap(
  input: Record<string, JsonValue>,
  keyPath: string,
  disposition: RedactionDisposition
): Record<string, JsonValue> {
  const sanitized = sanitizeNativeOtelValue(keyPath, input, disposition);
  if (isRecord(sanitized)) return sanitized as Record<string, JsonValue>;
  return {};
}

function sanitizeRawObject(
  input: Record<string, unknown> | undefined,
  keyPath: string,
  disposition: RedactionDisposition
): JsonObject | undefined {
  if (input === undefined) return undefined;
  const converted = toJsonValue(input);
  const sanitized = sanitizeNativeOtelValue(keyPath, converted, disposition);
  return isRecord(sanitized) ? redactOtlpKeyValueArrays(sanitized as JsonObject, disposition) : undefined;
}

function redactOtlpKeyValueArrays(value: JsonObject, disposition: RedactionDisposition): JsonObject {
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      output[key] = child.map((entry) => {
        if (!isRecord(entry)) return entry;
        const attributeKey = entry['key'];
        if (typeof attributeKey === 'string' && isOpaqueReasoningKey(attributeKey) && entry['value'] !== undefined) {
          const redacted = sanitizeNativeOtelValue(
            attributeKey,
            '[REDACTED_reasoning_ciphertext]',
            disposition
          );
          return { ...entry, value: redacted };
        }
        return isRecord(entry) ? redactOtlpKeyValueArrays(entry, disposition) : entry;
      });
      continue;
    }
    output[key] = isRecord(child)
      ? redactOtlpKeyValueArrays(child, disposition)
      : child;
  }
  return output;
}

function usageKeyFromNormalized(normalized: string): string | undefined {
  if (normalized.includes('usage')) {
    const suffix = normalized.replace(/^.*usage_?/, '');
    if (suffix.length > 0) return suffix;
  }
  if (normalized.endsWith('tokens') || normalized.endsWith('token_count') || normalized.endsWith('nano_aiu')) {
    return normalized;
  }
  return undefined;
}

function extractUsage(
  lookup: Map<string, JsonValue>,
  line: Record<string, unknown>,
  entity: Record<string, unknown>
): Record<string, number> | undefined {
  const usage: Record<string, number> = {};

  const collectFromLookup = (): void => {
    for (const [key, value] of lookup) {
      const normalizedUsageKey = usageKeyFromNormalized(key);
      if (!normalizedUsageKey) continue;
      if (typeof value === 'number' && Number.isFinite(value)) usage[normalizedUsageKey] = value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) usage[normalizedUsageKey] = parsed;
      }
    }
  };

  const collectFromUsageObject = (object: Record<string, unknown>): void => {
    const rawUsage = recordField(object, 'usage');
    if (!rawUsage) return;
    for (const [key, value] of Object.entries(rawUsage)) {
      const parsed = parseFiniteNumber(value);
      if (parsed === undefined) continue;
      usage[normalizeFieldName(key)] = parsed;
    }
  };

  collectFromLookup();
  collectFromUsageObject(line);
  if (entity !== line) collectFromUsageObject(entity);

  return Object.keys(usage).length > 0 ? usage : undefined;
}

function recordId(
  sourceFile: string,
  lineNumber: number,
  signal: NativeSignal,
  sourceHash: string,
  ordinal: number,
  validity: 'valid' | 'invalid'
): string {
  return createHash('sha256')
    .update(`${sourceFile}:${lineNumber}:${signal}:${sourceHash}:${ordinal}:${validity}`)
    .digest('hex');
}

function invalidRecord(
  sourceFile: string,
  lineNumber: number,
  signal: NativeSignal,
  sourceHash: string
): NativeOtelRecord {
  const disposition = createRedactionDispositionAccumulator();
  return {
    record_id: recordId(sourceFile, lineNumber, signal, sourceHash, 0, 'invalid'),
    source_file: sourceFile,
    line_number: lineNumber,
    signal,
    observed_at_unix_ms: 0,
    attributes: {},
    resource: {},
    instrumentation_scope: {},
    content_disposition: disposition,
    validity: 'invalid',
    source_hash: sourceHash
  };
}

function truncationResetRecord(
  sourceFile: string,
  previousByteOffset: number,
  previousLineNumber: number,
  previousRemainder: string,
  newByteSize: number,
  resetKind: 'size_decrease' | 'prefix_discontinuity'
): NativeOtelRecord {
  const signal = inferSignalFromSourceFile(sourceFile);
  const contextLine = Math.max(1, previousLineNumber + (previousRemainder.length > 0 ? 1 : 0));
  const sourceHash = createHash('sha256')
    .update(`truncated:${sourceFile}:${previousByteOffset}:${previousLineNumber}:${newByteSize}`)
    .digest('hex');
  return {
    record_id: recordId(sourceFile, contextLine, signal, sourceHash, 0, 'invalid'),
    source_file: sourceFile,
    line_number: contextLine,
    signal,
    observed_at_unix_ms: 0,
    attributes: {
      reason: 'source_truncated_reset',
      reset_kind: resetKind,
      previous_byte_offset: previousByteOffset,
      previous_line_number: previousLineNumber,
      new_byte_size: newByteSize,
      had_partial_line: previousRemainder.length > 0
    },
    resource: {},
    instrumentation_scope: {},
    content_disposition: createRedactionDispositionAccumulator(),
    validity: 'invalid',
    source_hash: sourceHash
  };
}

function extractStringFromLookupOrObject(
  lookup: Map<string, JsonValue>,
  entity: Record<string, unknown>,
  line: Record<string, unknown>,
  aliases: readonly string[]
): string | undefined {
  const fromEntity = stringField(entity, ...aliases);
  if (fromEntity !== undefined) return fromEntity;
  const fromLine = stringField(line, ...aliases);
  if (fromLine !== undefined) return fromLine;
  return lookupString(lookup, aliases.map((alias) => normalizeFieldName(alias)));
}

function normalizeCandidate(
  candidate: CandidateRecord,
  sourceFile: string,
  lineNumber: number,
  sourceHash: string,
  ordinal: number
): NativeOtelRecord {
  const disposition = createRedactionDispositionAccumulator();
  const attributes = sanitizeRecordMap(candidate.attributes, 'attributes', disposition);
  const resource = sanitizeRecordMap(candidate.resource, 'resource', disposition);
  const instrumentationScope = sanitizeRecordMap(candidate.instrumentationScope, 'instrumentation_scope', disposition);
  const rawRecord = sanitizeRawObject(candidate.line, 'raw_record', disposition);
  const rawEntity = sanitizeRawObject(candidate.entity, 'raw_entity', disposition);
  const rawResource = sanitizeRawObject(candidate.resourceContainer, 'raw_resource', disposition);
  const rawScope = sanitizeRawObject(candidate.scopeContainer, 'raw_scope', disposition);
  const lookup = buildLookup(attributes, resource, instrumentationScope, candidate.line, candidate.entity);
  const usage = extractUsage(lookup, candidate.line, candidate.entity);
  const identity = normalizeConversationIdentity({
    ...candidate.line,
    ...candidate.entity,
    ...attributes,
    ...resource,
    ...instrumentationScope
  });

  const sessionId = extractStringFromLookupOrObject(lookup, candidate.entity, candidate.line, [
    'session_id',
    'session.id',
    'copilot.session.id',
    'github.copilot.session_id',
    'github.copilot.session.id'
  ]);
  const turnId = extractStringFromLookupOrObject(lookup, candidate.entity, candidate.line, [
    'turn_id',
    'turn.id',
    'copilot.turn.id',
    'copilot.turn_id'
  ]);
  const toolCallId = extractStringFromLookupOrObject(lookup, candidate.entity, candidate.line, [
    'tool_call_id',
    'tool.call.id',
    'toolCallId',
    'copilot.tool.call.id',
    'copilot.tool_call_id'
  ]);
  const model = extractStringFromLookupOrObject(lookup, candidate.entity, candidate.line, [
    'model',
    'gen_ai.request.model',
    'gen_ai.response.model',
    'gen_ai.model',
    'llm.model'
  ]);

  const observedAtUnixMs = candidate.observedAtUnixMs
    ?? lookupNumber(lookup, ['observed_at_unix_ms', 'time_unix_ms'])
    ?? 0;

  return {
    record_id: recordId(sourceFile, lineNumber, candidate.signal, sourceHash, ordinal, 'valid'),
    source_file: sourceFile,
    line_number: lineNumber,
    signal: candidate.signal,
    observed_at_unix_ms: observedAtUnixMs,
    ...(candidate.traceId !== undefined ? { trace_id: candidate.traceId } : {}),
    ...(candidate.spanId !== undefined ? { span_id: candidate.spanId } : {}),
    ...(candidate.parentSpanId !== undefined ? { parent_span_id: candidate.parentSpanId } : {}),
    ...(sessionId !== undefined ? { session_id: sessionId } : {}),
    ...(turnId !== undefined ? { turn_id: turnId } : {}),
    ...(toolCallId !== undefined ? { tool_call_id: toolCallId } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(usage !== undefined ? { usage } : {}),
    attributes,
    resource,
    instrumentation_scope: instrumentationScope,
    ...(Object.keys(identity).length > 0 ? { identity } : {}),
    ...(rawRecord !== undefined ? { raw_record: rawRecord } : {}),
    ...(rawEntity !== undefined ? { raw_entity: rawEntity } : {}),
    ...(rawResource !== undefined ? { raw_resource: rawResource } : {}),
    ...(rawScope !== undefined ? { raw_scope: rawScope } : {}),
    ...(candidate.resourceSchemaUrl !== undefined ? { raw_resource_schema_url: candidate.resourceSchemaUrl } : {}),
    ...(candidate.scopeSchemaUrl !== undefined ? { raw_scope_schema_url: candidate.scopeSchemaUrl } : {}),
    content_disposition: disposition,
    validity: 'valid',
    source_hash: sourceHash
  };
}

export function parseNativeOtelLines(lines: readonly string[], sourceFile: string): NativeOtelRecord[] {
  const records: NativeOtelRecord[] = [];
  const fallbackSignal = inferSignalFromSourceFile(sourceFile);

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    if (rawLine === undefined) continue;
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;
    const sourceHash = createHash('sha256').update(rawLine).digest('hex');

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      records.push(invalidRecord(sourceFile, lineNumber, fallbackSignal, sourceHash));
      continue;
    }
    if (!isRecord(parsed)) {
      records.push(invalidRecord(sourceFile, lineNumber, fallbackSignal, sourceHash));
      continue;
    }

    const signal = inferSignal(parsed, sourceFile);
    let candidates: CandidateRecord[] = [];
    if (signal === 'trace') candidates = parseTraceCandidates(parsed);
    if (signal === 'metric') candidates = parseMetricCandidates(parsed);
    if (signal === 'log') candidates = parseLogCandidates(parsed);
    if (candidates.length === 0) candidates = [parseDirectCandidate(signal, parsed)];

    let ordinal = 0;
    for (const candidate of candidates) {
      records.push(normalizeCandidate(candidate, sourceFile, lineNumber, sourceHash, ordinal));
      ordinal += 1;
    }
    if (ordinal === 0) {
      records.push(invalidRecord(sourceFile, lineNumber, signal, sourceHash));
    }
  }

  return records;
}

function compareRecords(left: NativeOtelRecord, right: NativeOtelRecord): number {
  return (
    left.observed_at_unix_ms - right.observed_at_unix_ms ||
    left.source_file.localeCompare(right.source_file) ||
    left.line_number - right.line_number ||
    left.record_id.localeCompare(right.record_id)
  );
}

export class NativeOtelCache {
  readonly #entries = new Map<string, CacheEntry>();
  #refreshTail: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string, private readonly maxRecords: number) {}

  getRecords(): Promise<NativeOtelRecord[]> {
    const refresh = this.#refreshTail.then(() => this.#refreshRecords());
    this.#refreshTail = refresh.then(() => undefined, () => undefined);
    return refresh;
  }

  async #refreshRecords(): Promise<NativeOtelRecord[]> {
    const now = Date.now();
    const seen = new Set<string>();
    let files: string[] = [];
    try {
      files = (await readdir(this.directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.jsonl'))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // transient directory read failure: return cached data
      }
    }

    for (const fileName of files) {
      const absolutePath = path.join(this.directory, fileName);
      seen.add(absolutePath);
      let entry = this.#entries.get(absolutePath);
      if (!entry) {
        entry = {
          byteOffset: 0,
          lineOffset: 0,
          remainder: '',
          records: [],
          lastTouchedMs: now,
          fileIdentity: undefined,
          consumedPrefixFingerprint: undefined
        };
        this.#entries.set(absolutePath, entry);
      }
      entry.lastTouchedMs = now;
      await this.#refreshFile(absolutePath, entry);
    }

    for (const [filePath, entry] of this.#entries) {
      if (seen.has(filePath)) continue;
      if (now - entry.lastTouchedMs > IDLE_EVICT_MS) this.#entries.delete(filePath);
    }

    this.#enforceMaxRecords();
    return this.#allRecords();
  }

  async #refreshFile(filePath: string, entry: CacheEntry): Promise<void> {
    try {
      const metadata = await stat(filePath);
      const currentIdentity = describeFileIdentity(metadata);

      let resetKind: 'size_decrease' | 'prefix_discontinuity' | undefined;
      if (metadata.size < entry.byteOffset) {
        resetKind = 'size_decrease';
      } else if (entry.byteOffset > 0) {
        const currentPrefixFingerprint = await fingerprintConsumedPrefix(filePath, entry.byteOffset);
        if (
          entry.consumedPrefixFingerprint !== undefined &&
          currentPrefixFingerprint !== entry.consumedPrefixFingerprint
        ) {
          resetKind = 'prefix_discontinuity';
        } else {
          entry.consumedPrefixFingerprint = currentPrefixFingerprint;
        }
      }

      if (resetKind !== undefined) {
        const resetRecord = truncationResetRecord(
          filePath,
          entry.byteOffset,
          entry.lineOffset,
          entry.remainder,
          metadata.size,
          resetKind
        );
        entry.byteOffset = 0;
        entry.lineOffset = 0;
        entry.remainder = '';
        entry.records = [resetRecord];
        entry.consumedPrefixFingerprint = undefined;
      }

      entry.fileIdentity = currentIdentity;
      if (metadata.size <= entry.byteOffset) return;

      const length = Math.min(metadata.size - entry.byteOffset, MAX_REFRESH_READ_BYTES);
      const buffer = Buffer.alloc(length);
      const handle = await open(filePath, 'r');
      let bytesRead = 0;
      try {
        const readResult = await handle.read(buffer, 0, length, entry.byteOffset);
        bytesRead = readResult.bytesRead;
      } finally {
        await handle.close();
      }
      if (bytesRead <= 0) return;

      entry.byteOffset += bytesRead;
      const chunk = `${entry.remainder}${buffer.subarray(0, bytesRead).toString('utf8')}`;
      const lines = chunk.split('\n');
      entry.remainder = lines.pop() ?? '';
      if (lines.length > 0) {
        const parsed = parseNativeOtelLines(lines, filePath);
        for (const record of parsed) {
          entry.records.push({
            ...record,
            line_number: record.line_number + entry.lineOffset
          });
        }
        entry.lineOffset += lines.length;
      }

      if (entry.byteOffset > 0) {
        entry.consumedPrefixFingerprint = await fingerprintConsumedPrefix(filePath, entry.byteOffset);
      } else {
        entry.consumedPrefixFingerprint = undefined;
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // transient file lock/read failure: preserve current cache state
      }
    }
  }

  #allRecords(): NativeOtelRecord[] {
    return Array.from(this.#entries.values())
      .flatMap((entry) => entry.records)
      .sort(compareRecords);
  }

  #enforceMaxRecords(): void {
    const limit = Number.isFinite(this.maxRecords) ? Math.max(0, Math.floor(this.maxRecords)) : 0;
    if (limit === 0) {
      for (const entry of this.#entries.values()) entry.records = [];
      return;
    }
    const all = this.#allRecords();
    if (all.length <= limit) return;
    const keep = new Set(all.slice(-limit).map((record) => record.record_id));
    for (const entry of this.#entries.values()) {
      entry.records = entry.records.filter((record) => keep.has(record.record_id));
    }
  }
}
