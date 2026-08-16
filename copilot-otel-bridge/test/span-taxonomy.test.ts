import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  contentAttributes,
  lifecycleSpanName,
  nativeNodeSpan,
  payloadAttributes,
  pointSpanName,
  renderCatalogMarkdown,
  spanTier
} from '../src/span-taxonomy.js';
import type { NormalizedHookPayload } from '../src/types.js';

test('span names are deterministic and tiered per the precedence rule', () => {
  assert.equal(lifecycleSpanName('tool', 'bash'), 'execute_tool bash');
  assert.equal(lifecycleSpanName('subagent', 'reviewer'), 'invoke_agent reviewer');
  assert.equal(lifecycleSpanName('tool'), 'execute_tool unknown');
  assert.equal(lifecycleSpanName('session'), 'github.copilot.hook.session');
  assert.equal(lifecycleSpanName('turn'), 'github.copilot.hook.turn');
  assert.equal(pointSpanName('preToolUse'), 'execute_hook preToolUse');
  assert.equal(spanTier('tool'), 1);
  assert.equal(spanTier('subagent'), 1);
  assert.equal(spanTier('point'), 1);
  assert.equal(spanTier('session'), 3);
  assert.equal(spanTier('turn'), 3);
});

test('native node spans map events.jsonl signals to nominal taxonomy names', () => {
  assert.deepEqual(nativeNodeSpan('assistant.message', { model: 'gpt-5.6' }), { name: 'chat gpt-5.6', tier: 2 });
  assert.deepEqual(nativeNodeSpan('tool.execution_start', { tool: 'view' }), { name: 'execute_tool view', tier: 1 });
  assert.deepEqual(nativeNodeSpan('subagent.started', { agent: 'reviewer' }), { name: 'invoke_agent reviewer', tier: 1 });
  assert.deepEqual(nativeNodeSpan('permission.requested'), { name: 'execute_hook permissionRequest', tier: 1 });
  assert.deepEqual(nativeNodeSpan('session.model_change'), { name: 'native:session.model_change', tier: 2 });
});

test('precedence drops the session.id dupe but keeps richer tier-2 attrs', () => {
  const payload: NormalizedHookPayload = {
    hook_event_name: 'subagentStart',
    session_id: 's1',
    payload_format: 'camelCase',
    timestamp: '2026-08-16T00:00:00Z',
    agent_name: 'reviewer',
    agent_display_name: 'Reviewer',
    agent_type: 'custom'
  };
  const attrs = payloadAttributes(payload);
  assert.equal(attrs['gen_ai.conversation.id'], 's1');
  assert.equal(attrs['github.copilot.session.id'], undefined);
  assert.equal(attrs['gen_ai.agent.name'], 'reviewer');
  assert.equal(attrs['github.copilot.agent.display_name'], 'Reviewer');
  assert.equal(attrs['github.copilot.agent.type'], 'custom');
});

test('content attributes wrap prompts as semconv messages and skip redacted placeholders', () => {
  const payload: NormalizedHookPayload = {
    hook_event_name: 'userPromptSubmitted',
    session_id: 's1',
    payload_format: 'camelCase',
    timestamp: '2026-08-16T00:00:00Z',
    prompt: 'do work'
  };
  const attrs = contentAttributes(payload);
  assert.deepEqual(JSON.parse(attrs['gen_ai.input.messages'] ?? ''), [
    { role: 'user', parts: [{ type: 'text', content: 'do work' }] }
  ]);
  const hashed: NormalizedHookPayload = { ...payload, prompt: { redacted: true, sha256: 'x', bytes: 7 } };
  assert.equal(contentAttributes(hashed)['gen_ai.input.messages'], undefined);
});

test('SPAN_SSOT.md catalog block matches renderCatalogMarkdown (doc-sync guard)', () => {
  const docPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'SPAN_SSOT.md');
  const doc = readFileSync(docPath, 'utf8');
  const match = doc.match(/<!-- taxonomy:begin -->\n([\s\S]*?)\n<!-- taxonomy:end -->/);
  assert.ok(match, 'taxonomy markers missing from docs/SPAN_SSOT.md');
  assert.equal(match[1], renderCatalogMarkdown());
});
