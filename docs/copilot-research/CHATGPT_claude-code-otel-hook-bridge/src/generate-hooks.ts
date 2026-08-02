import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOK_EVENTS, isJsonObject, type HookEventName, type JsonObject, type JsonValue } from './types.js';

interface HookHandler extends JsonObject {
  type: 'command';
  command: string;
  args: JsonValue[];
  timeout: number;
  async: boolean;
}

interface HookGroup extends JsonObject {
  matcher?: string;
  hooks: JsonValue[];
}

function objectFromUnknown(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function hookGroupsForEvent(event: HookEventName, handler: HookHandler): HookGroup[] {
  if (event === 'FileChanged') {
    return ['.env', '.envrc', 'package.json', 'pnpm-lock.yaml', 'compose.yml', 'compose.env.yml'].map(
      (matcher) => ({ matcher, hooks: [handler] })
    );
  }
  return [{ hooks: [handler] }];
}

function removeOurGroups(value: JsonValue | undefined, command: string, egressPath: string): JsonValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((group) => {
    if (!isJsonObject(group)) return true;
    const handlers = group['hooks'];
    if (!Array.isArray(handlers)) return true;
    return !handlers.some(
      (handler) =>
        isJsonObject(handler) &&
        handler['type'] === 'command' &&
        handler['command'] === command &&
        Array.isArray(handler['args']) &&
        handler['args'].includes(egressPath)
    );
  });
}

function mergeSettings(
  existing: JsonObject,
  fragment: JsonObject,
  command: string,
  egressPath: string
): JsonObject {
  const merged: JsonObject = { ...existing };
  merged['env'] = {
    ...objectFromUnknown(existing['env']),
    ...objectFromUnknown(fragment['env'])
  };

  const existingHooks = objectFromUnknown(existing['hooks']);
  const fragmentHooks = objectFromUnknown(fragment['hooks']);
  const mergedHooks: JsonObject = { ...existingHooks };
  for (const [event, groups] of Object.entries(fragmentHooks)) {
    mergedHooks[event] = [...removeOurGroups(existingHooks[event], command, egressPath), ...(Array.isArray(groups) ? groups : [])];
  }
  merged['hooks'] = mergedHooks;
  return merged;
}

async function readJsonFile(filePath: string): Promise<JsonObject> {
  try {
    return objectFromUnknown(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const targetIndex = process.argv.indexOf('--target');
  const targetRoot = targetIndex >= 0 ? path.resolve(process.argv[targetIndex + 1] ?? '.') : process.cwd();
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const sourceRoot = path.basename(path.dirname(sourceDir)) === 'dist'
    ? path.resolve(sourceDir, '../..')
    : path.resolve(sourceDir, '..');
  const compiledEgress = path.resolve(sourceRoot, 'dist/src/hook-egress.js');
  const sharedDataDir = path.resolve(sourceRoot, '.claude/telemetry');
  const command = process.execPath;

  const handler: HookHandler = {
    type: 'command',
    command,
    args: [compiledEgress],
    timeout: 2,
    async: false
  };

  const hooks: JsonObject = {};
  for (const event of HOOK_EVENTS) {
    // Registering WorktreeCreate replaces Claude Code's default worktree creation.
    // It is mapped in docs/hook-map.md but intentionally not installed as an observer.
    if (event === 'WorktreeCreate') continue;
    hooks[event] = hookGroupsForEvent(event, handler);
  }

  const fragment: JsonObject = {
    env: {
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
      OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_LOGS_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      TRACE_BRIDGE_URL: 'http://127.0.0.1:4319/hooks',
      TRACE_DATA_DIR: sharedDataDir,
      TRACE_POST_TIMEOUT_MS: '250',
      TRACE_CONTENT_MODE: 'hash'
    },
    hooks
  };

  const claudeDir = path.join(targetRoot, '.claude');
  await mkdir(claudeDir, { recursive: true });
  const generatedPath = path.join(claudeDir, 'otel-hooks.generated.json');
  await writeFile(generatedPath, `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
  process.stdout.write(`[hooks] generated ${generatedPath}\n`);
  process.stdout.write('[hooks] intentionally omitted WorktreeCreate; see docs/hook-map.md\n');

  if (!apply) return;
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const existing = await readJsonFile(settingsPath);
  const merged = mergeSettings(existing, fragment, command, compiledEgress);
  await writeFile(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  process.stdout.write(`[hooks] additively merged ${settingsPath}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[hooks] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
