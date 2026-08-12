import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { NativeSessionCache } from '../src/native-cache.js';

test('reads a valid final native JSONL record without a trailing newline', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'copilot-native-cache-'));
  try {
    const sessionId = 'native-cache-session';
    const file = path.join(home, 'session-state', sessionId, 'events.jsonl');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({
      id: 'native-event-1',
      type: 'assistant.message',
      timestamp: '2026-08-11T00:00:00.000Z',
      data: { messageId: 'message-1', content: 'sanitized upstream' }
    }), 'utf8');

    const cache = new NativeSessionCache(home);
    const [first, second] = await Promise.all([
      cache.getNativeEvents(sessionId),
      cache.getNativeEvents(sessionId)
    ]);

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(first[0]?.id, 'native-event-1');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
