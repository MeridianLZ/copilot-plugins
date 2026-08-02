import { open, stat } from 'node:fs/promises';
import { loadConfig } from './config.js';
import { setTimeout as sleep } from 'node:timers/promises';

async function main(): Promise<void> {
  const config = loadConfig();
  let offset = 0;
  let remainder = '';

  try {
    offset = (await stat(config.eventsFile)).size;
  } catch {
    offset = 0;
  }

  process.stdout.write(`[tail] following ${config.eventsFile} from byte ${offset}\n`);

  for (;;) {
    try {
      const metadata = await stat(config.eventsFile);
      if (metadata.size < offset) {
        offset = 0;
        remainder = '';
        process.stdout.write('[tail] file rewrite detected; restarting at byte 0\n');
      }
      if (metadata.size > offset) {
        const length = metadata.size - offset;
        const buffer = Buffer.alloc(length);
        const handle = await open(config.eventsFile, 'r');
        try {
          await handle.read(buffer, 0, length, offset);
        } finally {
          await handle.close();
        }
        offset = metadata.size;
        const combined = remainder + buffer.toString('utf8');
        const lines = combined.split('\n');
        remainder = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim().length === 0) continue;
          try {
            const envelope = JSON.parse(line) as {
              observed_at?: string;
              payload?: Record<string, unknown>;
            };
            const payload = envelope.payload ?? {};
            const event = typeof payload['hook_event_name'] === 'string' ? payload['hook_event_name'] : '?';
            const session = typeof payload['session_id'] === 'string' ? payload['session_id'] : '?';
            const prompt = typeof payload['prompt_id'] === 'string' ? payload['prompt_id'] : '-';
            process.stdout.write(`${envelope.observed_at ?? '?'} ${event.padEnd(22)} session=${session} prompt=${prompt}\n`);
          } catch {
            process.stdout.write(`${line}\n`);
          }
        }
      }
    } catch {
      // The file may not exist until the first event.
    }
    await sleep(250);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[tail] fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
