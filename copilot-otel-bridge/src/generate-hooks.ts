import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COPILOT_HOOK_EVENTS,
  isJsonObject,
  type CopilotHookEventName,
  type JsonObject,
  type JsonValue
} from './types.js';

type Scope = 'project' | 'user';
type Transport = 'command' | 'http';

const CLOUD_EVENTS = new Set<CopilotHookEventName>([
  'agentStop',
  'errorOccurred',
  'postToolUse',
  'postToolUseFailure',
  'preCompact',
  'preToolUse',
  'sessionEnd',
  'sessionStart',
  'subagentStart',
  'subagentStop',
  'userPromptSubmitted',
  'userPromptTransformed'
]);

function objectFromUnknown(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sourceRootFromModule(): string {
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(path.dirname(sourceDir)) === 'dist'
    ? path.resolve(sourceDir, '../..')
    : path.resolve(sourceDir, '..');
}

function isOurHandler(value: JsonValue): boolean {
  return isJsonObject(value) && isJsonObject(value['env']) && value['env']['COPILOT_OTEL_BRIDGE_HANDLER'] === '1';
}

function removeOurHandlers(value: JsonValue | undefined): JsonValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => !isOurHandler(entry));
}

function commandHandler(
  event: CopilotHookEventName,
  sourceRoot: string,
  egressPath: string,
  dataDir: string,
  bridgeUrl: string
): JsonObject {
  const node = process.execPath;
  return {
    type: 'command',
    bash: `${shellQuote(node)} ${shellQuote(egressPath)}`,
    powershell: `& ${powershellQuote(node)} ${powershellQuote(egressPath)}`,
    cwd: sourceRoot,
    env: {
      COPILOT_OTEL_BRIDGE_HANDLER: '1',
      COPILOT_HOOK_EVENT: event,
      COPILOT_TRACE_BRIDGE_URL: bridgeUrl,
      COPILOT_TRACE_DATA_DIR: dataDir,
      COPILOT_TRACE_CONTENT_MODE: 'hash',
      COPILOT_TRACE_POST_TIMEOUT_MS: '250'
    },
    timeoutSec: 2
  };
}

function httpHandler(event: CopilotHookEventName, baseUrl: string): JsonObject {
  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/${event}`;
  if ((event === 'preToolUse' || event === 'permissionRequest') && !url.startsWith('https://')) {
    throw new Error(`${event} HTTP hooks require an https:// URL because their response can grant permission`);
  }
  return {
    type: 'http',
    url,
    headers: {
      'X-Copilot-Hook-Event': event,
      'X-Agent-Observability-Source': 'github-copilot-cli'
    },
    timeoutSec: 2
  };
}

async function readJson(filePath: string): Promise<JsonObject> {
  try {
    return objectFromUnknown(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

function targetPaths(scope: Scope, targetRoot: string): { generated: string; applied: string } {
  if (scope === 'user') {
    const home = process.env['COPILOT_HOME'] ?? path.join(homedir(), '.copilot');
    const directory = path.join(home, 'hooks');
    return {
      generated: path.join(directory, 'copilot-otel-bridge.generated.json'),
      applied: path.join(directory, 'copilot-otel-bridge.json')
    };
  }
  const directory = path.join(targetRoot, '.github', 'hooks');
  return {
    generated: path.join(directory, 'copilot-otel-bridge.generated.json'),
    applied: path.join(directory, 'copilot-otel-bridge.json')
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const cloud = process.argv.includes('--cloud');
  const scopeRaw = argValue('--scope') ?? 'project';
  const transportRaw = argValue('--transport') ?? (cloud ? 'http' : 'command');
  if (scopeRaw !== 'project' && scopeRaw !== 'user') throw new Error('--scope must be project or user');
  if (transportRaw !== 'command' && transportRaw !== 'http') throw new Error('--transport must be command or http');
  const scope: Scope = scopeRaw;
  const transport: Transport = transportRaw;
  const targetRoot = path.resolve(argValue('--target') ?? process.cwd());
  const sourceRoot = sourceRootFromModule();
  const egressPath = path.join(sourceRoot, 'dist', 'src', 'hook-egress.js');
  const dataDir = path.resolve(argValue('--data-dir') ?? path.join(sourceRoot, '.copilot', 'telemetry'));
  const bridgeUrl = argValue('--url') ?? 'http://127.0.0.1:14329/hooks';
  if (transport === 'http' && !argValue('--url')) {
    throw new Error('--transport http requires --url https://collector.example/hooks');
  }

  const paths = targetPaths(scope, targetRoot);
  await mkdir(path.dirname(paths.generated), { recursive: true });
  const existing = await readJson(apply ? paths.applied : paths.generated);
  const existingHooks = objectFromUnknown(existing['hooks']);
  const hooks: JsonObject = { ...existingHooks };
  const selectedEvents = COPILOT_HOOK_EVENTS.filter((event) => !cloud || CLOUD_EVENTS.has(event));

  for (const event of selectedEvents) {
    const handler = transport === 'command'
      ? commandHandler(event, sourceRoot, egressPath, dataDir, bridgeUrl)
      : httpHandler(event, bridgeUrl);
    hooks[event] = [...removeOurHandlers(existingHooks[event]), handler];
  }

  const document: JsonObject = {
    ...existing,
    version: 1,
    hooks
  };
  const outputPath = apply ? paths.applied : paths.generated;
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  process.stdout.write(`[hooks] ${apply ? 'applied' : 'generated'} ${outputPath}\n`);
  process.stdout.write(`[hooks] installed ${selectedEvents.length} observer events via ${transport}${cloud ? ' (cloud-safe subset)' : ''}\n`);
  if (!apply) process.stdout.write('[hooks] rerun with --apply after reviewing the generated file\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`[hooks] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
