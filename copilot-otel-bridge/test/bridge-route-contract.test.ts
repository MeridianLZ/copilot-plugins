import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('native OTel route returns native records instead of transcript records', async () => {
  const bridge = await readFile(path.join(root, 'src', 'bridge.ts'), 'utf8');

  assert.match(bridge, /nativeOtelCache\.getRecords/);
  assert.doesNotMatch(bridge, /native_otel_not_ingested/);
});

test('conversation route always applies pageSlice', async () => {
  const bridge = await readFile(path.join(root, 'src', 'bridge.ts'), 'utf8');

  assert.match(bridge, /const page = pageSlice\(\s*conversation\.events,/);
});
