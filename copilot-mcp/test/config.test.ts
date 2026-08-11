import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

test('loads an explicit system Copilot CLI path', () => {
  const previous = process.env['COPILOT_MCP_CLI_PATH'];
  process.env['COPILOT_MCP_CLI_PATH'] = 'node';

  try {
    const cliPath = Reflect.get(loadConfig(), 'cliPath');
    assert.equal(typeof cliPath, 'string');
    if (typeof cliPath !== 'string') throw new TypeError('cliPath was not loaded');
    assert.equal(path.isAbsolute(cliPath), true);
  } finally {
    if (previous === undefined) delete process.env['COPILOT_MCP_CLI_PATH'];
    else process.env['COPILOT_MCP_CLI_PATH'] = previous;
  }
});
