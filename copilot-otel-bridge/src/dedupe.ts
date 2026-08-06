import { createHash } from 'node:crypto';
import { stableJson } from './security.js';
import type { NormalizedHookPayload } from './types.js';

/**
 * Payload-identity dedupe for hook events. The envelope `event_id` is minted
 * per egress process, so N hook installations firing for the same Copilot
 * event produce N distinct event_ids with byte-identical payloads. Payloads
 * carry a millisecond ISO `timestamp`, so hashing the whole payload is a
 * stable identity: genuine repeats of the same logical action land on
 * different timestamps and survive.
 */
export interface PayloadDeduper {
  /** Returns true when this payload duplicates one seen within the window. */
  isDuplicate(payload: NormalizedHookPayload, eventTimeMs: number): boolean;
}

export function createPayloadDeduper(windowMs = 10_000): PayloadDeduper {
  const lastSeen = new Map<string, number>();
  return {
    isDuplicate(payload: NormalizedHookPayload, eventTimeMs: number): boolean {
      const key = createHash('sha256').update(stableJson(payload)).digest('hex');
      const previous = lastSeen.get(key);
      lastSeen.set(key, eventTimeMs);
      if (lastSeen.size > 4096) {
        for (const [entryKey, seenMs] of lastSeen) {
          if (Math.abs(eventTimeMs - seenMs) > windowMs) lastSeen.delete(entryKey);
        }
      }
      return previous !== undefined && Math.abs(eventTimeMs - previous) <= windowMs;
    }
  };
}
