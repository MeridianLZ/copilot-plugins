import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  buildLocalNoProxyList,
  postLocalJson,
  proxyFreeEnvironment,
  validateLocalTelemetryEndpoint
} from '../src/local-runtime.js';

test('validateLocalTelemetryEndpoint accepts explicit local runtime endpoints', () => {
  const loopback = validateLocalTelemetryEndpoint('http://127.0.0.1:27432');
  const wslPrivate = validateLocalTelemetryEndpoint('http://172.28.233.212:27432');
  assert.equal(loopback.hostname, '127.0.0.1');
  assert.equal(wslPrivate.hostname, '172.28.233.212');
});

test('validateLocalTelemetryEndpoint rejects non-local hosts', () => {
  assert.throws(
    () => validateLocalTelemetryEndpoint('http://example.com:27432'),
    /loopback or private WSL IPv4/i
  );
});

test('validateLocalTelemetryEndpoint rejects endpoints with url userinfo', () => {
  assert.throws(
    () => validateLocalTelemetryEndpoint('http://user:pass@127.0.0.1:27432'),
    /must not include URL credentials/i
  );
});

test('validateLocalTelemetryEndpoint rejects unsupported schemes and malformed ports', () => {
  assert.throws(() => validateLocalTelemetryEndpoint('ftp://127.0.0.1:27432'), /http or https/i);
  assert.throws(() => validateLocalTelemetryEndpoint('http://127.0.0.1:65536'), /valid URL|valid port/i);
});

test('proxyFreeEnvironment removes proxy variables, merges no_proxy, and preserves input object', () => {
  const environment: NodeJS.ProcessEnv = {
    HTTP_PROXY: 'http://proxy.local:3128',
    HTTPS_PROXY: 'http://proxy.local:3129',
    ALL_PROXY: 'socks5://proxy.local:1080',
    http_proxy: 'http://proxy.local:4128',
    https_proxy: 'http://proxy.local:4129',
    all_proxy: 'socks5://proxy.local:2080',
    NO_PROXY: 'internal.local',
    no_proxy: 'example.local'
  };
  const endpoint = validateLocalTelemetryEndpoint('http://127.0.0.1:27432/v1/traces');

  const next = proxyFreeEnvironment(environment, endpoint);
  const noProxy = next['NO_PROXY'] ?? '';

  assert.equal(environment['HTTP_PROXY'], 'http://proxy.local:3128');
  assert.equal(next['HTTP_PROXY'], undefined);
  assert.equal(next['HTTPS_PROXY'], undefined);
  assert.equal(next['ALL_PROXY'], undefined);
  assert.equal(next['http_proxy'], undefined);
  assert.equal(next['https_proxy'], undefined);
  assert.equal(next['all_proxy'], undefined);
  assert.equal(next['NO_PROXY'], next['no_proxy']);
  assert.match(noProxy, /internal\.local/);
  assert.match(noProxy, /example\.local/);
  assert.match(noProxy, /localhost/);
  assert.match(noProxy, /127\.0\.0\.1/);
  assert.match(noProxy, /::1/);
  assert.match(noProxy, /172\.16\.0\.0\/12/);
});

test('buildLocalNoProxyList includes required local hosts and endpoint hostname', () => {
  const endpoint = new URL('http://172.28.233.212:27432/v1/traces');
  const list = buildLocalNoProxyList(endpoint);
  assert.match(list, /localhost/);
  assert.match(list, /127\.0\.0\.1/);
  assert.match(list, /::1/);
  assert.match(list, /172\.28\.233\.212/);
  assert.match(list, /172\.16\.0\.0\/12/);
});

test('postLocalJson sends JSON and requires 2xx status', async () => {
  let requestMethod = '';
  let requestContentType = '';
  let requestBody = '';

  const server = createServer((request, response) => {
    requestMethod = request.method ?? '';
    requestContentType = typeof request.headers['content-type'] === 'string' ? request.headers['content-type'] : '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      requestBody += chunk;
    });
    request.on('end', () => {
      response.writeHead(204);
      response.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected tcp address');
  const endpoint = new URL(`http://127.0.0.1:${address.port}/hooks`);

  try {
    await postLocalJson(endpoint, '{"ok":true}', 2_000);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  assert.equal(requestMethod, 'POST');
  assert.equal(requestContentType, 'application/json');
  assert.equal(requestBody, '{"ok":true}');
});

test('postLocalJson rejects non-2xx responses and timeout failures', async () => {
  const statusServer = createServer((_, response) => {
    response.writeHead(503);
    response.end();
  });
  await new Promise<void>((resolve) => statusServer.listen(0, '127.0.0.1', resolve));
  const statusAddress = statusServer.address();
  if (!statusAddress || typeof statusAddress === 'string') throw new Error('expected tcp address');

  try {
    await assert.rejects(
      () => postLocalJson(new URL(`http://127.0.0.1:${statusAddress.port}/hooks`), '{}', 2_000),
      /HTTP 503/i
    );
  } finally {
    await new Promise<void>((resolve) => statusServer.close(() => resolve()));
  }

  const timeoutServer = createServer(() => {
    // Keep socket open past client timeout to verify timeout enforcement.
  });
  await new Promise<void>((resolve) => timeoutServer.listen(0, '127.0.0.1', resolve));
  const timeoutAddress = timeoutServer.address();
  if (!timeoutAddress || typeof timeoutAddress === 'string') throw new Error('expected tcp address');

  try {
    await assert.rejects(
      () => postLocalJson(new URL(`http://127.0.0.1:${timeoutAddress.port}/hooks`), '{}', 50),
      /timed out/i
    );
  } finally {
    await new Promise<void>((resolve) => timeoutServer.close(() => resolve()));
  }
});
