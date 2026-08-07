/**
 * JSON-RPC 2.0 typings (spec: https://www.jsonrpc.org/specification), shared
 * by the WebSocket transport and the live-fire test client. Deliberately
 * standalone — no MCP or Copilot imports — so the module can be lifted into
 * any other project.
 */

export const JSONRPC_VERSION = '2.0' as const;

/** Request/response correlation id. `null` is legal only on error responses to unparseable requests. */
export type JsonRpcId = string | number | null;

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number;
  method: string;
  params?: P;
}

export interface JsonRpcNotification<P = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: P;
}

export interface JsonRpcSuccess<R = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number;
  result: R;
}

export interface JsonRpcErrorObject<D = unknown> {
  code: number;
  message: string;
  data?: D;
}

export interface JsonRpcErrorResponse<D = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  error: JsonRpcErrorObject<D>;
}

export type JsonRpcResponse<R = unknown, D = unknown> = JsonRpcSuccess<R> | JsonRpcErrorResponse<D>;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/** Standard JSON-RPC 2.0 error codes. */
export const JsonRpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  /** -32000..-32099 are reserved for implementation-defined server errors. */
  ServerErrorMin: -32099,
  ServerErrorMax: -32000,
  /** MCP: request cancelled (server-defined range). */
  RequestCancelled: -32800,
  /** MCP: connection closed before the response arrived. */
  ConnectionClosed: -32000,
} as const;

export function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as { jsonrpc?: unknown }).jsonrpc === JSONRPC_VERSION
  );
}

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'method' in msg && 'id' in msg && msg.id !== null;
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return 'method' in msg && !('id' in msg);
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return !('method' in msg) && ('result' in msg || 'error' in msg);
}

export function isErrorResponse(msg: JsonRpcMessage): msg is JsonRpcErrorResponse {
  return isResponse(msg) && 'error' in msg;
}

export function makeRequest<P>(id: string | number, method: string, params?: P): JsonRpcRequest<P> {
  return { jsonrpc: JSONRPC_VERSION, id, method, ...(params !== undefined ? { params } : {}) };
}

export function makeNotification<P>(method: string, params?: P): JsonRpcNotification<P> {
  return { jsonrpc: JSONRPC_VERSION, method, ...(params !== undefined ? { params } : {}) };
}

export function makeResult<R>(id: string | number, result: R): JsonRpcSuccess<R> {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function makeError<D>(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: D,
): JsonRpcErrorResponse<D> {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}
