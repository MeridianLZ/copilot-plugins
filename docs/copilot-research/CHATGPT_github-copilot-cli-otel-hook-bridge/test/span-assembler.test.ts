import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { BridgeConfig } from '../src/config.js';
import { createEnvelope } from '../src/envelope.js';
import { SpanAssembler } from '../src/span-assembler.js';

const config: BridgeConfig = {
  host: '127.0.0.1',
  port: 14329,
  bridgeUrl: 'http://127.0.0.1:14329/hooks',
  dataDir: '/tmp/copilot-hooks-test',
  eventsFile: '/tmp/copilot-hooks-test/hook-events.jsonl',
  spoolDir: '/tmp/copilot-hooks-test/spool',
  contentMode: 'full',
  contentMaxBytes: 32_768,
  postTimeoutMs: 250,
  openSpanTimeoutMs: 1_800_000,
  spoolDrainIntervalMs: 2_000,
  consoleMode: 'silent',
  otlpTracesEndpoint: 'http://127.0.0.1:14318/v1/traces',
  serviceName: 'test'
};

function event(name: string, timestamp: number, extra: Record<string, unknown> = {}) {
  return createEnvelope(
    { sessionId: 's1', timestamp, cwd: '/repo', ...extra },
    config,
    'command-hook',
    name
  );
}

test('assembler produces session, turn, tool, subagent, and point spans', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  });
  const assembler = new SpanAssembler(provider.getTracer('test'), config);

  assembler.process(event('sessionStart', 1_800_000_000_000, { source: 'new' }));
  assembler.process(event('userPromptSubmitted', 1_800_000_001_000, { prompt: 'do work' }));
  assembler.process(event('preToolUse', 1_800_000_002_000, { toolName: 'bash', toolArgs: { command: 'pnpm test' } }));
  assembler.process(event('postToolUse', 1_800_000_003_000, { toolName: 'bash', toolResult: { resultType: 'success' } }));
  assembler.process(event('subagentStart', 1_800_000_004_000, { agentName: 'reviewer', agentDisplayName: 'Reviewer' }));
  assembler.process(event('subagentStop', 1_800_000_006_000, { agentName: 'reviewer', agentId: 'agent-1', response: 'done' }));
  assembler.process(event('agentStop', 1_800_000_007_000, { stopReason: 'complete', stop_hook_active: false }));
  assembler.process(event('sessionEnd', 1_800_000_008_000, { reason: 'complete' }));

  await provider.forceFlush();
  const spans = exporter.getFinishedSpans();
  const names = spans.map((span) => span.name);
  assert.ok(names.includes('github.copilot.hook.session'));
  assert.ok(names.includes('github.copilot.hook.turn'));
  assert.ok(names.includes('github.copilot.hook.tool'));
  assert.ok(names.includes('github.copilot.hook.subagent'));
  assert.ok(names.includes('github.copilot.hook.preToolUse'));
  assert.equal(spans.find((span) => span.name === 'github.copilot.hook.tool')?.attributes['gen_ai.tool.name'], 'bash');
  assert.equal(spans.find((span) => span.name === 'github.copilot.hook.subagent')?.attributes['gen_ai.agent.id'], 'agent-1');
  await provider.shutdown();
});
