import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { HookEnvelope } from './types.js';

export async function ensureDataDirectories(dataDir: string, spoolDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(spoolDir, { recursive: true, mode: 0o700 });
}

export async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  const handle = await open(filePath, 'a', 0o600);
  try {
    await handle.write(`${JSON.stringify(value)}\n`, undefined, 'utf8');
  } finally {
    await handle.close();
  }
}

export async function writeSpoolFile(spoolDir: string, envelope: HookEnvelope): Promise<string> {
  await mkdir(spoolDir, { recursive: true, mode: 0o700 });
  const finalPath = path.join(spoolDir, `${envelope.observed_at_unix_ms}-${envelope.event_id}.json`);
  const tempPath = `${finalPath}.${process.pid}.tmp`;
  const handle = await open(tempPath, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(envelope), 'utf8');
  } finally {
    await handle.close();
  }
  await rename(tempPath, finalPath);
  return finalPath;
}

export async function drainSpool(
  spoolDir: string,
  consumer: (envelope: HookEnvelope) => Promise<void>,
  parse: (value: unknown) => HookEnvelope
): Promise<number> {
  let entries: string[];
  try {
    entries = (await readdir(spoolDir)).filter((entry) => entry.endsWith('.json')).sort();
  } catch {
    return 0;
  }

  let drained = 0;
  for (const entry of entries) {
    const filePath = path.join(spoolDir, entry);
    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile()) continue;
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
      const envelope = parse(parsed);
      await consumer({ ...envelope, source: 'spool-replay' });
      await rm(filePath, { force: true });
      drained += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[spool] retained ${filePath}: ${message}\n`);
    }
  }
  return drained;
}

export async function readStdin(maxBytes = 4 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new Error(`stdin exceeded ${maxBytes} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}
