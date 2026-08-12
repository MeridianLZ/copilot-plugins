import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadPersonas } from '../src/personas.js';

test('loads persona identity, prompt fusion, and pinned model', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'copilot-mcp-personas-'));
  try {
    for (const name of ['chewy', 'buzz', 'goose']) {
      const dir = path.join(root, name);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'system-prompt.md'), name === 'chewy' ? 'system' : `${name} system`);
      await writeFile(path.join(dir, 'specialized_role.md'), name === 'chewy' ? 'role' : `${name} role`);
      await writeFile(path.join(dir, 'mission.md'), name === 'chewy' ? 'mission' : `${name} mission`);
      await writeFile(
        path.join(dir, `${name}.agent.md`),
        `---\nmodel: ${name}-model\ndescription: Test ${name}\n---\n`,
      );
    }

    const [persona] = loadPersonas(root);

    assert.equal(persona?.name, 'chewy');
    assert.equal(persona?.model, 'chewy-model');
    assert.equal(persona?.description, 'Test chewy');
    assert.match(persona?.systemMessage ?? '', /Your name is Chewy/);
    assert.match(persona?.systemMessage ?? '', /system\n\nrole\n\nmission/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
