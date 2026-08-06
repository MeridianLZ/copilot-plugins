import { createHash } from 'node:crypto';
import type { AttributeValue } from '@opentelemetry/api';
import type { ContentMode, JsonObject, JsonValue } from './types.js';

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

const SECRET_PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
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

export function redactSecrets(input: string): string {
  return SECRET_PATTERNS.reduce((current, item) => current.replace(item.pattern, item.replacement), input);
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

function truncateUtf8(value: string, maxBytes: number): string {
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
  if (typeof value === 'string') return truncateUtf8(redactSecrets(value), maxBytes);
  const serialized = truncateUtf8(redactSecrets(stableJson(value)), maxBytes);
  try {
    return JSON.parse(serialized) as JsonValue;
  } catch {
    return serialized;
  }
}

export function sanitizeJson(value: JsonValue, mode: ContentMode, maxBytes: number, key = ''): JsonValue {
  if (CONTENT_KEYS.has(key)) return sanitizeContent(value, mode, maxBytes);
  if (typeof value === 'string') return truncateUtf8(redactSecrets(value), maxBytes);
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
