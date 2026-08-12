import { open, stat } from 'node:fs/promises';
import { parseNativeLines, resolveSessionStatePath, type NativeEvent } from './native-session.js';

/**
 * On-demand incremental reader for native session transcripts. Each request
 * stats the file and reads only bytes past the last offset; the UI's poll is
 * the tick, so no background timers or session-lifecycle tracking. Copilot
 * holds the file open (inuse.*.lock) — transient read errors serve the
 * cached prefix instead of failing the request.
 */
interface CacheEntry {
  byteOffset: number;
  remainder: string;
  events: NativeEvent[];
  lastAccessMs: number;
}

const IDLE_EVICT_MS = 10 * 60 * 1000;

export class NativeSessionCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #pending = new Map<string, Promise<NativeEvent[]>>();
  readonly #copilotHome: string | undefined;

  constructor(copilotHome?: string) {
    this.#copilotHome = copilotHome;
  }

  async getNativeEvents(sessionId: string): Promise<NativeEvent[]> {
    const active = this.#pending.get(sessionId);
    if (active) return active;
    const pending = this.#readNativeEvents(sessionId);
    this.#pending.set(sessionId, pending);
    try {
      return await pending;
    } finally {
      if (this.#pending.get(sessionId) === pending) this.#pending.delete(sessionId);
    }
  }

  async #readNativeEvents(sessionId: string): Promise<NativeEvent[]> {
    const now = Date.now();
    for (const [key, entry] of this.#entries) {
      if (now - entry.lastAccessMs > IDLE_EVICT_MS) this.#entries.delete(key);
    }
    const filePath = resolveSessionStatePath(sessionId, this.#copilotHome);
    let entry = this.#entries.get(sessionId);
    if (!entry) {
      entry = { byteOffset: 0, remainder: '', events: [], lastAccessMs: now };
      this.#entries.set(sessionId, entry);
    }
    entry.lastAccessMs = now;

    try {
      const info = await stat(filePath);
      if (info.size < entry.byteOffset) {
        // truncated/rotated upstream — start over
        entry.byteOffset = 0;
        entry.remainder = '';
        entry.events = [];
      }
      if (info.size > entry.byteOffset) {
        const handle = await open(filePath, 'r');
        try {
          const length = info.size - entry.byteOffset;
          const buffer = Buffer.alloc(length);
          const { bytesRead } = await handle.read(buffer, 0, length, entry.byteOffset);
          entry.byteOffset += bytesRead;
          const chunk = entry.remainder + buffer.subarray(0, bytesRead).toString('utf8');
          const lines = chunk.split('\n');
          entry.remainder = lines.pop() ?? '';
          entry.events.push(...parseNativeLines(lines));
          const finalRecord = parseNativeLines([entry.remainder]);
          if (finalRecord.length > 0) {
            entry.events.push(...finalRecord);
            entry.remainder = '';
          }
        } finally {
          await handle.close();
        }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // transient (lock/share) — serve what we have
      }
    }
    return entry.events;
  }
}
