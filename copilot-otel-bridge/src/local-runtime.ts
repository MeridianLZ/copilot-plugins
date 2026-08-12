import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'] as const;
const REQUIRED_NO_PROXY = ['localhost', '127.0.0.1', '::1'] as const;
const PRIVATE_WSL_NO_PROXY = ['172.16.0.0/12'] as const;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) return hostname.slice(1, -1);
  return hostname;
}

function parseIpv4(hostname: string): [number, number, number, number] | undefined {
  if (!IPV4_PATTERN.test(hostname)) return undefined;
  const octets = hostname.split('.').map((value) => Number.parseInt(value, 10));
  if (octets.length !== 4) return undefined;
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return undefined;
  const first = octets[0];
  const second = octets[1];
  const third = octets[2];
  const fourth = octets[3];
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) return undefined;
  return [first, second, third, fourth];
}

function isLoopbackIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  return octets !== undefined && octets[0] === 127;
}

function isPrivateWslIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (octets === undefined) return false;
  return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

function isAllowedTelemetryHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0:0:0:0:0:0:0:1') return true;
  if (isLoopbackIpv4(hostname)) return true;
  return isPrivateWslIpv4(hostname);
}

function validatePort(port: string): void {
  if (port.length === 0) return;
  const parsed = Number.parseInt(port, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error('local telemetry endpoint must include a valid port');
  }
}

function mergedNoProxyValues(existing: string[], required: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const value of [...existing, ...required]) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

function parseNoProxyValues(environment: NodeJS.ProcessEnv): string[] {
  const values: string[] = [];
  for (const key of ['NO_PROXY', 'no_proxy'] as const) {
    const raw = environment[key];
    if (raw === undefined) continue;
    values.push(...raw.split(','));
  }
  return values;
}

export function validateLocalTelemetryEndpoint(endpoint: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('local telemetry endpoint must be a valid URL');
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error('local telemetry endpoint must not include URL credentials');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('local telemetry endpoint must use http or https');
  }
  validatePort(parsed.port);

  const hostname = stripIpv6Brackets(parsed.hostname).toLowerCase();
  if (!isAllowedTelemetryHost(hostname)) {
    throw new Error('local telemetry endpoint host must be loopback or private WSL IPv4');
  }

  return parsed;
}

export function buildLocalNoProxyList(endpoint: URL): string {
  const validated = validateLocalTelemetryEndpoint(endpoint.toString());
  const hostname = stripIpv6Brackets(validated.hostname).toLowerCase();
  return mergedNoProxyValues([], [...REQUIRED_NO_PROXY, hostname, ...PRIVATE_WSL_NO_PROXY]).join(',');
}

export function proxyFreeEnvironment(environment: NodeJS.ProcessEnv, endpoint: URL): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...environment };
  for (const key of PROXY_KEYS) delete result[key];

  const required = buildLocalNoProxyList(endpoint).split(',');
  const merged = mergedNoProxyValues(parseNoProxyValues(environment), required).join(',');
  result['NO_PROXY'] = merged;
  result['no_proxy'] = merged;
  return result;
}

export async function postLocalJson(endpoint: URL, body: string, timeoutMs: number): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('local telemetry timeout must be a positive integer');
  }

  const validated = validateLocalTelemetryEndpoint(endpoint.toString());
  const transport = validated.protocol === 'https:' ? httpsRequest : httpRequest;
  const hostname = stripIpv6Brackets(validated.hostname);

  await new Promise<void>((resolve, reject) => {
    const request = transport(
      {
        protocol: validated.protocol,
        hostname,
        port: validated.port.length > 0 ? Number.parseInt(validated.port, 10) : undefined,
        path: `${validated.pathname}${validated.search}`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body)
        },
        agent: false
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        response.resume();
        response.once('end', () => {
          if (statusCode >= 200 && statusCode < 300) {
            resolve();
            return;
          }
          reject(new Error(`local runtime endpoint returned HTTP ${statusCode}`));
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('local runtime endpoint request timed out'));
    });
    request.once('error', (error) => reject(error));
    request.end(body);
  });
}
