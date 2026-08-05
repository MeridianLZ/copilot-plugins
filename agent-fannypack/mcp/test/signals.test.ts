import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { registerPing } from '../src/ping.js';
import { registerMarco, sendMarco } from '../src/marco.js';
import { registerBlastTimer } from '../src/blast-timer.js';

async function connected(build: (server: McpServer) => void): Promise<Client> {
  const server = new McpServer({ name: 'fannypack-test', version: '0.0.0' }, { capabilities: { tools: {} } });
  build(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'fannypack-test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

test('ping pongs regardless of agent status', async () => {
  const client = await connected((s) => registerPing(s, { identity: { host: 'test' } }));
  const result = await client.callTool({ name: 'ping', arguments: { echo: 'hi' } });
  const out = result.structuredContent as { pong: boolean; echo?: string; uptime_ms: number; identity?: Record<string, string> };
  assert.equal(out.pong, true);
  assert.equal(out.echo, 'hi');
  assert.ok(out.uptime_ms >= 0);
  assert.equal(out.identity?.['host'], 'test');
});

test('marco routes through the injected respond and reports polo', async () => {
  const seen: string[] = [];
  const client = await connected((s) =>
    registerMarco(s, {
      respond: (input) => {
        seen.push(input);
        return 'polo';
      },
    }),
  );
  const result = await sendMarco((name, args) => client.callTool({ name, arguments: args }));
  assert.deepEqual(seen, ['marco']);
  assert.equal(result.reply, 'polo');
  assert.equal(result.ok, true);
  assert.ok(result.rtt_ms >= 0);
});

test('marco flags a wrong reply as not ok', async () => {
  const client = await connected((s) => registerMarco(s, { respond: () => 'huh?' }));
  const result = await sendMarco((name, args) => client.callTool({ name, arguments: args }));
  assert.equal(result.ok, false);
  assert.equal(result.reply, 'huh?');
});

test('blast timer tool trio: start, check_in, status, detonate', async () => {
  let detonated = false;
  let registration: ReturnType<typeof registerBlastTimer> | undefined;
  const client = await connected((s) => {
    registration = registerBlastTimer(s, {
      onDetonate: () => {
        detonated = true;
      },
    });
  });

  const start = await client.callTool({ name: 'blast_timer_start', arguments: { duration: 200, unit: 'ms' } });
  assert.equal((start.structuredContent as { armed: boolean }).armed, true);

  const checkIn = await client.callTool({ name: 'check_in', arguments: { signal: 'alive' } });
  assert.equal((checkIn.structuredContent as { check_ins: number }).check_ins, 1);

  const status = await client.callTool({ name: 'blast_timer_status', arguments: {} });
  const statusOut = status.structuredContent as { armed: boolean; last_signal: string | null };
  assert.equal(statusOut.armed, true);
  assert.equal(statusOut.last_signal, 'alive');

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(detonated, true, 'countdown reaching zero must detonate');
  assert.equal(registration?.timer.detonated, true);
});
