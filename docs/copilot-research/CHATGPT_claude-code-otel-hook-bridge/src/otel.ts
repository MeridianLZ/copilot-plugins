import os from 'node:os';
import {
  ROOT_CONTEXT,
  SpanKind,
  TraceFlags,
  isSpanContextValid,
  trace,
  type Attributes,
  type Context,
  type Link,
  type Span,
  type SpanContext,
  type Tracer
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  ATTR_HOST_NAME,
  ATTR_OS_TYPE,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';
import type { BridgeConfig } from './config.js';

export interface TelemetryRuntime {
  tracer: Tracer;
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

function parseResourceAttributes(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const output: Record<string, string> = {};
  for (const segment of raw.split(',')) {
    const index = segment.indexOf('=');
    if (index <= 0) continue;
    const key = segment.slice(0, index).trim();
    const value = segment.slice(index + 1).trim();
    if (key.length > 0 && value.length > 0) output[key] = decodeURIComponent(value);
  }
  return output;
}

export function initializeTelemetry(config: BridgeConfig): TelemetryRuntime {
  const exporter = new OTLPTraceExporter({ url: config.otlpTracesEndpoint });
  const processor = new BatchSpanProcessor(exporter, {
    maxQueueSize: 4096,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 500,
    exportTimeoutMillis: 10_000
  });

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: '1.0.0',
    [ATTR_HOST_NAME]: os.hostname(),
    [ATTR_OS_TYPE]: process.platform,
    ...parseResourceAttributes(process.env['OTEL_RESOURCE_ATTRIBUTES'])
  });

  const provider = new NodeTracerProvider({ resource, spanProcessors: [processor] });
  provider.register();

  return {
    tracer: provider.getTracer('claude-code-hook-bridge', '1.0.0'),
    forceFlush: () => provider.forceFlush(),
    shutdown: () => provider.shutdown()
  };
}

export function parseTraceparent(value: string | undefined): SpanContext | undefined {
  if (!value) return undefined;
  const match = /^([\da-f]{2})-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})(?:-|$)/i.exec(value.trim());
  if (!match) return undefined;
  const traceId = match[2]?.toLowerCase();
  const spanId = match[3]?.toLowerCase();
  const flags = match[4];
  if (!traceId || !spanId || !flags) return undefined;
  const spanContext: SpanContext = {
    traceId,
    spanId,
    traceFlags: (Number.parseInt(flags, 16) & 0x01) === 0x01 ? TraceFlags.SAMPLED : TraceFlags.NONE,
    isRemote: true
  };
  return isSpanContextValid(spanContext) ? spanContext : undefined;
}

export function contextFromSpanContext(spanContext: SpanContext | undefined): Context {
  return spanContext ? trace.setSpanContext(ROOT_CONTEXT, spanContext) : ROOT_CONTEXT;
}

export function contextFromSpan(span: Span | undefined): Context {
  return span ? trace.setSpan(ROOT_CONTEXT, span) : ROOT_CONTEXT;
}

export function linkFromSpanContext(
  spanContext: SpanContext | undefined,
  attributes?: Attributes
): Link | undefined {
  return spanContext ? { context: spanContext, ...(attributes ? { attributes } : {}) } : undefined;
}

export function startPointSpan(
  tracer: Tracer,
  name: string,
  timestamp: Date,
  attributes: Attributes,
  parentContext: Context,
  links: Link[] = []
): Span {
  return tracer.startSpan(
    name,
    {
      kind: SpanKind.INTERNAL,
      startTime: timestamp,
      attributes,
      links
    },
    parentContext
  );
}
