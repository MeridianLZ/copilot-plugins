import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listNativeSessions } from '../src/native-session-listing.js';

test('lists transcript-backed native sessions', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'copilot-otel-native-listing-'));
  try {
    await mkdir(path.join(home, 'session-state', 'native-only'), { recursive: true });
    await writeFile(path.join(home, 'session-state', 'native-only', 'events.jsonl'), '{"type":"session.start"}\n');

    const sessions = await listNativeSessions(home);

    assert.deepEqual(sessions.map((session) => ({
      session_id: session.session_id,
      status: session.status,
      source: session.source
    })), [{ session_id: 'native-only', status: 'ok', source: 'native' }]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
