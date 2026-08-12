import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiPath = path.join(root, 'ui', 'index.html');

test('forensic UI provides inspector, source coverage, lineage, and disposition states', async () => {
  const html = await readFile(uiPath, 'utf8');

  for (const id of ['trace-inspector', 'source-coverage', 'mcp-lineage', 'disposition-cards', 'evidence-detail', 'evidence-search', 'evidence-mode']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const disposition of ['redacted', 'unavailable', 'invalid', 'unmatched', 'heuristic', 'deduplicated', 'late']) {
    assert.match(html, new RegExp(`data-disposition="${disposition}"`));
  }
  assert.match(html, /fetchWithEtag/);
  assert.match(html, /fetchAllSourceRecords/);
  assert.match(html, /fetchAllConversationEvents/);
  assert.match(html, /showEvidenceDetail/);
  assert.match(html, /renderEvidenceSections/);
  assert.match(html, /telemetry-fields/);
  assert.match(html, /data-source-id/);
  assert.doesNotMatch(html, /session-state[\\/]/);
  assert.doesNotMatch(html, /credential|password/i);
});
