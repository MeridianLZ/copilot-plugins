import path from 'node:path';
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
  const value = process.env['TRACE_CONTENT_MODE'] ?? 'hash';
  if (value === 'off' || value === 'hash' || value === 'full') return value;
  throw new Error(`TRACE_CONTENT_MODE must be off, hash, or full; received ${value}`);
}

function resolveDataDir(): string {
  const configured = process.env['TRACE_DATA_DIR'] ?? '.claude/telemetry';
  if (path.isAbsolute(configured)) return configured;
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  return path.resolve(projectDir, configured);
}

export interface BridgeConfig {
  host: string;
  port: number;
  bridgeUrl: string;
  dataDir: string;
  eventsFile: string;
  spoolDir: string;
  contentMode: ContentMode;
  contentMaxBytes: number;
  postTimeoutMs: number;
  openSpanTimeoutMs: number;
  spoolDrainIntervalMs: number;
  consoleMode: 'json' | 'pretty' | 'silent';
  otlpTracesEndpoint: string;
  serviceName: string;
}

export function loadConfig(): BridgeConfig {
  const dataDir = resolveDataDir();
  const consoleValue = process.env['TRACE_CONSOLE_MODE'] ?? 'pretty';
  if (consoleValue !== 'json' && consoleValue !== 'pretty' && consoleValue !== 'silent') {
    throw new Error(`TRACE_CONSOLE_MODE must be json, pretty, or silent; received ${consoleValue}`);
  }

  return {
    host: process.env['TRACE_BRIDGE_HOST'] ?? '127.0.0.1',
    port: intFromEnv('TRACE_BRIDGE_PORT', 4319),
    bridgeUrl: process.env['TRACE_BRIDGE_URL'] ?? 'http://127.0.0.1:4319/hooks',
    dataDir,
    eventsFile: path.join(dataDir, 'events.jsonl'),
    spoolDir: path.join(dataDir, 'spool'),
    contentMode: contentModeFromEnv(),
    contentMaxBytes: intFromEnv('TRACE_CONTENT_MAX_BYTES', 32_768),
    postTimeoutMs: intFromEnv('TRACE_POST_TIMEOUT_MS', 250),
    openSpanTimeoutMs: intFromEnv('TRACE_OPEN_SPAN_TIMEOUT_MS', 1_800_000),
    spoolDrainIntervalMs: intFromEnv('TRACE_SPOOL_DRAIN_INTERVAL_MS', 2_000),
    consoleMode: consoleValue,
    otlpTracesEndpoint:
      process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'] ?? 'http://127.0.0.1:4318/v1/traces',
    serviceName: process.env['OTEL_SERVICE_NAME'] ?? 'claude-code-hook-bridge'
  };
}
