import { createHash } from 'node:crypto';
import type { AttributeValue } from '@opentelemetry/api';
import type {
  ContentMode,
  JsonObject,
  JsonValue,
  RedactionDisposition,
  RedactionKind,
  SecretMatch
} from './types.js';

const CONTENT_KEYS = new Set([
  'prompt',
  'initial_prompt',
  'transformed_prompt',
  'last_assistant_message',
  'response',
  'message',
  'additional_context',
  'tool_input',
  'tool_result',
  'text_result_for_llm',
  'custom_instructions',
  'stack',
  'error',
  'description',
  'agent_description',
  'command',
  'url'
]);

const REDACTION_POLICY_VERSION = 'otel-redaction-policy-v1';
const AUTHENTICATED_PROXY_URI_PATTERN =
  /\bhttps?:\/\/(?:[^@\s/:]+(?::[^@\s/]*)?)@[^/\s?#:]+(?::\d{1,5})?(?:[/?#][^\s]*)?/gi;
const PROXY_ASSIGNMENT_PATTERN = /\b(?:HTTP|HTTPS)_PROXY\s*=\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s\r\n;]+)/gi;
const BASE64_CANDIDATE_PATTERN = /\b[A-Za-z0-9+/]{16,}={0,2}\b/g;
const MAX_URL_ENCODED_CANDIDATE_LENGTH = 8_192;
const REDACTION_KIND_ORDER: readonly RedactionKind[] = ['raw', 'base64', 'url_encoded', 'proxy_uri', 'secret_pattern'];

type SecretPattern = { pattern: RegExp; replacement: string };
type SecretMatchCandidate = SecretMatch & { replacement: string; priority: number };
type SanitizedSecretsResult = {
  text: string;
  disposition: RedactionDisposition;
  includes: (search: string, position?: number) => boolean;
  toString: () => string;
  valueOf: () => string;
  [Symbol.toPrimitive]: () => string;
};

const SECRET_PATTERNS: readonly SecretPattern[] = [
  { pattern: /\bghp_[A-Za-z0-9]{20,}\b/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED_AWS_ACCESS_KEY]' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, replacement: 'Bearer [REDACTED]' },
  {
    pattern: /("?(?:password|passwd|secret|token|api[_-]?key)"?\s*[:=]\s*)[^,\s}\]]+/gi,
    replacement: '$1[REDACTED]'
  }
];

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && otherStart < end;
}

function overlapsAny(start: number, end: number, ranges: readonly { start: number; end: number }[]): boolean {
  return ranges.some((range) => overlaps(start, end, range.start, range.end));
}

function isAuthenticatedProxyUri(value: string): boolean {
  return /https?:\/\/(?:[^@\s/:]+(?::[^@\s/]*)?)@[^/\s?#:]+/i.test(value);
}

function decodeBase64Candidate(value: string): string | undefined {
  if (value.length < 16 || value.length > 8_192) return undefined;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return undefined;
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${'='.repeat(padLength)}`;
  try {
    const decodedBuffer = Buffer.from(padded, 'base64');
    const decoded = decodedBuffer.toString('utf8');
    if (decoded.length === 0) return undefined;
    const normalizedInput = normalized.replace(/=+$/, '');
    const normalizedDecoded = decodedBuffer.toString('base64').replace(/=+$/, '');
    if (normalizedDecoded !== normalizedInput) return undefined;
    return decoded;
  } catch {
    return undefined;
  }
}

function decodeUrlEncodedCandidate(value: string): string | undefined {
  if (!/%[0-9A-Fa-f]{2}/.test(value) || value.length > MAX_URL_ENCODED_CANDIDATE_LENGTH) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function isHexDigitCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 70) ||
    (code >= 97 && code <= 102)
  );
}

function isUrlEncodedCandidateCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 46 ||
    code === 95 ||
    code === 126 ||
    code === 58 ||
    code === 47 ||
    code === 63 ||
    code === 35 ||
    code === 91 ||
    code === 93 ||
    code === 64 ||
    code === 33 ||
    code === 36 ||
    code === 38 ||
    code === 39 ||
    code === 40 ||
    code === 41 ||
    code === 42 ||
    code === 43 ||
    code === 44 ||
    code === 59 ||
    code === 61 ||
    code === 37 ||
    code === 45
  );
}

function isPercentHexTriplet(value: string, index: number): boolean {
  return (
    value[index] === '%' &&
    index + 2 < value.length &&
    isHexDigitCode(value.charCodeAt(index + 1)) &&
    isHexDigitCode(value.charCodeAt(index + 2))
  );
}

type UrlEncodedScanMetrics = { scanSteps: number };

function splitUrlEncodedRunIntoBoundedCandidates(
  input: string,
  runStart: number,
  runEnd: number,
  metrics: UrlEncodedScanMetrics
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let chunkStart = runStart;
  while (chunkStart < runEnd) {
    let chunkEnd = Math.min(chunkStart + MAX_URL_ENCODED_CANDIDATE_LENGTH, runEnd);
    if (chunkEnd < runEnd) {
      if (input[chunkEnd - 1] === '%') chunkEnd -= 1;
      else if (chunkEnd - 2 >= chunkStart && input[chunkEnd - 2] === '%') chunkEnd -= 2;
    }

    let hasTriplet = false;
    for (let index = chunkStart; index + 2 < chunkEnd; index++) {
      metrics.scanSteps++;
      if (isPercentHexTriplet(input, index)) {
        hasTriplet = true;
        break;
      }
    }

    if (hasTriplet) ranges.push({ start: chunkStart, end: chunkEnd });
    chunkStart = chunkEnd;
  }

  return ranges;
}

function collectUrlEncodedCandidateRanges(input: string, metrics: UrlEncodedScanMetrics): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let index = 0;
  while (index < input.length) {
    while (index < input.length) {
      metrics.scanSteps++;
      if (isUrlEncodedCandidateCode(input.charCodeAt(index))) break;
      index++;
    }
    if (index >= input.length) break;

    const runStart = index;
    let hasTripletInRun = false;
    while (index < input.length) {
      metrics.scanSteps++;
      if (!isUrlEncodedCandidateCode(input.charCodeAt(index))) break;
      if (!hasTripletInRun && isPercentHexTriplet(input, index)) hasTripletInRun = true;
      index++;
    }

    if (!hasTripletInRun) continue;
    ranges.push(...splitUrlEncodedRunIntoBoundedCandidates(input, runStart, index, metrics));
  }

  return ranges;
}

export function collectUrlEncodedCandidateMetricsForTest(input: string): { rangeCount: number; scanSteps: number } {
  const metrics: UrlEncodedScanMetrics = { scanSteps: 0 };
  const ranges = collectUrlEncodedCandidateRanges(input, metrics);
  return { rangeCount: ranges.length, scanSteps: metrics.scanSteps };
}

function resolveReplacementTemplate(template: string, match: RegExpExecArray): string {
  if (!template.includes('$')) return template;
  const matchedText = match[0] ?? '';
  const sourceText = match.input ?? '';
  const matchIndex = match.index ?? 0;
  return template.replace(/\$(\$|&|`|'|[1-9]\d?)/g, (_token, group: string) => {
    if (group === '$') return '$';
    if (group === '&') return matchedText;
    if (group === '`') return sourceText.slice(0, matchIndex);
    if (group === "'") return sourceText.slice(matchIndex + matchedText.length);
    const captureIndex = Number.parseInt(group, 10);
    return match[captureIndex] ?? '';
  });
}

function addMatchesForPattern(
  input: string,
  pattern: RegExp,
  kind: RedactionKind,
  replacement: string,
  priority: number,
  output: SecretMatchCandidate[],
  skipRanges: readonly { start: number; end: number }[] = []
): void {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(input);
  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    if (end > start && !overlapsAny(start, end, skipRanges)) {
      output.push({
        kind,
        start,
        end,
        replacement: resolveReplacementTemplate(replacement, match),
        priority
      });
    }
    if (match[0].length === 0) pattern.lastIndex++;
    match = pattern.exec(input);
  }
}

function normalizeMatches(matches: readonly SecretMatchCandidate[]): SecretMatchCandidate[] {
  const sorted = [...matches].sort(
    (left, right) =>
      left.start - right.start ||
      right.priority - left.priority ||
      right.end - left.end ||
      left.kind.localeCompare(right.kind)
  );
  const normalized: SecretMatchCandidate[] = [];
  for (const candidate of sorted) {
    const previous = normalized[normalized.length - 1];
    if (!previous || candidate.start >= previous.end) {
      normalized.push({ ...candidate });
      continue;
    }
    const candidateWins =
      candidate.priority > previous.priority ||
      (candidate.priority === previous.priority && candidate.end - candidate.start > previous.end - previous.start);
    if (candidateWins) {
      previous.kind = candidate.kind;
      previous.replacement = candidate.replacement;
      previous.priority = candidate.priority;
    }
    previous.start = Math.min(previous.start, candidate.start);
    previous.end = Math.max(previous.end, candidate.end);
  }
  return normalized.sort((left, right) => left.start - right.start || left.end - right.end);
}

function orderedKinds(matches: readonly SecretMatchCandidate[]): RedactionKind[] {
  const kinds = new Set<RedactionKind>(matches.map((match) => match.kind));
  return REDACTION_KIND_ORDER.filter((kind) => kinds.has(kind));
}

function collectSecretMatches(input: string): SecretMatchCandidate[] {
  const candidates: SecretMatchCandidate[] = [];
  for (const item of SECRET_PATTERNS) {
    addMatchesForPattern(input, item.pattern, 'secret_pattern', item.replacement, 30, candidates);
  }

  const proxyRanges: { start: number; end: number }[] = [];
  PROXY_ASSIGNMENT_PATTERN.lastIndex = 0;
  let assignmentMatch: RegExpExecArray | null = PROXY_ASSIGNMENT_PATTERN.exec(input);
  while (assignmentMatch) {
    const assignment = assignmentMatch[0];
    const equalsOffset = assignment.indexOf('=');
    if (equalsOffset >= 0) {
      let valueStart = assignmentMatch.index + equalsOffset + 1;
      while (valueStart < input.length && /\s/.test(input[valueStart] ?? '')) valueStart++;
      const valueEnd = assignmentMatch.index + assignment.length;
      if (valueEnd > valueStart) {
        proxyRanges.push({ start: valueStart, end: valueEnd });
        candidates.push({
          kind: 'proxy_uri',
          start: valueStart,
          end: valueEnd,
          replacement: '[REDACTED_proxy_uri]',
          priority: 90
        });
      }
    }
    if (assignmentMatch[0].length === 0) PROXY_ASSIGNMENT_PATTERN.lastIndex++;
    assignmentMatch = PROXY_ASSIGNMENT_PATTERN.exec(input);
  }

  addMatchesForPattern(input, AUTHENTICATED_PROXY_URI_PATTERN, 'raw', '[REDACTED_raw]', 80, candidates, proxyRanges);

  BASE64_CANDIDATE_PATTERN.lastIndex = 0;
  let base64Match: RegExpExecArray | null = BASE64_CANDIDATE_PATTERN.exec(input);
  while (base64Match) {
    const decoded = decodeBase64Candidate(base64Match[0]);
    if (decoded && isAuthenticatedProxyUri(decoded)) {
      candidates.push({
        kind: 'base64',
        start: base64Match.index,
        end: base64Match.index + base64Match[0].length,
        replacement: '[REDACTED_base64]',
        priority: 70
      });
    }
    if (base64Match[0].length === 0) BASE64_CANDIDATE_PATTERN.lastIndex++;
    base64Match = BASE64_CANDIDATE_PATTERN.exec(input);
  }

  const encodedRanges = collectUrlEncodedCandidateRanges(input, { scanSteps: 0 });
  for (const range of encodedRanges) {
    const encodedValue = input.slice(range.start, range.end);
    const decoded = decodeUrlEncodedCandidate(encodedValue);
    if (decoded && isAuthenticatedProxyUri(decoded)) {
      candidates.push({
        kind: 'url_encoded',
        start: range.start,
        end: range.end,
        replacement: '[REDACTED_url_encoded]',
        priority: 60
      });
    }
  }

  return normalizeMatches(candidates);
}

function createSanitizedSecretsResult(text: string, disposition: RedactionDisposition): SanitizedSecretsResult {
  return {
    text,
    disposition,
    includes: (search: string, position?: number) => text.includes(search, position),
    toString: () => text,
    valueOf: () => text,
    [Symbol.toPrimitive]: () => text
  };
}

export function findSecretMatches(input: string): SecretMatch[] {
  return collectSecretMatches(input).map((match) => ({ kind: match.kind, start: match.start, end: match.end }));
}

export function sanitizeSecrets(input: string): SanitizedSecretsResult {
  const matches = collectSecretMatches(input);
  if (matches.length === 0) {
    return createSanitizedSecretsResult(input, {
      redacted: false,
      policy_version: REDACTION_POLICY_VERSION,
      kinds: [],
      bytes: utf8Bytes(input)
    });
  }

  let text = input;
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index];
    if (!match) continue;
    text = `${text.slice(0, match.start)}${match.replacement}${text.slice(match.end)}`;
  }

  return createSanitizedSecretsResult(text, {
    redacted: true,
    policy_version: REDACTION_POLICY_VERSION,
    kinds: orderedKinds(matches),
    bytes: utf8Bytes(input)
  });
}

export function redactSecrets(input: string): string {
  return sanitizeSecrets(input).text;
}

function normalizeRedactionKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function isOpaqueReasoningKey(keyPath: string): boolean {
  const normalized = normalizeRedactionKey(keyPath);
  if (!normalized.includes('reasoning')) return false;
  return normalized.includes('opaque') || normalized.includes('cipher') || normalized.includes('encrypt');
}

function mergeDispositionKinds(target: RedactionDisposition, additions: readonly RedactionKind[]): void {
  if (additions.length === 0) return;
  const kinds = new Set<RedactionKind>(target.kinds);
  for (const kind of additions) kinds.add(kind);
  target.kinds = REDACTION_KIND_ORDER.filter((kind) => kinds.has(kind));
}

function mergeDisposition(target: RedactionDisposition, incoming: RedactionDisposition): void {
  if (incoming.redacted) target.redacted = true;
  target.bytes += incoming.bytes;
  if (!target.policy_version) target.policy_version = incoming.policy_version;
  mergeDispositionKinds(target, incoming.kinds);
}

export function createRedactionDispositionAccumulator(): RedactionDisposition {
  return {
    redacted: false,
    policy_version: REDACTION_POLICY_VERSION,
    kinds: [],
    bytes: 0
  };
}

export function sanitizeNativeOtelValue(
  keyPath: string,
  value: JsonValue,
  disposition: RedactionDisposition = createRedactionDispositionAccumulator()
): JsonValue {
  if (typeof value === 'string') {
    if (isOpaqueReasoningKey(keyPath)) {
      const incoming: RedactionDisposition = {
        redacted: true,
        policy_version: REDACTION_POLICY_VERSION,
        kinds: ['secret_pattern'],
        bytes: utf8Bytes(value)
      };
      mergeDisposition(disposition, incoming);
      return '[REDACTED_reasoning_ciphertext]';
    }
    const sanitized = sanitizeSecrets(value);
    mergeDisposition(disposition, sanitized.disposition);
    return sanitized.text;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeNativeOtelValue(`${keyPath}[${index}]`, entry, disposition));
  }

  if (value === null || typeof value !== 'object') return value;
  const output: JsonObject = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitizeNativeOtelValue(`${keyPath}.${childKey}`, childValue, disposition);
  }
  return output;
}

export function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key] ?? null)}`).join(',')}}`;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Bytes(value) <= maxBytes) return value;
  const marker = `…[TRUNCATED to ${maxBytes} bytes]`;
  const markerBytes = utf8Bytes(marker);
  const target = Math.max(0, maxBytes - markerBytes);
  return Buffer.concat([Buffer.from(value, 'utf8').subarray(0, target), Buffer.from(marker)]).toString('utf8');
}

function contentSummary(value: JsonValue): JsonObject {
  const serialized = stableJson(value);
  return {
    redacted: true,
    sha256: createHash('sha256').update(serialized).digest('hex'),
    bytes: utf8Bytes(serialized)
  };
}

function sanitizeContent(value: JsonValue, mode: ContentMode, maxBytes: number): JsonValue {
  if (mode === 'off') return { redacted: true };
  if (mode === 'hash') return contentSummary(value);
  if (typeof value === 'string') {
    const sanitized = sanitizeNativeOtelValue('content', value);
    return truncateUtf8(typeof sanitized === 'string' ? sanitized : stableJson(sanitized), maxBytes);
  }
  const serialized = truncateUtf8(sanitizeSecrets(stableJson(value)).text, maxBytes);
  try {
    return JSON.parse(serialized) as JsonValue;
  } catch {
    return serialized;
  }
}

export function sanitizeJson(value: JsonValue, mode: ContentMode, maxBytes: number, key = ''): JsonValue {
  if (CONTENT_KEYS.has(key)) return sanitizeContent(value, mode, maxBytes);
  if (typeof value === 'string') {
    const sanitized = sanitizeNativeOtelValue(key, value);
    return truncateUtf8(typeof sanitized === 'string' ? sanitized : stableJson(sanitized), maxBytes);
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 256).map((entry) => sanitizeJson(entry, mode, maxBytes));

  const output: JsonObject = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitizeJson(childValue, mode, maxBytes, childKey);
  }
  return output;
}

export function flattenAttributes(
  value: JsonObject,
  prefix: string,
  maxDepth = 4,
  maxAttributes = 128,
  maxValueBytes = 16_384
): Record<string, AttributeValue> {
  const output: Record<string, AttributeValue> = {};
  const visit = (current: JsonValue, key: string, depth: number): void => {
    if (Object.keys(output).length >= maxAttributes || current === null) return;
    if (typeof current === 'string') {
      output[key] = truncateUtf8(current, maxValueBytes);
      return;
    }
    if (typeof current === 'number' || typeof current === 'boolean') {
      output[key] = current;
      return;
    }
    if (Array.isArray(current)) {
      const primitives = current.filter(
        (entry): entry is string | number | boolean =>
          typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
      );
      const homogeneous = primitives.length > 0 && primitives.every((entry) => typeof entry === typeof primitives[0]);
      if (primitives.length === current.length && primitives.length <= 64 && homogeneous) {
        if (typeof primitives[0] === 'string') output[key] = primitives as string[];
        else if (typeof primitives[0] === 'number') output[key] = primitives as number[];
        else output[key] = primitives as boolean[];
      } else output[`${key}.json`] = truncateUtf8(stableJson(current), maxValueBytes);
      return;
    }
    if (depth >= maxDepth) {
      output[`${key}.json`] = truncateUtf8(stableJson(current), maxValueBytes);
      return;
    }
    for (const [childKey, childValue] of Object.entries(current)) {
      visit(childValue, `${key}.${childKey}`, depth + 1);
    }
  };

  for (const [key, childValue] of Object.entries(value)) visit(childValue, `${prefix}.${key}`, 0);
  return output;
}
