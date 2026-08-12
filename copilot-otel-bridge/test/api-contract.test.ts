import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CursorError,
  decodeCursor,
  encodeCursor,
  etagFor,
  etagsMatch,
  pageSlice
} from '../src/api-contract.js';

test('pages source records with an opaque cursor', () => {
  const page = pageSlice(['first', 'second', 'third'], undefined, '2', new Date('2026-08-11T00:00:00.000Z'));

  assert.deepEqual(page.items, ['first', 'second']);
  assert.equal(page.total, 3);
  assert.equal(page.generated_at, '2026-08-11T00:00:00.000Z');
  assert.equal(decodeCursor(page.next_cursor, 3), 2);
  assert.deepEqual(pageSlice(['first', 'second', 'third'], page.next_cursor, '2').items, ['third']);
  assert.equal(encodeCursor(2), page.next_cursor);
});

test('rejects malformed and out-of-range cursors', () => {
  assert.throws(() => decodeCursor('not-a-cursor', 2), CursorError);
  assert.throws(() => decodeCursor(encodeCursor(3), 2), CursorError);
  assert.throws(() => pageSlice(['record'], undefined, '1001'), CursorError);
});

test('matches strong and weak entity tags', () => {
  const etag = etagFor({ session_id: 'session-1', records: 2 });

  assert.match(etag, /^"[A-Za-z0-9_-]+"$/);
  assert.equal(etagsMatch(etag, etag), true);
  assert.equal(etagsMatch(`W/${etag}`, etag), true);
  assert.equal(etagsMatch('"other"', etag), false);
});
