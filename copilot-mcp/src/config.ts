import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CopilotMcpConfig {
  host: string;
  httpPort: number;
  /** "readonly" approves read/search only; "approve-all" approves everything. */
  permissions: 'readonly' | 'approve-all';
  /** Default model for new sessions; undefined lets the CLI pick. */
  model: string | undefined;
  /** Attach to an external `copilot --headless` server instead of spawning. */
  cliUrl: string | undefined;
  /** Spawn a system-installed Copilot CLI instead of the SDK-bundled runtime. */
  cliPath: string | undefined;
  askTimeoutMs: number;
}

function packageRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(path.dirname(moduleDir)) === 'dist'
    ? path.resolve(moduleDir, '../..')
    : path.resolve(moduleDir, '..');
}

/** Merge KEY=VALUE lines from the package .env without overriding real env (SSoT: .env). */
function loadDotEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(path.join(packageRoot(), '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = (value ?? '').trim().replace(/^["']|["']$/g, '');
  }
}

function resolveCliPath(value: string | undefined): string | undefined {
  const cliPath = value?.trim();
  if (!cliPath || path.isAbsolute(cliPath) || cliPath.includes('/') || cliPath.includes('\\')) {
    return cliPath || undefined;
  }

  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    const resolved = execFileSync(command, [cliPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return resolved ?? cliPath;
  } catch {
    return cliPath;
  }
}

export function loadConfig(): CopilotMcpConfig {
  loadDotEnv();
  const permissions = process.env['COPILOT_MCP_PERMISSIONS'] === 'approve-all' ? 'approve-all' : 'readonly';
  return {
    host: process.env['COPILOT_MCP_HOST'] ?? '127.0.0.1',
    httpPort: Number(process.env['COPILOT_MCP_HTTP_PORT'] ?? 27443),
    permissions,
    model: process.env['COPILOT_MCP_MODEL'] || undefined,
    cliUrl: process.env['COPILOT_MCP_CLI_URL'] || undefined,
    cliPath: resolveCliPath(process.env['COPILOT_MCP_CLI_PATH'] || process.env['COPILOT_CLI_PATH']),
    askTimeoutMs: Number(process.env['COPILOT_MCP_ASK_TIMEOUT_MS'] ?? 300_000),
  };
}
