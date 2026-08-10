import { homedir } from 'node:os';
import path from 'node:path';
import { validateLocalTelemetryEndpoint } from './local-runtime.js';
import type { ContentMode } from './types.js';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; received ${raw}`);
  }
  return parsed;
}

function contentModeFromEnv(): ContentMode {
  const value = process.env['COPILOT_TRACE_CONTENT_MODE'] ?? 'hash';
  if (value === 'off' || value === 'hash' || value === 'full') return value;
  throw new Error(`COPILOT_TRACE_CONTENT_MODE must be off, hash, or full; received ${value}`);
}

function resolveDataDir(): string {
  const configured = process.env['COPILOT_TRACE_DATA_DIR'] ?? '.copilot/telemetry';
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(process.cwd(), configured);
}

export interface BridgeConfig {
  host: string;
  port: number;
  bridgeUrl: string;
  dataDir: string;
  eventsFile: string;
  spoolDir: string;
  nativeOtelDirectory: string;
  nativeOtelMaxRecords: number;
  contentMode: ContentMode;
  contentMaxBytes: number;
  postTimeoutMs: number;
  openSpanTimeoutMs: number;
  spoolDrainIntervalMs: number;
  consoleMode: 'json' | 'pretty' | 'silent';
  otlpTracesEndpoint: string;
  localTelemetry?: {
    endpoint: URL;
    hostname: string;
  };
  serviceName: string;
  dedupeWindowMs: number;
  copilotHome: string;
}

function telemetryHostname(endpoint: URL): string {
  return endpoint.hostname.replace(/^\[(.+)\]$/, '$1');
}

export function withValidatedLocalTelemetry(config: BridgeConfig): BridgeConfig {
  const endpoint = validateLocalTelemetryEndpoint(config.otlpTracesEndpoint);
  return {
    ...config,
    otlpTracesEndpoint: endpoint.toString(),
    localTelemetry: {
      endpoint,
      hostname: telemetryHostname(endpoint)
    }
  };
}

export function loadConfig(): BridgeConfig {
  const dataDir = resolveDataDir();
  const consoleValue = process.env['COPILOT_TRACE_CONSOLE_MODE'] ?? 'pretty';
  if (consoleValue !== 'json' && consoleValue !== 'pretty' && consoleValue !== 'silent') {
    throw new Error(`COPILOT_TRACE_CONSOLE_MODE must be json, pretty, or silent; received ${consoleValue}`);
  }

  return {
    host: process.env['COPILOT_TRACE_BRIDGE_HOST'] ?? '127.0.0.1',
    port: intFromEnv('COPILOT_TRACE_BRIDGE_PORT', 14329),
    bridgeUrl: process.env['COPILOT_TRACE_BRIDGE_URL'] ?? 'http://127.0.0.1:14329/hooks',
    dataDir,
    eventsFile: path.join(dataDir, 'hook-events.jsonl'),
    spoolDir: path.join(dataDir, 'spool'),
    nativeOtelDirectory: process.env['COPILOT_TRACE_NATIVE_OTEL_DIR'] ?? path.join(dataDir, 'native-otel'),
    nativeOtelMaxRecords: intFromEnv('COPILOT_TRACE_NATIVE_OTEL_MAX_RECORDS', 100_000),
    contentMode: contentModeFromEnv(),
    contentMaxBytes: intFromEnv('COPILOT_TRACE_CONTENT_MAX_BYTES', 32_768),
    postTimeoutMs: intFromEnv('COPILOT_TRACE_POST_TIMEOUT_MS', 250),
    openSpanTimeoutMs: intFromEnv('COPILOT_TRACE_OPEN_SPAN_TIMEOUT_MS', 1_800_000),
    spoolDrainIntervalMs: intFromEnv('COPILOT_TRACE_SPOOL_DRAIN_INTERVAL_MS', 2_000),
    consoleMode: consoleValue,
    otlpTracesEndpoint:
      process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'] ?? 'http://127.0.0.1:27432/v1/traces',
    serviceName: process.env['OTEL_SERVICE_NAME'] ?? 'github-copilot-cli-hook-bridge',
    dedupeWindowMs: intFromEnv('COPILOT_TRACE_DEDUPE_WINDOW_MS', 10_000),
    copilotHome: process.env['COPILOT_HOME'] ?? path.join(homedir(), '.copilot')
  };
}
