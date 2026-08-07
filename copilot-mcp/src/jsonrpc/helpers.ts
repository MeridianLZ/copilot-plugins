/**
 * JSON-RPC 2.0 helper classes: newline-delimited framing, request/response
 * correlation, and a small duplex endpoint. Standalone by design (no MCP or
 * Copilot imports) so the module is reusable outside this project.
 */

import {
  type JsonRpcErrorObject,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  JsonRpcErrorCodes,
  isErrorResponse,
  isJsonRpcMessage,
  isNotification,
  isRequest,
  isResponse,
  makeError,
  makeNotification,
  makeRequest,
  makeResult,
} from './types.js';

/**
 * Incremental NDJSON (newline-delimited JSON) framer for stream transports.
 * Feed arbitrary chunks; complete lines come out as parsed messages.
 */
export class NdjsonFramer {
  #buffer = '';

  /** Returns every complete JSON-RPC message terminated by "\n" in the stream so far. */
  push(chunk: string | Uint8Array): JsonRpcMessage[] {
    this.#buffer += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    const messages: JsonRpcMessage[] = [];
    let newline: number;
    while ((newline = this.#buffer.indexOf('\n')) !== -1) {
      const line = this.#buffer.slice(0, newline).replace(/\r$/, '');
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.trim().length === 0) continue;
      const parsed: unknown = JSON.parse(line);
      if (!isJsonRpcMessage(parsed)) {
        throw new Error(`not a JSON-RPC 2.0 message: ${line.slice(0, 120)}`);
      }
      messages.push(parsed);
    }
    return messages;
  }

  /** Serialize one message to a newline-terminated frame. */
  static frame(message: JsonRpcMessage): string {
    return `${JSON.stringify(message)}\n`;
  }

  get pendingBytes(): number {
    return this.#buffer.length;
  }
}

export class JsonRpcRemoteError extends Error {
  constructor(readonly rpcError: JsonRpcErrorObject) {
    super(`JSON-RPC error ${rpcError.code}: ${rpcError.message}`);
    this.name = 'JsonRpcRemoteError';
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Correlates outbound requests with inbound responses by id, with per-request
 * timeout and wholesale cancellation on connection loss.
 */
export class JsonRpcCorrelator {
  #pending = new Map<string | number, Pending>();
  #nextId = 1;

  nextId(): number {
    return this.#nextId++;
  }

  /** Register a request id and await its response. */
  wait(id: string | number, timeoutMs?: number): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer =
        timeoutMs !== undefined
          ? setTimeout(() => {
              this.#pending.delete(id);
              reject(new Error(`JSON-RPC request ${String(id)} timed out after ${timeoutMs}ms`));
            }, timeoutMs)
          : undefined;
      timer?.unref?.();
      this.#pending.set(id, { resolve, reject, timer });
    });
  }

  /** Route an inbound response to its waiter. Returns false when the id is unknown. */
  settle(response: JsonRpcResponse): boolean {
    if (response.id === null) return false;
    const pending = this.#pending.get(response.id);
    if (!pending) return false;
    this.#pending.delete(response.id);
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    if (isErrorResponse(response)) pending.reject(new JsonRpcRemoteError(response.error));
    else pending.resolve(response.result);
    return true;
  }

  /** Reject every in-flight request (connection closed, detonation, …). */
  cancelAll(reason: string): void {
    for (const [id, pending] of this.#pending) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(
        new JsonRpcRemoteError({ code: JsonRpcErrorCodes.ConnectionClosed, message: reason, data: { id } }),
      );
    }
    this.#pending.clear();
  }

  get inFlight(): number {
    return this.#pending.size;
  }
}

export type RequestHandler = (params: unknown, request: JsonRpcRequest) => Promise<unknown> | unknown;
export type NotificationHandler = (params: unknown, notification: JsonRpcNotification) => void;

/**
 * A minimal duplex JSON-RPC endpoint over any message-oriented wire: give it a
 * `send` function, feed inbound messages to {@link receive}, register method
 * handlers, and issue outbound calls with {@link request}/{@link notify}.
 */
export class JsonRpcEndpoint {
  readonly #correlator = new JsonRpcCorrelator();
  #requestHandlers = new Map<string, RequestHandler>();
  #notificationHandlers = new Map<string, NotificationHandler>();

  constructor(private readonly sendRaw: (message: JsonRpcMessage) => void | Promise<void>) {}

  onRequest(method: string, handler: RequestHandler): this {
    this.#requestHandlers.set(method, handler);
    return this;
  }

  onNotification(method: string, handler: NotificationHandler): this {
    this.#notificationHandlers.set(method, handler);
    return this;
  }

  async request<R = unknown, P = unknown>(method: string, params?: P, timeoutMs?: number): Promise<R> {
    const id = this.#correlator.nextId();
    const waiter = this.#correlator.wait(id, timeoutMs);
    await this.sendRaw(makeRequest(id, method, params));
    return (await waiter) as R;
  }

  async notify<P = unknown>(method: string, params?: P): Promise<void> {
    await this.sendRaw(makeNotification(method, params));
  }

  /** Dispatch one inbound message: response → correlator; request/notification → handler. */
  async receive(message: JsonRpcMessage): Promise<void> {
    if (isResponse(message)) {
      this.#correlator.settle(message);
      return;
    }
    if (isRequest(message)) {
      const handler = this.#requestHandlers.get(message.method);
      if (!handler) {
        await this.sendRaw(
          makeError(message.id, JsonRpcErrorCodes.MethodNotFound, `method not found: ${message.method}`),
        );
        return;
      }
      try {
        const result = await handler(message.params, message);
        await this.sendRaw(makeResult(message.id, result ?? null));
      } catch (error) {
        await this.sendRaw(
          makeError(message.id, JsonRpcErrorCodes.InternalError, error instanceof Error ? error.message : String(error)),
        );
      }
      return;
    }
    if (isNotification(message)) {
      this.#notificationHandlers.get(message.method)?.(message.params, message);
    }
  }

  close(reason = 'endpoint closed'): void {
    this.#correlator.cancelAll(reason);
  }

  get inFlight(): number {
    return this.#correlator.inFlight;
  }
}
