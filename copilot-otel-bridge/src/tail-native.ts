import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

async function main(): Promise<void> {
  const configured = process.env['COPILOT_TAIL_FILE'] ?? '.copilot/telemetry/native-otel.jsonl';
  const filePath = path.resolve(configured);
  let offset = 0;
  let remainder = '';
  try { offset = (await stat(filePath)).size; } catch { offset = 0; }
  process.stdout.write(`[tail:native] following ${filePath} from byte ${offset}\n`);

  for (;;) {
    try {
      const metadata = await stat(filePath);
      if (metadata.size < offset) { offset = 0; remainder = ''; }
      if (metadata.size > offset) {
        const length = metadata.size - offset;
        const buffer = Buffer.alloc(length);
        const handle = await open(filePath, 'r');
        try { await handle.read(buffer, 0, length, offset); } finally { await handle.close(); }
        offset = metadata.size;
        const lines = (remainder + buffer.toString('utf8')).split('\n');
        remainder = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) process.stdout.write(`${line}\n`);
      }
    } catch {
      // Native OTel file appears after Copilot emits its first signal.
    }
    await sleep(250);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[tail:native] fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
