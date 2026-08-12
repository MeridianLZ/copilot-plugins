import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SessionSummary } from './trace-projector.js';

export async function listNativeSessions(copilotHome: string): Promise<SessionSummary[]> {
  const stateDir = path.join(copilotHome, 'session-state');
  let ids: string[];
  try {
    ids = await readdir(stateDir);
  } catch {
    return [];
  }
  const sessions: SessionSummary[] = [];
  for (const id of ids) {
    try {
      const file = path.join(stateDir, id, 'events.jsonl');
      const details = await stat(file);
      const timestamp = details.birthtimeMs || details.mtimeMs;
      sessions.push({
        session_id: id,
        started_at_ms: timestamp,
        last_event_at_ms: details.mtimeMs,
        status: 'ok',
        event_count: 0,
        turn_count: 0,
        tool_count: 0,
        subagent_count: 0,
        error_count: 0,
        source: 'native'
      });
    } catch {
      // A session directory without a transcript is not projectable.
    }
  }
  return sessions;
}
