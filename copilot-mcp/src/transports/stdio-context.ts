/**
 * Context-propagating wrapper around any MCP stdio `Transport`.
 *
 * stdio has no header channel (unlike HTTP/WS), so W3C trace context must be
 * carried in standard JSON-RPC `params._meta` and extracted per inbound
 * message rather than once per connection. `serveStdio()` pins a single
 * long-lived server instance for the whole stdio connection, so per-request
 * context cannot be injected at `buildServer()` construction time the way
 * the HTTP/WS factories do it — it must be captured here, immediately before
 * each message reaches the server, and scoped with `AsyncLocalStorage` so it
 * is visible to the tool handler that processes that specific message.
 *
 * This introduces no custom wire field: carrier data is read from the same
 * `params._meta` shape the HTTP and WS transports already use. stdout only
 * ever carries whatever the wrapped transport writes (unmodified); this
 * wrapper never writes to stdout/stderr itself.
 */

import type { JSONRPCMessage, Transport } from '@modelcontextprotocol/server';
import { extractCarrier, runWithPeerRequestContext, sanitizePeerRequestId, type PeerRequestContext } from '../telemetry-context.js';

export function extractStdioRequestContext(message: JSONRPCMessage): PeerRequestContext {
  const requestCarrier = extractCarrier((message as { params?: unknown }).params);
  const context: PeerRequestContext = { requestCarrier };
  const requestId = sanitizePeerRequestId((message as { id?: unknown }).id);
  if (requestId !== undefined) context.peerRequestId = requestId;
  return context;
}

export interface ContextPropagatingStdioTransportOptions {
  transport?: string;
}

/**
 * Wraps an inner `Transport` (normally `StdioServerTransport`) so every
 * inbound message is dispatched inside `runWithPeerRequestContext`. Requires
 * only that the inner transport exposes the standard `Transport` surface —
 * it works with any bring-your-own-transport `serveStdio()` accepts.
 */
export class ContextPropagatingStdioTransport implements Transport {
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;

  constructor(
    private readonly inner: Transport,
    private readonly options: ContextPropagatingStdioTransportOptions = {},
  ) {}

  async start(): Promise<void> {
    this.inner.onmessage = (message: JSONRPCMessage) => {
      const context = extractStdioRequestContext(message);
      runWithPeerRequestContext(
        {
          ...context,
          transport: this.options.transport ?? 'stdio',
        },
        () => this.onmessage?.(message),
      );
    };
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = (error: Error) => this.onerror?.(error);
    await this.inner.start();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await this.inner.send(message);
  }

  async close(): Promise<void> {
    await this.inner.close();
  }
}
