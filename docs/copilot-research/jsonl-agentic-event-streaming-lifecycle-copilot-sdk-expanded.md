# JSONL, NDJSON, and Event Streaming in Agentic Harnesses

**A lifecycle-first guide to framing, transport, parsing, backpressure, resumability, and production design**

**State of research:** July 26, 2026

---

## Executive summary

JSON Lines—usually written as `.jsonl`, and often called NDJSON—is a **record-framing convention**:

```text
{"type":"run.started","runId":"run_123"}
{"type":"message.delta","delta":"Hel"}
{"type":"message.delta","delta":"lo"}
{"type":"run.completed","runId":"run_123"}
```

Each physical line is one complete JSON value. The newline tells the receiver where one application record ends and the next begins.

JSONL is **not itself a network transport**, and it is not what makes HTTP streamable. A complete streaming design has several independent layers:

1. **Transport:** pipe, TCP, HTTP/1.1, HTTP/2, HTTP/3, WebSocket, message broker.
2. **HTTP/body delivery:** incremental response bytes, HTTP/1.1 chunked transfer coding, HTTP/2 or HTTP/3 data frames.
3. **Record framing:** JSONL/NDJSON, SSE, JSON Text Sequences, length-prefixing, WebSocket messages.
4. **Message schema:** ad hoc events, JSON-RPC, CloudEvents, OpenAI-style response events, MCP messages.
5. **Application lifecycle:** run started, token delta, tool request, tool result, approval, handoff, retry, completion, cancellation.
6. **Reliability:** IDs, ordering, replay, deduplication, checkpointing, timeouts, and resumability.
7. **Flow control:** backpressure, buffering, batching, compression, proxy behavior, and client consumption speed.

The major advantage of JSONL is not that it creates streaming. Its advantage is that it makes an already-streamed byte sequence **incrementally parseable using ordinary JSON parsers**. The receiver does not need to wait for a closing `]`, retain an entire JSON array, or run a fully incremental structural JSON parser.

For an agent harness, that means a long-running execution can emit independently meaningful events as soon as they happen:

```text
model output → tool call → tool progress → tool result → model continuation → usage → completion
```

That ordered event log can simultaneously feed a UI, persistence layer, observability pipeline, evaluator, replay debugger, and parent agent.

---

## 1. Terminology: JSONL, NDJSON, and JSON Text Sequences

### 1.1 JSON Lines / JSONL

JSON Lines is the broad informal name for a file or stream containing one JSON value per line.

Common file extensions:

- `.jsonl`
- `.ndjson`

Typical media types:

- `application/x-ndjson`
- `application/ndjson` in some implementations
- occasionally `application/jsonl`, though it is less established

A stream might contain only objects:

```jsonl
{"id":1,"name":"alpha"}
{"id":2,"name":"beta"}
```

Strictly, JSON values can also be arrays, strings, numbers, booleans, or `null`, but event protocols should normally require objects so every record can carry type, identity, version, and metadata.

### 1.2 NDJSON

The NDJSON 1.0 specification formalizes the newline-delimited convention:

- UTF-8
- each JSON text followed by LF (`\n`)
- CRLF accepted by parsers
- embedded literal newlines cannot occur in a record
- malformed-line behavior must be explicit
- suggested media type: `application/x-ndjson`

A JSON string may contain an escaped newline (`"line 1\nline 2"`). That is two characters in the serialized stream—backslash and `n`—not a physical record delimiter.

### 1.3 RFC 7464 JSON Text Sequences

RFC 7464 defines a related but distinct standard:

```text
0x1E {"type":"a"} 0x0A
0x1E {"type":"b"} 0x0A
```

Each JSON text is:

1. prefixed by ASCII Record Separator (`RS`, byte `0x1E`)
2. terminated by LF (`0x0A`)

Media type:

```text
application/json-seq
```

The record-separator prefix makes recovery from malformed or truncated records more robust and permits pretty-printed JSON containing physical newlines. NDJSON is simpler and more compatible with shell tools; JSON Text Sequences are more formally robust.

### 1.4 A `.jsonl` file versus a JSONL wire stream

The extension is not essential. The same bytes may be:

- stored in `events.jsonl`
- written over stdout
- emitted in an HTTP response
- passed through a Unix socket
- appended to an object-store log
- published as message payloads

The framing convention exists independently of whether the records are persisted.

---

## 2. The central distinction: transport framing versus application framing

Consider this application event:

```json
{"type":"message.delta","sequence":42,"delta":"hello"}
```

It travels through multiple framing layers.

### 2.1 Application framing

JSONL says:

```text
<JSON bytes>\n
```

This lets the application parser find event boundaries.

### 2.2 HTTP/1.1 transfer framing

When the body length is unknown in advance, an HTTP/1.1 implementation may send chunked transfer coding:

```text
2A\r\n
{"type":"message.delta","sequ
\r\n
1B\r\n
ence":42,"delta":"hello"}\n
\r\n
0\r\n
\r\n
```

The HTTP chunk boundary split the JSON record in the middle. That is legal and common.

**Never assume one TCP packet, one HTTP chunk, one `reader.read()`, or one Node `data` callback equals one JSONL record.**

### 2.3 HTTP/2 and HTTP/3 framing

HTTP/2 and HTTP/3 do not use HTTP/1.1 chunked transfer coding. They carry response-body bytes in protocol data frames. Those frame boundaries are also unrelated to JSONL newlines.

Thus the robust parser is always:

```text
bytes → incremental UTF-8 decoder → text buffer → newline extraction → JSON.parse
```

not:

```text
network chunk → JSON.parse
```

### 2.4 TCP segmentation

Below HTTP, TCP may combine or split writes arbitrarily. TLS records and proxy buffers introduce additional boundaries. None are application records.

---

## 3. Why newline-delimited JSON is useful

### 3.1 Incremental production

A producer can serialize and flush one event without knowing:

- how many events will follow
- the total byte length
- how long the run will last
- whether the run will succeed
- whether tools or humans will intervene

### 3.2 Incremental parsing with ordinary JSON

A regular JSON array is incomplete until its closing bracket:

```json
[
  {"type":"a"},
  {"type":"b"}
]
```

Although specialized streaming JSON parsers can emit elements early, `JSON.parse()` cannot parse that document until complete.

JSONL makes every line independently parseable:

```jsonl
{"type":"a"}
{"type":"b"}
```

### 3.3 Bounded memory

The consumer needs to retain only:

- the unfinished tail of the current line
- application state needed for the run
- optional replay or persistence buffers

Memory becomes approximately proportional to the largest record rather than the complete response.

### 3.4 Low time to first useful event

The server can flush a `run.started`, token delta, or tool status event immediately instead of buffering the final answer.

This improves perceived latency even if total completion time is unchanged.

### 3.5 Append-only persistence and replay

The same event representation can be appended to disk:

```text
runs/run_123/events.jsonl
```

and replayed later to:

- reconstruct a UI
- debug a failed execution
- compare model versions
- audit tool calls
- resume from a checkpoint
- feed offline evaluation

### 3.6 Unix and data-pipeline interoperability

JSONL works naturally with:

```bash
jq -c 'select(.type == "tool.completed")' events.jsonl
grep '"level":"error"' events.jsonl
wc -l events.jsonl
tail -f events.jsonl
```

### 3.7 Failure isolation

A malformed record can be reported with sequence number and byte offset. Depending on protocol policy, later lines may still be consumed.

With one giant JSON document, corruption can invalidate the whole document.

---

## 4. What JSONL does not provide

JSONL does not inherently provide:

- delivery guarantees
- ordering across multiple concurrent connections
- replay
- deduplication
- authentication
- authorization
- integrity
- schema evolution
- cancellation semantics
- flow control
- browser reconnection
- request/response correlation
- transactional boundaries
- exactly-once processing

Those are protocol and application responsibilities.

---

## 5. Agentic event lifecycles

A useful agent stream is not merely text tokens. It is an ordered sequence of domain events.

### 5.1 Canonical run lifecycle

```text
run.created
run.started
message.started
message.delta*
message.completed
tool.call.created
tool.call.arguments.delta*
tool.call.ready
tool.execution.started
tool.execution.progress*
tool.execution.completed | tool.execution.failed
message.started
message.delta*
message.completed
usage.updated
run.completed | run.failed | run.cancelled
```

The exact order varies because an agent may:

- call several tools in parallel
- hand off to another agent
- pause for human approval
- retry a model or tool
- produce intermediate messages
- compact history
- spawn subagents
- recover a disconnected client

### 5.2 Event envelope

A production event should carry more than `type` and payload:

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_01J...",
  "runId": "run_01J...",
  "streamId": "response",
  "sequence": 42,
  "type": "tool.execution.completed",
  "timestamp": "2026-07-26T17:22:11.392Z",
  "correlationId": "call_weather_7",
  "causationId": "evt_01J_prev",
  "payload": {
    "toolName": "get_weather",
    "result": {
      "temperatureF": 71
    }
  }
}
```

Recommended meanings:

- `eventId`: globally or run-unique immutable identity
- `runId`: groups one execution
- `streamId`: distinguishes multiplexed logical streams
- `sequence`: total order within a defined scope
- `correlationId`: ties request and result together
- `causationId`: identifies the event that directly caused this event
- `schemaVersion`: enables validation and migration
- `timestamp`: observability, not primary ordering
- `type`: stable discriminator
- `payload`: event-specific body

### 5.3 Why the lifecycle may outlive visible text

A run is not necessarily complete when the final token is displayed. The harness may still need to:

- persist final state
- write checkpoints
- calculate usage
- close traces
- commit approval state
- compact history
- emit terminal events
- release tool resources

Consumers should treat the explicit terminal event or clean stream completion as authoritative.

---

## 6. Round trip example 1: local agent over stdio JSONL

This is the simplest place to understand the mechanics.

### 6.1 Topology

```text
parent harness
    ├─ child.stdin  → server input
    └─ child.stdout ← server output
```

MCP stdio uses newline-delimited UTF-8 JSON-RPC messages. Stdout must remain protocol-clean; logs belong on stderr.

### 6.2 Request

Parent writes one line:

```jsonl
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"add","arguments":{"a":2,"b":3}}}
```

### 6.3 Response

Server writes:

```jsonl
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"5"}]}}
```

### 6.4 Node.js TypeScript server

```ts
#!/usr/bin/env node

import { createInterface } from "node:readline";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

function writeMessage(message: JsonRpcSuccess | JsonRpcError): void {
  const serialized = JSON.stringify(message);

  // One protocol message, then one physical LF.
  process.stdout.write(`${serialized}\n`);
}

const lines = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

lines.on("line", (line) => {
  if (line.length === 0) {
    return;
  }

  let request: JsonRpcRequest;

  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch (error: unknown) {
    console.error("Invalid JSON-RPC input", error);
    writeMessage({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: "Parse error",
      },
    });
    return;
  }

  if (request.method !== "tools/call") {
    writeMessage({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: "Method not found",
      },
    });
    return;
  }

  const params = request.params as {
    name?: unknown;
    arguments?: unknown;
  };

  if (params.name !== "add") {
    writeMessage({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32602,
        message: "Unknown tool",
      },
    });
    return;
  }

  const args = params.arguments as { a?: unknown; b?: unknown };

  if (typeof args.a !== "number" || typeof args.b !== "number") {
    writeMessage({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32602,
        message: "a and b must be numbers",
      },
    });
    return;
  }

  writeMessage({
    jsonrpc: "2.0",
    id: request.id,
    result: {
      content: [{ type: "text", text: String(args.a + args.b) }],
    },
  });
});
```

### 6.5 Parent process

```ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const child = spawn(process.execPath, ["dist/server.js"], {
  stdio: ["pipe", "pipe", "inherit"],
});

const responses = createInterface({
  input: child.stdout,
  crlfDelay: Infinity,
});

responses.on("line", (line) => {
  const message: unknown = JSON.parse(line);
  console.log("Received", message);
});

child.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "add",
      arguments: { a: 2, b: 3 },
    },
  })}\n`,
);
```

### 6.6 Lifecycle characteristics

- bidirectional
- ordered per pipe
- local process boundary
- natural operating-system backpressure
- no network authentication
- process death signals connection failure
- replay must be added separately
- stdout contamination is protocol corruption

---

## 7. Round trip example 2: HTTP POST request with NDJSON response

This example is not MCP. It is a minimal custom agent endpoint showing the mechanics directly.

### 7.1 Protocol

Request:

```http
POST /runs HTTP/1.1
Content-Type: application/json
Accept: application/x-ndjson
```

Body:

```json
{"input":"Add 2 and 3, then explain the result."}
```

Response headers:

```http
HTTP/1.1 200 OK
Content-Type: application/x-ndjson; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

Logical response body:

```jsonl
{"type":"run.started","runId":"run_123","sequence":1}
{"type":"tool.call","runId":"run_123","sequence":2,"name":"add","arguments":{"a":2,"b":3}}
{"type":"tool.result","runId":"run_123","sequence":3,"name":"add","result":5}
{"type":"message.delta","runId":"run_123","sequence":4,"delta":"2 + 3 "}
{"type":"message.delta","runId":"run_123","sequence":5,"delta":"equals 5."}
{"type":"run.completed","runId":"run_123","sequence":6}
```

### 7.2 Node.js TypeScript server with backpressure

```ts
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";

interface StreamEvent {
  type: string;
  runId: string;
  sequence: number;
  [key: string]: unknown;
}

async function writeNdjson(
  response: ServerResponse,
  event: StreamEvent,
): Promise<void> {
  const line = `${JSON.stringify(event)}\n`;

  // write() returns false when the internal buffer has reached its
  // high-water mark. Wait for "drain" before producing more.
  if (!response.write(line, "utf8")) {
    await once(response, "drain");
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/runs") {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Content-Type-Options": "nosniff",
    "X-Accel-Buffering": "no",
  });

  const runId = crypto.randomUUID();
  let sequence = 0;

  const emit = async (
    event: Omit<StreamEvent, "runId" | "sequence">,
  ): Promise<void> => {
    sequence += 1;
    await writeNdjson(response, {
      ...event,
      runId,
      sequence,
    });
  };

  try {
    await emit({ type: "run.started" });
    await emit({
      type: "tool.call",
      name: "add",
      arguments: { a: 2, b: 3 },
    });
    await emit({
      type: "tool.result",
      name: "add",
      result: 5,
    });
    await emit({
      type: "message.delta",
      delta: "2 + 3 ",
    });
    await emit({
      type: "message.delta",
      delta: "equals 5.",
    });
    await emit({ type: "run.completed" });
  } catch (error: unknown) {
    if (!response.destroyed) {
      await emit({
        type: "run.failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } finally {
    response.end();
  }
});

server.listen(3000);
```

### 7.3 Browser or Node fetch client

```ts
interface AgentEvent {
  type: string;
  runId: string;
  sequence: number;
  [key: string]: unknown;
}

async function* parseNdjson<T>(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // stream:true preserves an incomplete multibyte UTF-8 character
      // between network chunks.
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const newlineIndex = buffer.indexOf("\n");

        if (newlineIndex < 0) {
          break;
        }

        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        const line = rawLine.endsWith("\r")
          ? rawLine.slice(0, -1)
          : rawLine;

        if (line.length === 0) {
          continue;
        }

        yield JSON.parse(line) as T;
      }
    }

    buffer += decoder.decode();

    if (buffer.trim().length > 0) {
      // Choose this policy deliberately. A strict protocol may reject
      // an unterminated final record instead.
      yield JSON.parse(buffer) as T;
    }
  } finally {
    reader.releaseLock();
  }
}

async function runAgent(): Promise<void> {
  const abortController = new AbortController();

  const response = await fetch("http://localhost:3000/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({
      input: "Add 2 and 3, then explain the result.",
    }),
    signal: abortController.signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.body === null) {
    throw new Error("Response has no readable body");
  }

  let expectedSequence = 1;

  for await (const event of parseNdjson<AgentEvent>(response.body)) {
    if (event.sequence !== expectedSequence) {
      throw new Error(
        `Sequence gap: expected ${expectedSequence}, received ${event.sequence}`,
      );
    }

    expectedSequence += 1;

    switch (event.type) {
      case "message.delta":
        process.stdout.write(String(event.delta ?? ""));
        break;
      case "run.failed":
        throw new Error(String(event.error ?? "Run failed"));
      default:
        console.error("\nEvent:", event);
    }
  }
}
```

### 7.4 Important mechanics

The server may call `response.write()` once per event, but the client may observe:

- half an event in one read
- several events in one read
- an UTF-8 character split across reads
- a delayed batch because a proxy buffered output
- a transport failure before a terminal event

The line parser must handle all of them.

---

## 8. Round trip example 3: bidirectional streaming request and response

Some runtimes support streaming request bodies with `fetch`, though browser and intermediary support must be tested carefully.

### 8.1 Use case

A parent harness streams input events:

```jsonl
{"type":"input.text","sequence":1,"text":"Inspect repository"}
{"type":"input.file","sequence":2,"path":"src/index.ts"}
{"type":"input.end","sequence":3}
```

The server simultaneously emits output events.

This is conceptually full duplex, but real-world HTTP stacks may buffer the request before exposing the response. HTTP/2 and HTTP/3 are better suited than legacy infrastructure, yet implementation behavior still matters.

### 8.2 Streaming request construction

```ts
function createInputStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const events = [
        {
          type: "input.text",
          sequence: 1,
          text: "Inspect repository",
        },
        {
          type: "input.file",
          sequence: 2,
          path: "src/index.ts",
        },
        {
          type: "input.end",
          sequence: 3,
        },
      ];

      for (const event of events) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify(event)}\n`),
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      controller.close();
    },
  });
}

const response = await fetch("https://agent.example.com/duplex", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-ndjson",
    Accept: "application/x-ndjson",
  },
  body: createInputStream(),

  // Required by Node's fetch implementation for streaming request bodies.
  // This option is runtime-specific and not part of the normal browser
  // RequestInit surface.
  duplex: "half",
} as RequestInit & { duplex: "half" });
```

### 8.3 When to avoid this pattern

Avoid relying on one full-duplex HTTP request when:

- browsers are primary clients
- corporate proxies are unknown
- request buffering is enabled
- the deployment platform does not expose early response bytes
- independent reconnect for each direction is required

Use one of these instead:

- POST commands + SSE output
- MCP Streamable HTTP POST/GET pattern
- WebSocket
- WebTransport
- message broker plus HTTP control plane

---

## 9. Round trip example 4: SSE carrying JSON events

Server-Sent Events are an application framing format over an HTTP response.

### 9.1 Wire format

```text
id: 41
event: message.delta
data: {"runId":"run_123","sequence":41,"delta":"Hel"}

id: 42
event: message.delta
data: {"runId":"run_123","sequence":42,"delta":"lo"}

```

A blank line terminates each SSE event.

### 9.2 Distinction from JSONL

SSE is not JSONL. It can carry JSON in its `data:` field, but the outer framing is SSE.

Benefits over raw NDJSON:

- standardized browser `EventSource`
- event IDs
- `Last-Event-ID`
- automatic reconnection
- named event types
- comments as heartbeats

Costs:

- browser `EventSource` is GET-oriented
- unidirectional server to client
- extra text framing
- custom headers are awkward with native `EventSource`
- multiline `data:` handling is required
- binary payloads require encoding

### 9.3 SSE server

```ts
import { createServer } from "node:http";

const server = createServer(async (request, response) => {
  if (request.url !== "/events") {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let sequence = 0;

  const emit = (
    type: string,
    payload: Record<string, unknown>,
  ): void => {
    sequence += 1;
    response.write(`id: ${sequence}\n`);
    response.write(`event: ${type}\n`);
    response.write(`data: ${JSON.stringify({
      ...payload,
      sequence,
    })}\n\n`);
  };

  emit("run.started", { runId: "run_123" });
  emit("message.delta", { runId: "run_123", delta: "Hello" });
  emit("run.completed", { runId: "run_123" });

  response.end();
});

server.listen(3000);
```

### 9.4 Browser client

```ts
const events = new EventSource("/events");

events.addEventListener("message.delta", (rawEvent) => {
  const event = rawEvent as MessageEvent<string>;
  const payload: unknown = JSON.parse(event.data);
  console.log(payload);
});

events.addEventListener("run.completed", () => {
  events.close();
});

events.onerror = (error) => {
  console.error("SSE error", error);
};
```

---

## 10. Round trip example 5: MCP Streamable HTTP

MCP uses JSON-RPC for message semantics. Its modern Streamable HTTP transport uses HTTP POST and GET, and can use SSE to stream multiple server messages.

### 10.1 Important correction

MCP Streamable HTTP is not “JSONL over HTTP.”

- MCP stdio uses newline-delimited JSON-RPC messages.
- MCP Streamable HTTP may return one JSON response or an SSE stream.
- SSE frames contain JSON-RPC messages as data.
- Session IDs, protocol version headers, resumability, and server-initiated messages are transport-level concerns beyond JSONL.

### 10.2 Simplified lifecycle

```text
Client                          Server
  | POST initialize              |
  |----------------------------->|
  | 200 JSON or SSE + session ID |
  |<-----------------------------|
  | initialized notification     |
  |----------------------------->|
  | POST tools/call              |
  |----------------------------->|
  | SSE: progress notification   |
  |<-----------------------------|
  | SSE: JSON-RPC result         |
  |<-----------------------------|
  | GET /mcp for server stream   |
  |----------------------------->|
  | SSE notifications/requests   |
  |<=============================|
  | DELETE /mcp or close         |
  |----------------------------->|
```

Exact requirements depend on the negotiated MCP protocol version.

### 10.3 Official TypeScript SDK shape

```ts
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";

const server = new McpServer({
  name: "example-server",
  version: "1.0.0",
});

const transport = new NodeStreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

await server.connect(transport);
```

Client:

```ts
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const client = new Client({
  name: "example-client",
  version: "1.0.0",
});

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3000/mcp"),
);

await client.connect(transport);
```

Production servers need HTTP routing, session lookup, initialization validation, cleanup, authentication, host/origin validation, and optional event storage for replay.

### 10.4 Stateful versus stateless

**Stateless**

- new protocol instance per request
- easy horizontal scaling
- no in-memory session affinity
- limited server-initiated behavior
- no automatic replay unless added externally

**Stateful**

- server generates a session ID
- subsequent requests route to session state
- supports richer long-lived behavior
- requires cleanup and expiry
- horizontal scaling needs sticky routing, shared state, or pub/sub message routing

### 10.5 Resumability

A robust resumable stream needs:

- event IDs
- durable or bounded event store
- client acknowledgement or last-event marker
- replay from a known event
- duplicate suppression
- retention/expiry policy
- clear behavior when requested history has expired

SSE’s `Last-Event-ID` mechanism can support this, but MCP implementations must follow the protocol’s version-specific rules.

---

## 11. JSONL parser design

### 11.1 Required parser state

At minimum:

```ts
interface ParserState {
  decoder: TextDecoder;
  pendingText: string;
  lineNumber: number;
  byteOffset: number;
}
```

### 11.2 UTF-8 boundary correctness

A Unicode code point may span network chunks. This is wrong:

```ts
const text = new TextDecoder().decode(chunk);
```

when a new decoder is created for every chunk.

Use one decoder and streaming mode:

```ts
buffer += decoder.decode(chunk, { stream: true });
```

Then flush at end:

```ts
buffer += decoder.decode();
```

### 11.3 Maximum record size

Without a limit, a malicious or broken producer can send an infinite line, growing memory indefinitely.

Example policy:

```ts
const MAX_RECORD_BYTES = 1 * 1024 * 1024;
```

Enforce by bytes, not only JavaScript string length.

### 11.4 Strict terminal newline policy

Choose one:

1. accept a final valid record without LF
2. reject as truncated
3. accept for files but reject for live protocol streams

For durable event logs, requiring the trailing newline makes crash detection easier: a nonterminated tail is visibly incomplete.

### 11.5 Blank lines

Decide whether blank lines are:

- ignored
- forbidden
- treated as heartbeat records

Do not leave behavior accidental.

### 11.6 Parse and schema validation

`JSON.parse()` proves syntax, not event validity.

Validate the envelope and payload with a schema library such as Zod, Valibot, ArkType, JSON Schema, or generated codecs.

```ts
import * as z from "zod/v4";

const BaseEventSchema = z.object({
  schemaVersion: z.string(),
  eventId: z.string(),
  runId: z.string(),
  sequence: z.number().int().nonnegative(),
  type: z.string(),
  timestamp: z.iso.datetime(),
  payload: z.unknown(),
});
```

### 11.7 Unknown event types

Forward-compatible consumers should usually:

- validate the base envelope
- record unknown event types
- ignore them unless marked critical
- preserve them during proxying or persistence

A `requiredCapabilities` or `critical` flag can prevent unsafe silent ignoring.

---

## 12. Backpressure and buffering

### 12.1 What backpressure means

Backpressure propagates consumer slowness upstream so producers do not create unbounded queues.

Without it:

```text
model emits fast
→ serializer queues
→ HTTP server buffers
→ proxy buffers
→ client cannot keep up
→ memory increases
→ latency increases
→ process may fail
```

### 12.2 Node writable backpressure

When `writable.write()` returns `false`, stop writing and wait for `drain`.

```ts
if (!response.write(line)) {
  await once(response, "drain");
}
```

Ignoring this return value defeats Node’s buffering controls.

### 12.3 Web Streams backpressure

`ReadableStream` and `WritableStream` track internal queues and high-water marks. `desiredSize` indicates whether the producer should enqueue more.

Prefer pipe chains where possible:

```ts
response.body
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(createLineSplitter())
  .pipeThrough(createJsonParser())
  .pipeTo(eventSink);
```

### 12.4 LLM provider backpressure limitations

A harness may not be able to slow the upstream model provider indefinitely. It may need to:

- maintain a bounded queue
- coalesce token deltas
- drop noncritical telemetry
- pause tool-progress polling
- spill events to durable storage
- cancel the run when limits are exceeded

Never silently drop lifecycle-critical events.

### 12.5 Proxy buffering

Even correct server code may appear nonstreaming because of:

- Nginx proxy buffering
- CDN response coalescing
- serverless platform buffering
- compression middleware
- antivirus or enterprise gateways
- minimum flush thresholds

Mitigations include:

- `Cache-Control: no-cache, no-transform`
- `X-Accel-Buffering: no` for Nginx-compatible stacks
- disabling response buffering in the reverse proxy
- periodic heartbeat records
- avoiding tiny writes
- testing through the actual production route

### 12.6 Compression

Compression can reduce bandwidth but delay delivery because compressors buffer.

Tradeoffs:

- token deltas are tiny and compress well only in batches
- event metadata repeats and compresses well
- per-event flush can hurt compression ratio
- gzip flush modes add CPU and framing overhead

Evaluate:

- no compression for low-latency interactive streams
- moderate batching plus compression for high-volume telemetry
- separate interactive and archival streams

---

## 13. Event granularity

### 13.1 One event per token

Pros:

- lowest theoretical display latency
- precise replay

Cons:

- high syscall and framing overhead
- large metadata-to-payload ratio
- more JSON parsing
- more UI updates
- poor compression efficiency

### 13.2 Coalesced text deltas

Combine tokens for:

- 10–50 milliseconds
- 32–512 bytes
- punctuation or semantic boundaries

Pros:

- much lower overhead
- often imperceptible latency difference
- easier rendering

Cons:

- slightly higher time to each visible fragment

### 13.3 Semantic events

Tool starts, approvals, handoffs, and terminal state should be independent records, not hidden inside text deltas.

---

## 14. Ordering, concurrency, and causality

### 14.1 Total order versus partial order

A single `sequence` creates a total order for one stream. Parallel tools create causally independent branches.

Example:

```jsonl
{"sequence":10,"type":"tool.started","callId":"A"}
{"sequence":11,"type":"tool.started","callId":"B"}
{"sequence":12,"type":"tool.completed","callId":"B"}
{"sequence":13,"type":"tool.completed","callId":"A"}
```

The event order does not imply tool B was caused by tool A.

Use:

- `callId`
- `parentEventId`
- `causationId`
- span/trace IDs
- per-substream sequence numbers if needed

### 14.2 Multiplexing

One physical connection may carry several runs or subagents. Every record then needs routing identity.

Do not rely on “current run” mutable parser state when multiplexing.

### 14.3 Duplicate events

Reconnection and replay can produce duplicates. Consumers should persist the highest contiguous sequence or a set of recent event IDs.

Processing should be idempotent where possible.

### 14.4 Sequence gaps

A gap can mean:

- lost event
- retention expiry
- server bug
- out-of-order multiplexing
- client resumed from the wrong cursor

Treat it as an explicit condition, not a cosmetic warning.

---

## 15. Cancellation, timeouts, and disconnects

### 15.1 Client cancellation

Use `AbortController` for fetch:

```ts
const controller = new AbortController();

const response = await fetch(url, {
  signal: controller.signal,
});

controller.abort("User cancelled");
```

The server must connect transport cancellation to:

- model request cancellation
- tool cancellation
- child-process termination
- database query cancellation
- run state transition
- final audit event

### 15.2 Disconnect does not always mean cancel

A mobile client may disconnect while the user expects the run to continue.

Define run policy:

- **connection-bound:** disconnect cancels execution
- **detached:** execution continues and can be resumed
- **lease-bound:** execution continues for a grace period
- **durable job:** connection is only a subscription

### 15.3 Timeouts

Use separate timeouts:

- connection establishment
- first event
- idle stream
- individual tool
- overall run
- replay request
- graceful shutdown

A single global timeout obscures failure diagnosis.

### 15.4 Terminal events

Use explicit terminal states:

```text
run.completed
run.failed
run.cancelled
run.expired
```

Transport EOF without a terminal event should be treated as indeterminate or interrupted, not success.

---

## 16. Persistence and event sourcing

### 16.1 JSONL as an append log

A simple implementation:

```text
runs/
  run_123/
    events.jsonl
    metadata.json
    checkpoint.json
```

Write order:

1. construct event
2. assign immutable ID and sequence
3. append durably
4. publish to subscribers
5. update projections/checkpoints

This is preferable when replay correctness matters. Publishing first can expose an event that is lost after a crash.

### 16.2 Durability tradeoffs

`fsync` per event is durable but expensive.

Alternatives:

- group commit every few milliseconds
- append to a durable broker
- transactional database outbox
- WAL-backed event store
- local append followed by asynchronous object-store upload

### 16.3 Checkpoints

Replaying millions of token events to reconstruct state is inefficient.

Persist periodic snapshots:

```json
{
  "runId": "run_123",
  "throughSequence": 5000,
  "state": {
    "messages": [],
    "toolCalls": {},
    "activeAgent": "researcher"
  }
}
```

Resume from snapshot plus events after sequence 5000.

### 16.4 Privacy and redaction

Agent streams can contain:

- prompts
- secrets
- tool credentials
- file contents
- personal data
- model reasoning-like internal traces
- database records

Classify events and apply redaction before persistence, not only before display.

---

## 17. Observability

### 17.1 Metrics

Measure:

- time to headers
- time to first event
- time to first visible text
- time to first tool call
- inter-event gap
- total run duration
- events per second
- bytes per event
- queue depth
- backpressure duration
- reconnect count
- replay count
- parse failures
- sequence gaps
- terminal-state distribution

### 17.2 Distributed tracing

Correlate:

```text
HTTP request span
└─ agent run span
   ├─ model call span
   ├─ tool A span
   ├─ tool B span
   └─ persistence span
```

Include W3C trace context where trust boundaries allow it. Do not accept arbitrary external trace IDs without validation.

### 17.3 Logging

Do not duplicate entire event payloads into ordinary logs by default. This increases cost and data exposure.

Log identifiers, event type, size, timing, and error metadata; retain full payloads in the governed event store when needed.

---

## 18. Performance evaluation methodology

### 18.1 Questions to answer

1. Does the first event reach the client promptly?
2. Is total throughput sufficient?
3. Is memory bounded under slow consumers?
4. Are intermediaries buffering?
5. What is overhead per event?
6. How costly are parse and validation?
7. Can the system reconnect and replay correctly?
8. How does concurrency affect tail latency?
9. What happens under malformed, oversized, or truncated records?
10. Does cancellation actually stop upstream work?

### 18.2 Core benchmarks

#### Benchmark A: framing overhead

Compare payload sizes for:

- JSON array
- JSONL
- SSE + JSON
- JSON Text Sequences
- length-prefixed JSON
- MessagePack
- Protocol Buffers

Evaluate raw and compressed bytes.

#### Benchmark B: latency versus batching

Test batch windows:

```text
0 ms, 5 ms, 10 ms, 25 ms, 50 ms, 100 ms
```

Measure p50, p95, p99 time-to-visible-delta and CPU.

#### Benchmark C: slow consumer

Throttle client reads:

```text
unlimited, 1 MB/s, 100 KB/s, 10 KB/s
```

Measure server memory, queue depth, and backpressure time.

#### Benchmark D: record size

Test:

```text
128 B, 1 KB, 16 KB, 256 KB, 1 MB
```

Measure parsing, allocation, garbage collection, and latency.

#### Benchmark E: proxy path

Test direct and through:

- local reverse proxy
- ingress controller
- CDN
- API gateway
- corporate VPN/proxy if applicable

#### Benchmark F: reconnect/replay

Disconnect at random sequences and verify:

- no missing event
- duplicates are tolerated
- final projection matches uninterrupted run

### 18.3 Representative test toolchain

- `autocannon` or `wrk` for HTTP load
- `k6` for scripted streaming scenarios
- `oha` for quick HTTP testing
- Node `perf_hooks`
- OpenTelemetry
- heap snapshots
- packet capture for flush analysis
- fault injection with Toxiproxy or `tc netem`

### 18.4 Example k6-style acceptance targets

Targets depend on workload, but define them explicitly:

```text
p95 time to first event < 300 ms after upstream first byte
p95 inter-delta delivery < 100 ms
server memory increase < 2 MB per slow connection
zero sequence gaps in clean runs
100% replay convergence after injected disconnect
cancellation reaches model/tool layer within 1 second
```

Do not use generic targets as proof of fitness; derive values from UX and operational requirements.

---

## 19. Pros and cons

### 19.1 JSONL / NDJSON

**Pros**

- extremely simple
- incremental parse with ordinary JSON
- human-readable
- shell-friendly
- append-friendly
- language-neutral
- easy replay
- low framing overhead

**Cons**

- newline rule must be enforced
- no built-in event IDs or reconnection
- textual and relatively verbose
- no native browser abstraction
- binary data requires encoding or references
- one oversized line can exhaust memory
- media-type conventions are fragmented
- malformed-line policy is application-defined

### 19.2 SSE with JSON

**Pros**

- standardized browser support
- automatic reconnect
- event IDs and `Last-Event-ID`
- named event types
- heartbeat comments
- proxy-friendly when configured correctly

**Cons**

- server-to-client only
- GET-centric native API
- text only
- extra framing overhead
- connection limits and proxy buffering can matter
- authentication/custom headers may need fetch-based SSE clients

### 19.3 WebSocket

**Pros**

- full duplex
- message boundaries
- text and binary
- low per-message overhead after upgrade
- strong fit for interactive bidirectional agents

**Cons**

- separate operational path from normal HTTP
- proxy and load-balancer configuration
- custom reconnection and replay
- no standard request/response semantics
- backpressure APIs differ by runtime
- connection state complicates horizontal scaling

### 19.4 MCP Streamable HTTP

**Pros**

- standardized agent/tool protocol
- JSON-RPC correlation
- supports simple JSON and richer SSE streaming
- session and protocol lifecycle
- server-to-client requests/notifications
- resumability patterns
- works through ordinary HTTP infrastructure

**Cons**

- more protocol complexity
- version negotiation
- session routing and event storage may be required
- not raw JSONL
- implementations must follow security requirements
- richer semantics can be unnecessary for a simple stream

---

## 20. Alternatives

### 20.1 JSON array with a streaming parser

Good when the final representation must also be one valid JSON document.

Costs:

- specialized parser
- more complex recovery
- closing delimiter still matters
- append-only storage is awkward

### 20.2 RFC 7464 JSON Text Sequences

Choose when:

- standards compliance matters
- records may be pretty-printed
- resynchronization after corruption matters

Tradeoff: fewer ubiquitous tools than NDJSON.

### 20.3 Length-prefixed JSON

Wire format:

```text
00000127:<127 JSON bytes>
```

or binary integer prefix.

Pros:

- newlines allowed
- exact allocation
- robust boundaries
- efficient parsing

Cons:

- less human-readable
- partial prefix handling
- custom tooling
- corrupt length can desynchronize

### 20.4 Netstrings

```text
12:{"ok":true},
```

Simple, unambiguous length framing; uncommon in browser-facing APIs.

### 20.5 Multipart responses

`multipart/mixed` can stream heterogeneous records and binary parts.

Useful when one run returns JSON metadata plus files or images.

Costs: more parsing complexity and uneven client support.

### 20.6 gRPC streaming / Protocol Buffers

Pros:

- typed schemas
- compact binary representation
- bidirectional streaming
- generated clients
- HTTP/2 flow control

Cons:

- browser constraints
- debugging friction
- schema/toolchain overhead
- gateways may be needed

### 20.7 WebTransport

Provides multiplexed reliable streams and datagrams over HTTP/3.

Promising for advanced low-latency applications, but less universally deployable than HTTP/SSE or WebSocket.

### 20.8 Message brokers

Kafka, NATS, RabbitMQ, Redis Streams, Azure Service Bus, and cloud pub/sub systems are better when the stream must be:

- durable
- fan-out
- asynchronously processed
- independently consumed
- replayable across services

They are infrastructure, not UI-facing wire formats. A gateway may translate broker events to SSE or NDJSON.

### 20.9 CloudEvents

CloudEvents standardizes event metadata but does not prescribe one transport. It can be serialized as structured JSON and then framed with JSONL, SSE, Kafka records, or HTTP requests.

---

## 21. Best-practice checklist

### Protocol

- Use a versioned event envelope.
- Assign immutable event IDs.
- Define sequence scope and ordering.
- Separate semantic events from text deltas.
- Define terminal states explicitly.
- Define malformed and unknown-event behavior.
- Document media type and newline policy.
- Put request/result correlation IDs on tool events.

### Parser

- Treat network chunks as arbitrary bytes.
- Use a streaming UTF-8 decoder.
- buffer incomplete lines.
- enforce maximum record size.
- validate schemas after `JSON.parse()`.
- distinguish clean EOF from truncated final record.
- handle CRLF intentionally.
- expose cancellation.

### Server

- honor writable backpressure.
- coalesce tiny deltas.
- disable unwanted intermediary buffering.
- emit heartbeats only when operationally needed.
- test compression rather than assuming.
- stop upstream work on cancellation when policy requires.
- close with a terminal event before EOF when possible.
- avoid synchronous CPU-heavy work in the stream loop.

### Reliability

- persist before publish when durable replay is required.
- support idempotent consumption.
- retain bounded replay history.
- checkpoint long runs.
- detect sequence gaps.
- define disconnect policy.
- define retention and expired-cursor behavior.

### Security

- authenticate before starting expensive work.
- authorize tools separately from connection access.
- validate `Origin`/host where required.
- bind local servers to loopback by default.
- limit request and record sizes.
- rate-limit connections and run creation.
- redact secrets before persistence.
- never mix logs with stdout protocol traffic.
- guard against decompression bombs and JSON depth abuse.

### Operations

- measure time to first event and inter-event gaps.
- monitor queue depth and backpressure.
- test through actual gateways and proxies.
- inject disconnects and malformed records.
- verify graceful shutdown.
- trace model, tool, and transport spans.
- version producer and consumer independently.

---

## 22. Recommended architecture for an agentic harness

For a new production system with browser UI, remote agents, persistence, and tool calls:

```text
UI
 │
 │ POST command / start run
 ▼
Agent API
 │
 ├─ durable run store
 ├─ event append log
 ├─ model adapter
 ├─ tool executor
 └─ policy/approval engine
 │
 │ SSE subscription or fetch-stream NDJSON
 ▼
UI event reducer
```

Recommended choices:

1. Use ordinary JSON POST requests for commands.
2. Use SSE for browser subscriptions when native reconnection and event IDs are valuable.
3. Use NDJSON over fetch when a simpler one-response lifecycle is enough and custom headers/auth are important.
4. Use MCP Streamable HTTP for standardized client/server tool interoperability.
5. Use stdio newline-delimited JSON-RPC for local subprocess integrations.
6. Use a durable broker or event store behind the API when runs must survive process and client failure.
7. Use WebSocket only when true low-latency bidirectional interaction materially simplifies the product.

Do not select JSONL merely because the payloads are JSON. Select it when line-oriented incremental framing is the simplest correct solution for the lifecycle and reliability requirements.

---

## 23. Decision matrix

| Requirement | Preferred starting point |
|---|---|
| Local parent/child agent | stdio + newline-delimited JSON-RPC |
| One POST, incremental response | NDJSON over fetch |
| Browser server-push with reconnect | SSE carrying JSON |
| Full-duplex interactive session | WebSocket |
| Standard agent tool protocol | MCP Streamable HTTP |
| Strong typed internal microservices | gRPC streaming |
| Durable fan-out and replay | broker + gateway |
| Corruption resynchronization | RFC 7464 JSON Text Sequences |
| Mixed JSON and binary parts | multipart/mixed |
| Huge final JSON document | JSONL or specialized streaming JSON parser |

---

## 24. Final mental model

Think of JSONL as the grooves cut into a moving conveyor belt.

- HTTP, pipes, TCP, WebSockets, or brokers are the conveyor.
- JSONL newlines mark where one parcel ends.
- the event schema labels what each parcel means.
- sequence IDs establish order.
- event storage preserves parcels for replay.
- backpressure slows the conveyor when the receiver is overloaded.
- terminal events state that the shipment is complete.
- cancellation and retries govern what happens when transport or work fails.

The streaming advantage comes from the complete system. JSONL’s specific contribution is **cheap, explicit, incremental record boundaries around ordinary JSON values**.

---

## Sources and exemplar implementations

### Standards and protocol documentation

1. RFC 7464, *JavaScript Object Notation (JSON) Text Sequences*  
   https://www.rfc-editor.org/rfc/rfc7464.html

2. NDJSON 1.0 specification  
   https://github.com/ndjson/ndjson-spec

3. RFC 9112, *HTTP/1.1*, including chunked transfer coding  
   https://www.rfc-editor.org/rfc/rfc9112.html

4. WHATWG HTML Standard, *Server-sent events*  
   https://html.spec.whatwg.org/dev/server-sent-events.html

5. MDN, *Streams API*  
   https://developer.mozilla.org/en-US/docs/Web/API/Streams_API

6. MDN, *Streams API concepts*, including backpressure  
   https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Concepts

7. MCP specification, *Transports*  
   https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

### Exemplar GitHub repositories and documentation

8. Official MCP TypeScript SDK  
   https://github.com/modelcontextprotocol/typescript-sdk

9. MCP TypeScript SDK server guide  
   https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md

10. MCP TypeScript SDK client guide  
    https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md

11. MCP TypeScript SDK runnable server examples  
    https://github.com/modelcontextprotocol/typescript-sdk/tree/main/examples/server

12. NDJSON JavaScript streaming parser/serializer  
    https://github.com/ndjson/ndjson.js

13. OpenAI Agents Python SDK streaming guide  
    https://openai.github.io/openai-agents-python/streaming/

14. OpenAI Agents Python SDK stream-event reference  
    https://openai.github.io/openai-agents-python/ref/stream_events/

### Notes on source selection

The standards above establish byte-level and wire-level behavior. The MCP SDK demonstrates a contemporary agent protocol with stdio, Streamable HTTP, SSE, sessions, and replay patterns. The OpenAI Agents SDK illustrates the distinction between raw model events, higher-level run-item events, agent transitions, and lifecycle completion. The code in this document is original explanatory code modeled on those documented mechanics rather than copied wholesale.
---

# Part II — Applying the event-streaming model to custom GitHub Copilot SDK harnesses

**Research expansion date:** July 26, 2026  
**SDK status:** GitHub Copilot SDK is currently in public preview. APIs, event names, availability, and billing semantics may change.

This section applies the lifecycle, framing, persistence, replay, and observability concepts from Part I specifically to custom agent harnesses built on the GitHub Copilot SDK.

The essential architectural fact is:

> Your application normally does not consume the Copilot agent's underlying wire-format JSONL directly. The SDK and Copilot CLI/runtime own that lower-level protocol boundary. Your harness consumes a typed session-event API and may then project, persist, relay, or reframe those events as JSONL, SSE, WebSocket messages, database records, or broker events.

That distinction prevents a common design mistake: treating each SDK callback as though it were necessarily one original transport packet or one original `.jsonl` line. The SDK has already decoded and normalized the underlying protocol. At the application boundary, the stable unit is the **session event object**.

---

## 25. Copilot SDK architecture in a custom harness

A practical custom harness has five layers:

```text
User interface / API consumer
        │
        │ commands, prompts, approvals, steering
        ▼
Your harness application
        │
        ├─ session registry
        ├─ event projector
        ├─ persistence/replay
        ├─ permissions and policy
        ├─ tools and MCP configuration
        ├─ sub-agent visualization
        └─ observability
        │
        ▼
GitHub Copilot SDK
        │
        ▼
Copilot CLI / Copilot runtime
        │
        ├─ model provider calls
        ├─ built-in tools
        ├─ custom tools
        ├─ MCP servers
        ├─ skills
        └─ custom sub-agents
```

The SDK exposes session events such as:

```text
assistant.turn_start
assistant.intent
assistant.reasoning_delta
assistant.message_delta
assistant.message
tool.execution_start
tool.execution_partial_result
tool.execution_progress
tool.execution_complete
permission.requested
subagent.selected
subagent.started
subagent.completed
subagent.failed
session.compaction_start
session.compaction_complete
session.usage_info
session.idle
session.error
session.shutdown
```

The SDK's event stream is richer than a token stream. A custom harness should preserve that richness rather than flattening everything into visible text.

---

## 26. Copilot SDK event envelope

All session events share an envelope conceptually shaped like:

```ts
interface CopilotSessionEvent {
  id: string;
  timestamp: string;
  parentId: string | null;
  agentId?: string;
  ephemeral?: boolean;
  type: string;
  data: unknown;
}
```

Important fields:

- `id`: immutable UUID for the event
- `timestamp`: event creation time
- `parentId`: points to the previous event, creating a linked event chain
- `agentId`: identifies a sub-agent instance; omitted for root-agent and session-level events
- `ephemeral`: marks live-only events that are not persisted in the session log
- `type`: event discriminator
- `data`: event-specific payload

### 26.1 Persisted versus ephemeral events

The Copilot SDK explicitly distinguishes:

**Ephemeral events**

- emitted in real time
- not persisted to the session event log
- not replayed when a session resumes
- commonly include token deltas, reasoning deltas, progress, usage snapshots, and idle signals

**Persisted events**

- stored in the Copilot session log
- replayed or reconstructed on session resume
- commonly include complete assistant messages, complete tool results, session context changes, and durable usage checkpoints

This distinction has direct consequences for a custom harness:

1. Do not assume resuming a Copilot session will replay every token delta.
2. Persist ephemeral events yourself when exact UI reconstruction is required.
3. Prefer complete persisted events as the canonical semantic record.
4. Treat deltas as transient presentation acceleration unless your product explicitly needs delta-level replay.
5. Avoid billing or audit calculations based solely on ephemeral callbacks.

### 26.2 `parentId` is not a numeric sequence

The event chain uses identifiers rather than a simple integer sequence.

Advantages:

- natural event ancestry
- easy chain validation
- works across persisted event identities
- useful for causality and reconstruction

Limitations:

- detecting missing events requires retaining IDs
- sorting still usually depends on arrival order or timestamp
- branching semantics need `agentId`, `toolCallId`, or additional application metadata
- distributed relays may want to add their own monotonic sequence

A relay envelope can preserve the SDK event and add a harness sequence:

```ts
interface HarnessEvent {
  schemaVersion: "1.0";
  harnessSequence: number;
  sessionId: string;
  receivedAt: string;
  copilotEvent: CopilotSessionEvent;
}
```

---

## 27. Full Copilot agent turn lifecycle

A typical agentic turn may look like:

```text
session.send()
  │
  ├─ assistant.turn_start
  ├─ assistant.intent*
  ├─ assistant.reasoning_delta*
  ├─ assistant.reasoning
  ├─ assistant.message_delta*
  ├─ assistant.message
  │    └─ toolRequests[]
  ├─ permission.requested?
  ├─ tool.execution_start
  ├─ tool.execution_partial_result*
  ├─ tool.execution_progress*
  ├─ tool.execution_complete
  ├─ assistant.turn_start or continuation
  ├─ assistant.message_delta*
  ├─ assistant.message
  ├─ assistant.usage*
  ├─ assistant.turn_end
  └─ session.idle
```

The terminal signal for one usable turn is generally `session.idle`, not merely the last `assistant.message_delta`.

A message may be followed by:

- tool execution
- another model call
- a sub-agent
- compaction
- approval waiting
- queued work
- background tasks

A custom harness should therefore maintain an explicit state machine.

### 27.1 Suggested turn state machine

```ts
type TurnStatus =
  | "queued"
  | "running"
  | "awaiting-permission"
  | "awaiting-user-input"
  | "executing-tools"
  | "running-subagents"
  | "compacting"
  | "idle"
  | "failed"
  | "cancelled";
```

State transitions should derive from events, not from UI assumptions.

---

## 28. Use case 1: terminal custom harness with complete event capture

This pattern is appropriate for:

- a custom developer CLI
- a test harness
- an internal debugging shell
- an agent research environment
- a local orchestration daemon

### 28.1 Installation

```bash
pnpm add @github/copilot-sdk zod
```

### 28.2 Complete TypeScript example

```ts
#!/usr/bin/env node

import {
  CopilotClient,
  type CopilotSession,
  type SessionEvent,
} from "@github/copilot-sdk";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface PersistedHarnessEvent {
  schemaVersion: "1.0";
  sequence: number;
  sessionId: string;
  receivedAt: string;
  event: SessionEvent;
}

class JsonlEventWriter {
  readonly #path: string;
  #sequence = 0;
  #writeChain: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
  }

  enqueue(sessionId: string, event: SessionEvent): Promise<void> {
    this.#sequence += 1;

    const record: PersistedHarnessEvent = {
      schemaVersion: "1.0",
      sequence: this.#sequence,
      sessionId,
      receivedAt: new Date().toISOString(),
      event,
    };

    const line = `${JSON.stringify(record)}\n`;

    // Serialize writes to preserve callback arrival order.
    this.#writeChain = this.#writeChain.then(() =>
      appendFile(this.#path, line, "utf8"),
    );

    return this.#writeChain;
  }

  async flush(): Promise<void> {
    await this.#writeChain;
  }
}

function attachTerminalRenderer(session: CopilotSession): () => void {
  return session.on((event) => {
    switch (event.type) {
      case "assistant.message_delta": {
        if (event.agentId === undefined) {
          process.stdout.write(event.data.deltaContent);
        }
        break;
      }

      case "assistant.intent": {
        process.stderr.write(
          `\n[intent] ${event.data.intent}\n`,
        );
        break;
      }

      case "tool.execution_start": {
        process.stderr.write(
          `\n[tool:start] ${event.data.toolName} ` +
            `${JSON.stringify(event.data.arguments ?? {})}\n`,
        );
        break;
      }

      case "tool.execution_partial_result": {
        process.stderr.write(event.data.partialOutput);
        break;
      }

      case "tool.execution_progress": {
        process.stderr.write(
          `\n[tool:progress] ${event.data.progressMessage}\n`,
        );
        break;
      }

      case "tool.execution_complete": {
        process.stderr.write(
          `\n[tool:${event.data.success ? "complete" : "failed"}] ` +
            `${event.data.toolCallId}\n`,
        );
        break;
      }

      case "subagent.started": {
        process.stderr.write(
          `\n[subagent:start] ${event.data.agentDisplayName}\n`,
        );
        break;
      }

      case "subagent.completed": {
        process.stderr.write(
          `\n[subagent:complete] ${event.data.agentDisplayName}\n`,
        );
        break;
      }

      case "subagent.failed": {
        process.stderr.write(
          `\n[subagent:failed] ${event.data.agentDisplayName}: ` +
            `${event.data.error}\n`,
        );
        break;
      }

      case "permission.requested": {
        process.stderr.write(
          `\n[permission] ${event.data.requestId}\n`,
        );
        break;
      }

      case "session.compaction_start": {
        process.stderr.write("\n[session] compaction started\n");
        break;
      }

      case "session.compaction_complete": {
        process.stderr.write(
          `\n[session] compaction ${event.data.success ? "complete" : "failed"}\n`,
        );
        break;
      }

      case "session.error": {
        process.stderr.write(
          `\n[session:error] ${event.data.errorType}: ` +
            `${event.data.message}\n`,
        );
        break;
      }

      case "session.idle": {
        process.stdout.write("\n");
        break;
      }
    }
  });
}

async function main(): Promise<void> {
  const client = new CopilotClient();

  const session = await client.createSession({
    model: "auto",
    streaming: true,
    onPermissionRequest: async (request) => {
      // Replace this with a real policy engine.
      process.stderr.write(
        `[permission-request] ${JSON.stringify(request)}\n`,
      );

      return { kind: "deny" };
    },
  });

  const eventWriter = new JsonlEventWriter(
    resolve(
      process.cwd(),
      ".copilot-harness",
      "sessions",
      `${session.sessionId}.jsonl`,
    ),
  );

  await eventWriter.initialize();

  const unsubscribePersistence = session.on((event) => {
    void eventWriter.enqueue(session.sessionId, event);
  });

  const unsubscribeRenderer = attachTerminalRenderer(session);

  try {
    await session.sendAndWait({
      prompt:
        "Inspect this repository and explain the request lifecycle.",
    });
  } finally {
    unsubscribeRenderer();
    unsubscribePersistence();
    await eventWriter.flush();
    await client.stop();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
```

### 28.3 Design notes

- Persist all callbacks if exact live diagnostics matter.
- Do not print diagnostic logs on stdout if stdout is itself being used as a protocol.
- Serialize file writes so callback concurrency cannot reorder records.
- Add periodic `fsync` or a durable store when crash recovery matters.
- Replace blanket permission behavior with policy-driven approval.
- Use complete messages and tool results as canonical state; deltas are display acceleration.

---

## 29. Use case 2: Copilot SDK to browser via NDJSON

A server-side harness can convert Copilot SDK events into an NDJSON HTTP response.

### 29.1 Topology

```text
Browser fetch()
    │
    │ POST /api/copilot/runs
    ▼
Node API
    │
    ├─ create or resume Copilot session
    ├─ subscribe to typed SDK events
    ├─ write normalized NDJSON records
    └─ map abort/disconnect to policy
```

### 29.2 Server example

```ts
import {
  CopilotClient,
  type SessionEvent,
} from "@github/copilot-sdk";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";

const client = new CopilotClient();

interface PublicAgentEvent {
  schemaVersion: "1.0";
  sequence: number;
  sessionId: string;
  type: string;
  timestamp: string;
  agentId?: string;
  ephemeral: boolean;
  data: unknown;
}

async function writeLine(
  response: ServerResponse,
  event: PublicAgentEvent,
): Promise<void> {
  const line = `${JSON.stringify(event)}\n`;

  if (!response.write(line, "utf8")) {
    await once(response, "drain");
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/api/copilot/runs") {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  });

  const session = await client.createSession({
    model: "auto",
    streaming: true,
    onPermissionRequest: async () => ({ kind: "deny" }),
  });

  let sequence = 0;
  let closed = false;
  let writeChain: Promise<void> = Promise.resolve();

  const emit = (event: SessionEvent): void => {
    sequence += 1;

    const publicEvent: PublicAgentEvent = {
      schemaVersion: "1.0",
      sequence,
      sessionId: session.sessionId,
      type: event.type,
      timestamp: event.timestamp,
      agentId: event.agentId,
      ephemeral: event.ephemeral === true,
      data: sanitizeEventData(event),
    };

    writeChain = writeChain.then(() =>
      writeLine(response, publicEvent),
    );
  };

  const unsubscribe = session.on(emit);

  request.on("close", () => {
    closed = true;

    // Product decision:
    // - cancel the run
    // - detach and keep running
    // - continue for a lease period
    //
    // Do not assume socket close must always cancel the agent.
  });

  try {
    await session.sendAndWait({
      prompt: "Review the current repository architecture.",
    });

    await writeChain;
  } catch (error: unknown) {
    if (!closed && !response.destroyed) {
      sequence += 1;
      await writeLine(response, {
        schemaVersion: "1.0",
        sequence,
        sessionId: session.sessionId,
        type: "harness.error",
        timestamp: new Date().toISOString(),
        ephemeral: false,
        data: {
          message:
            error instanceof Error
              ? error.message
              : "Unknown harness error",
        },
      });
    }
  } finally {
    unsubscribe();
    await writeChain;

    if (!response.destroyed) {
      response.end();
    }
  }
});

function sanitizeEventData(event: SessionEvent): unknown {
  switch (event.type) {
    case "assistant.reasoning":
    case "assistant.reasoning_delta":
      // Do not expose model reasoning by default.
      return { withheld: true };

    case "skill.invoked":
      // Avoid shipping full skill content to an untrusted browser.
      return {
        name: event.data.name,
        path: event.data.path,
        pluginName: event.data.pluginName,
        pluginVersion: event.data.pluginVersion,
      };

    case "tool.execution_complete":
      return {
        ...event.data,
        result: event.data.result
          ? {
              content: event.data.result.content,
              // detailedContent may contain large diffs, secrets, or files.
            }
          : undefined,
      };

    default:
      return event.data;
  }
}

server.listen(3000);
```

### 29.3 Why normalization matters

Do not blindly expose the complete SDK event object to every frontend.

Potentially sensitive fields include:

- reasoning content
- complete skill definitions
- shell commands
- file diffs
- tool arguments
- MCP output
- repository paths
- stack traces
- full detailed tool content
- request tracing identifiers

Create a public event schema intentionally.

---

## 30. Use case 3: Copilot SDK to browser via SSE

SSE is usually preferable when:

- the browser subscribes to a long-lived detached run
- reconnect and replay are required
- commands are separate POST requests
- the stream may outlive one request
- multiple browser tabs or observers watch one session

### 30.1 Recommended API

```text
POST   /api/copilot/sessions
POST   /api/copilot/sessions/:id/messages
POST   /api/copilot/sessions/:id/permissions/:requestId
POST   /api/copilot/sessions/:id/cancel
GET    /api/copilot/sessions/:id/events
DELETE /api/copilot/sessions/:id
```

### 30.2 SSE projection

```text
id: 205
event: tool.execution_start
data: {"sessionId":"...","type":"tool.execution_start","data":{...}}

id: 206
event: tool.execution_partial_result
data: {"sessionId":"...","type":"tool.execution_partial_result","data":{...}}

id: 207
event: tool.execution_complete
data: {"sessionId":"...","type":"tool.execution_complete","data":{...}}

```

Use the harness sequence for SSE `id`, not necessarily the Copilot event UUID.

### 30.3 Replay store interface

```ts
interface EventStore {
  append(event: PublicAgentEvent): Promise<void>;

  readAfter(
    sessionId: string,
    sequence: number,
    limit: number,
  ): AsyncIterable<PublicAgentEvent>;

  getLatestSequence(sessionId: string): Promise<number>;
}
```

### 30.4 Reconnection behavior

1. Browser reconnects with `Last-Event-ID`.
2. Server parses the last delivered harness sequence.
3. Server replays persisted events after that sequence.
4. Server switches to live subscription.
5. Client deduplicates by sequence.
6. Ephemeral events that were never persisted cannot be recovered.

This is why the harness may choose to persist selected ephemeral events even though Copilot itself does not.

---

## 31. Use case 4: repository research and implementation agents

A common custom harness needs separate read-only and write-capable roles.

### 31.1 Agent definitions

```ts
import {
  CopilotClient,
  approveAll,
} from "@github/copilot-sdk";

const client = new CopilotClient();

const session = await client.createSession({
  model: "auto",
  streaming: true,
  customAgents: [
    {
      name: "repository-researcher",
      displayName: "Repository Researcher",
      description:
        "Maps architecture, traces behavior, and gathers evidence without changing files.",
      prompt: [
        "You are a repository research specialist.",
        "Read before concluding.",
        "Cite concrete files and symbols.",
        "Do not modify files.",
        "Separate observed facts from inference.",
      ].join("\n"),
      tools: ["grep", "glob", "view"],
      infer: true,
    },
    {
      name: "implementation-engineer",
      displayName: "Implementation Engineer",
      description:
        "Implements focused changes after the repository has been researched.",
      prompt: [
        "You are a senior implementation engineer.",
        "Preserve existing architecture and behavior.",
        "Make additive, narrowly scoped changes.",
        "Run relevant verification.",
        "Never disable tests or linters to force success.",
      ].join("\n"),
      tools: ["view", "grep", "glob", "edit", "bash"],
      infer: true,
    },
    {
      name: "destructive-maintenance",
      displayName: "Destructive Maintenance",
      description:
        "Performs explicitly requested destructive repository cleanup.",
      prompt:
        "Perform only explicitly approved destructive maintenance.",
      tools: ["view", "edit", "bash"],
      infer: false,
    },
  ],
  onPermissionRequest: approveAll,
});
```

### 31.2 Why `infer: false` matters

Potentially destructive agents should not be selected merely because intent matching judged them relevant.

Examples:

- deleting unused files
- rewriting migrations
- force-pushing
- resetting branches
- removing dependencies
- bulk formatting
- modifying deployment infrastructure

Require explicit invocation or an external policy decision.

### 31.3 Event-driven UI

Route root-agent text to the main transcript:

```ts
session.on("assistant.message_delta", (event) => {
  if (event.agentId === undefined) {
    renderMainAssistantDelta(event.data.deltaContent);
  }
});
```

Route sub-agent events to activity panels:

```ts
session.on((event) => {
  if (event.agentId !== undefined) {
    renderSubagentTrace(event.agentId, event);
  }
});
```

This prevents duplicated or confusing output when sub-agent messages share the parent stream.

---

## 32. Use case 5: building an agent-tree visualizer

Sub-agent lifecycle events include `toolCallId`, while all sub-agent-originated events include envelope-level `agentId`.

A harness can maintain two related indexes:

```ts
interface AgentNode {
  agentId?: string;
  toolCallId: string;
  name: string;
  displayName: string;
  status:
    | "selected"
    | "running"
    | "completed"
    | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  childToolCallIds: string[];
}

interface AgentTreeState {
  byToolCallId: Map<string, AgentNode>;
  toolCallIdByAgentId: Map<string, string>;
}
```

### 32.1 Reducer

```ts
function reduceAgentTree(
  state: AgentTreeState,
  event: SessionEvent,
): AgentTreeState {
  switch (event.type) {
    case "subagent.started": {
      state.byToolCallId.set(event.data.toolCallId, {
        agentId: event.agentId,
        toolCallId: event.data.toolCallId,
        name: event.data.agentName,
        displayName: event.data.agentDisplayName,
        status: "running",
        startedAt: event.timestamp,
        childToolCallIds: [],
      });

      if (event.agentId !== undefined) {
        state.toolCallIdByAgentId.set(
          event.agentId,
          event.data.toolCallId,
        );
      }

      return state;
    }

    case "subagent.completed": {
      const node = state.byToolCallId.get(
        event.data.toolCallId,
      );

      if (node !== undefined) {
        node.status = "completed";
        node.completedAt = event.timestamp;
      }

      return state;
    }

    case "subagent.failed": {
      const node = state.byToolCallId.get(
        event.data.toolCallId,
      );

      if (node !== undefined) {
        node.status = "failed";
        node.error = event.data.error;
        node.completedAt = event.timestamp;
      }

      return state;
    }

    default:
      return state;
  }
}
```

### 32.2 Display rules

Show:

- agent name
- current status
- tool activity
- elapsed time
- permissions waiting
- failure reason
- final result summary

Do not automatically show:

- hidden reasoning
- secret-bearing tool arguments
- full environment variables
- entire file contents
- raw stack traces to nonadministrative users

---

## 33. Use case 6: custom tools with streaming lifecycle telemetry

The Copilot SDK can execute custom tools defined in the host application. Tool lifecycle events provide the observable boundary around those calls.

### 33.1 Typed custom tool

```ts
import {
  CopilotClient,
  defineTool,
} from "@github/copilot-sdk";
import { z } from "zod";

const inspectPackageManifest = defineTool(
  "inspect-package-manifest",
  {
    description:
      "Read and summarize selected package.json metadata without executing scripts.",
    parameters: z.object({
      path: z.string().min(1),
    }),
    handler: async ({ path }) => {
      const file = Bun.file(path);

      if (!(await file.exists())) {
        throw new Error(`Manifest does not exist: ${path}`);
      }

      const parsed: unknown = await file.json();

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("Manifest must contain a JSON object");
      }

      return {
        content: JSON.stringify({
          path,
          manifest: parsed,
        }),
      };
    },
  },
);

const client = new CopilotClient();

const session = await client.createSession({
  streaming: true,
  tools: [inspectPackageManifest],
  onPermissionRequest: async () => ({ kind: "approve-once" }),
});
```

### 33.2 Tool event correlation

Use `toolCallId` as the stable join key:

```text
assistant.message.toolRequests[].toolCallId
        │
        ├─ tool.execution_start.toolCallId
        ├─ tool.execution_partial_result.toolCallId
        ├─ tool.execution_progress.toolCallId
        └─ tool.execution_complete.toolCallId
```

Store a projection:

```ts
interface ToolExecutionProjection {
  toolCallId: string;
  toolName: string;
  arguments?: unknown;
  status: "running" | "complete" | "failed";
  partialOutput: string;
  progressMessages: string[];
  result?: unknown;
  error?: unknown;
  startedAt: string;
  completedAt?: string;
}
```

### 33.3 Full versus concise tool results

The tool-completion event may distinguish:

- `result.content`: concise content sent back to the model
- `result.detailedContent`: complete content suitable for display
- `result.contents`: structured content blocks

This distinction is valuable:

- keep model context small
- preserve full diffs for UI
- avoid forcing the model to consume huge outputs
- store structured artifacts separately

A harness should not assume the model saw every byte displayed to the user.

---

## 34. Use case 7: permission-gated enterprise agent

Permissions are not a cosmetic callback. They are part of the run lifecycle.

### 34.1 Policy categories

Classify actions:

```ts
type PermissionPolicy =
  | "allow"
  | "allow-once"
  | "ask-user"
  | "deny";
```

Possible rules:

| Action | Default |
|---|---|
| Read repository file | Allow |
| Search code | Allow |
| Run test command | Allow once |
| Write source file | Ask user |
| Modify CI workflow | Ask user |
| Access secret path | Deny |
| Network request to allowlisted host | Allow once |
| Arbitrary network request | Ask user |
| Delete file | Ask user |
| Force Git operation | Deny |

### 34.2 Permission broker

```ts
interface PendingPermission {
  sessionId: string;
  requestId: string;
  requestedAt: string;
  request: unknown;
  resolve: (decision: PermissionDecision) => void;
  reject: (error: Error) => void;
}

type PermissionDecision =
  | { kind: "approve-once" }
  | { kind: "deny" };

class PermissionBroker {
  readonly #pending = new Map<string, PendingPermission>();

  request(
    sessionId: string,
    requestId: string,
    request: unknown,
  ): Promise<PermissionDecision> {
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, {
        sessionId,
        requestId,
        requestedAt: new Date().toISOString(),
        request,
        resolve,
        reject,
      });
    });
  }

  respond(
    requestId: string,
    decision: PermissionDecision,
  ): void {
    const pending = this.#pending.get(requestId);

    if (pending === undefined) {
      throw new Error(
        `Unknown or expired permission request: ${requestId}`,
      );
    }

    this.#pending.delete(requestId);
    pending.resolve(decision);
  }
}
```

### 34.3 Production requirements

- expire unanswered requests
- deny on application restart unless safely recoverable
- authenticate the approving user
- authorize approval by repository and action
- display the exact command, paths, and diff
- log decision identity and timestamp
- avoid “approve all” in unattended production harnesses
- distinguish model-requested from user-requested tool calls

---

## 35. Use case 8: resumable long-running coding session

Copilot SDK session persistence can resume semantic session history, but ephemeral live events are not guaranteed to replay.

A production harness should maintain two persistence layers:

### 35.1 Copilot-owned session state

Used for:

- conversation state
- complete messages
- complete tool results
- session checkpoints
- context compaction
- runtime resume

### 35.2 Harness-owned event log

Used for:

- exact UI event history
- audit log
- cross-service replay
- analytics
- SSE reconnect
- application-specific state
- permission history
- client delivery acknowledgement

### 35.3 Resume procedure

```text
1. Load harness session metadata.
2. Resume Copilot session by its SDK session identity.
3. Rebuild UI from harness event projections.
4. Mark any previously running tool/sub-agent as interrupted unless
   Copilot resume proves otherwise.
5. Subscribe to SDK events before sending a new message.
6. Reconcile persisted Copilot events with the harness high-water mark.
7. Continue with a new harness sequence.
```

### 35.4 Do not infer success from disconnect

A process crash may leave:

- a tool still running
- cloud work still active
- a session checkpoint available
- a completed Copilot event not yet copied into the harness store
- an unresolved permission request
- a half-written local JSONL line

Recovery must reconcile state explicitly.

---

## 36. Use case 9: compaction-aware harness

Copilot emits:

```text
session.compaction_start
session.compaction_complete
```

Completion metadata may include:

- success
- error
- pre- and post-compaction tokens
- message counts
- removed messages
- removed tokens
- generated summary
- checkpoint number
- checkpoint path
- compaction token usage
- request ID

### 36.1 UI behavior

During compaction:

- show a nonblocking “compressing context” state
- do not declare the turn complete
- continue receiving other valid lifecycle events according to SDK behavior
- record token reduction
- warn on failure if future context quality may degrade

### 36.2 Audit behavior

The compaction summary may contain sensitive conversation information. Apply the same data classification as the original transcript.

### 36.3 Evaluation metrics

Track:

```text
compactions per session
tokens before / after
compression ratio
compaction latency
compaction failures
quality regression after compaction
repeated fact loss
tool-call repetition after compaction
```

---

## 37. Use case 10: cost and usage controller

Usage events can expose:

- model
- input tokens
- output tokens
- cache reads and writes
- duration
- cost multiplier
- API call ID
- provider request ID
- endpoint
- initiating source
- quota snapshots
- Copilot usage breakdown

Session events may also provide:

- context token limit
- current context tokens
- message count
- durable usage checkpoints
- session AI-credit limits
- premium-request totals
- shutdown aggregate metrics

### 37.1 Usage projection

```ts
interface SessionUsageProjection {
  byModel: Record<
    string,
    {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      durationMs: number;
    }
  >;
  currentContextTokens?: number;
  contextTokenLimit?: number;
  premiumRequests?: number;
  totalNanoAiu?: number;
}
```

### 37.2 Avoid double counting

Because some usage signals are ephemeral and others are durable checkpoints:

- use durable checkpoints for reconstructed totals
- use per-call ephemeral events for live dashboards
- reconcile rather than sum both blindly
- key per-call usage by `apiCallId` when available
- treat shutdown aggregates as a final consistency check

---

## 38. Use case 11: Microsoft Agent Framework integration

For .NET and Python, the Copilot SDK can act as a provider inside Microsoft Agent Framework.

This gives two event layers:

```text
Microsoft Agent Framework orchestration events
        │
        ▼
Copilot SDK agent/provider events
        │
        ▼
Copilot session events and tools
```

### 38.1 .NET example

```csharp
using GitHub.Copilot;
using Microsoft.Agents.AI;

await using var copilotClient = new CopilotClient();
await copilotClient.StartAsync();

AIAgent copilotAgent = copilotClient.AsAIAgent(
    new AIAgentOptions
    {
        Instructions =
            "You are a repository implementation specialist.",
        Streaming = true,
        Model = "auto",
    }
);

await foreach (
    var chunk in copilotAgent.RunStreamingAsync(
        "Inspect the repository and propose a minimal implementation plan."
    )
)
{
    Console.Write(chunk);
}
```

### 38.2 When to use MAF

Use it when you need:

- provider-neutral agent interfaces
- sequential workflows
- concurrent workflows
- explicit handoffs
- Copilot mixed with Azure OpenAI or other providers
- .NET-native orchestration
- A2A integration

Use the Copilot SDK directly when:

- Copilot-specific session events are central
- you need precise tool/sub-agent/permission telemetry
- you are writing TypeScript, Go, Java, or Rust
- a broader orchestration framework adds no real value

### 38.3 Event preservation

A provider abstraction may flatten rich Copilot events into text chunks.

When detailed observability matters, retain a direct Copilot session-event subscription alongside the framework abstraction, or create an adapter that maps all important events into your application's event bus.

---

## 39. Custom harness event taxonomy

Do not expose raw vendor events as the only public contract. Create a stable internal taxonomy.

### 39.1 Example normalized types

```text
harness.session.created
harness.session.resumed
harness.turn.started
harness.agent.intent
harness.agent.output.delta
harness.agent.output.completed
harness.tool.started
harness.tool.output.delta
harness.tool.progress
harness.tool.completed
harness.tool.failed
harness.permission.requested
harness.permission.resolved
harness.subagent.started
harness.subagent.completed
harness.subagent.failed
harness.context.compaction.started
harness.context.compaction.completed
harness.usage.updated
harness.turn.completed
harness.session.failed
harness.session.closed
```

### 39.2 Adapter

```ts
interface NormalizedHarnessEvent {
  schemaVersion: "1.0";
  id: string;
  sequence: number;
  sessionId: string;
  vendor: "github-copilot";
  vendorEventId: string;
  vendorParentId: string | null;
  agentId?: string;
  type: string;
  timestamp: string;
  ephemeral: boolean;
  payload: unknown;
}

function normalizeCopilotEvent(
  sessionId: string,
  sequence: number,
  event: SessionEvent,
): NormalizedHarnessEvent | null {
  const base = {
    schemaVersion: "1.0" as const,
    id: crypto.randomUUID(),
    sequence,
    sessionId,
    vendor: "github-copilot" as const,
    vendorEventId: event.id,
    vendorParentId: event.parentId,
    agentId: event.agentId,
    timestamp: event.timestamp,
    ephemeral: event.ephemeral === true,
  };

  switch (event.type) {
    case "assistant.turn_start":
      return {
        ...base,
        type: "harness.turn.started",
        payload: event.data,
      };

    case "assistant.message_delta":
      return {
        ...base,
        type: "harness.agent.output.delta",
        payload: {
          messageId: event.data.messageId,
          text: event.data.deltaContent,
        },
      };

    case "assistant.message":
      return {
        ...base,
        type: "harness.agent.output.completed",
        payload: event.data,
      };

    case "tool.execution_start":
      return {
        ...base,
        type: "harness.tool.started",
        payload: event.data,
      };

    case "tool.execution_complete":
      return {
        ...base,
        type: event.data.success
          ? "harness.tool.completed"
          : "harness.tool.failed",
        payload: event.data,
      };

    case "session.idle":
      return {
        ...base,
        type: "harness.turn.completed",
        payload: event.data,
      };

    case "session.error":
      return {
        ...base,
        type: "harness.session.failed",
        payload: event.data,
      };

    default:
      return null;
  }
}
```

### 39.3 Why normalize

- shields clients from preview API churn
- enables multi-provider harnesses
- centralizes redaction
- creates one replay format
- enables stable analytics
- permits schema versioning
- keeps vendor-specific fields available for diagnostics

Preserve the raw vendor event in secure storage when exact debugging is required, but do not make it the sole application contract.

---

## 40. Backpressure inside a Copilot SDK harness

The SDK callback API does not automatically mean your persistence or network consumers can keep up.

### 40.1 Dangerous pattern

```ts
session.on((event) => {
  void database.insert(event);
  void websocket.send(JSON.stringify(event));
  void analytics.publish(event);
});
```

This creates unbounded concurrent work.

### 40.2 Bounded async queue

```ts
class BoundedQueue<T> {
  readonly #items: T[] = [];
  readonly #waiters: Array<(item: T) => void> = [];

  constructor(readonly capacity: number) {}

  push(item: T): boolean {
    const waiter = this.#waiters.shift();

    if (waiter !== undefined) {
      waiter(item);
      return true;
    }

    if (this.#items.length >= this.capacity) {
      return false;
    }

    this.#items.push(item);
    return true;
  }

  async pop(): Promise<T> {
    const item = this.#items.shift();

    if (item !== undefined) {
      return item;
    }

    return new Promise<T>((resolve) => {
      this.#waiters.push(resolve);
    });
  }
}
```

### 40.3 Overflow policy

Classify events:

**Never drop**

- complete assistant messages
- tool completion/failure
- permission requests and resolutions
- session errors
- compaction completion
- shutdown
- durable usage checkpoints

**May coalesce**

- assistant text deltas
- tool partial output
- intent updates
- progress updates
- context-usage snapshots

**May sample**

- low-level streaming-byte progress
- repetitive telemetry

If the queue is full:

1. coalesce compatible ephemeral events
2. spill to disk
3. disconnect slow subscribers
4. shed noncritical telemetry
5. cancel the run only as a final explicit policy

---

## 41. Security boundaries specific to Copilot SDK harnesses

### 41.1 Tool scope

Explicit custom-agent tool lists are safer than `null` or omitted tool configuration, which may expose all session tools.

### 41.2 Main-agent versus sub-agent privilege

Use a narrow default agent and delegate privileged tools to explicit sub-agents.

This supports:

- clean orchestrator context
- least privilege
- auditable delegation
- stronger permission prompts
- reduced accidental tool selection

### 41.3 MCP servers

For each MCP server:

- authenticate separately
- scope environment variables
- limit filesystem access
- validate tool schemas
- cap result sizes
- classify output
- enforce timeout and cancellation
- log server and tool names
- distrust remote content

### 41.4 Skill content

Skills can be injected into agent context and may appear in `skill.invoked` events. Treat skill source as executable policy-like content.

- pin versions
- review changes
- restrict writable skill directories
- avoid exposing full content to clients
- record plugin provenance
- validate allowed tools

### 41.5 Reasoning events

Do not make reasoning events part of a normal user-facing or audit contract unless policy explicitly allows it. Prefer concise intent and action summaries.

### 41.6 Local runtime exposure

When wrapping a local Copilot session in HTTP:

- bind to loopback by default
- authenticate remote access
- validate host and origin
- prevent cross-site request forgery
- avoid exposing arbitrary repository paths
- isolate each user's working directory
- never share one mutable session across untrusted users

---

## 42. Testing a Copilot SDK harness

### 42.1 Unit tests

Test reducers with synthetic events:

```ts
describe("tool projection", () => {
  it("joins start and complete by toolCallId", () => {
    const state = createToolState();

    reduceToolEvent(state, {
      id: "evt-1",
      timestamp: "2026-07-26T00:00:00Z",
      parentId: null,
      type: "tool.execution_start",
      data: {
        toolCallId: "tool-1",
        toolName: "grep",
        arguments: { pattern: "CopilotClient" },
      },
    });

    reduceToolEvent(state, {
      id: "evt-2",
      timestamp: "2026-07-26T00:00:01Z",
      parentId: "evt-1",
      type: "tool.execution_complete",
      data: {
        toolCallId: "tool-1",
        success: true,
        result: { content: "3 matches" },
      },
    });

    expect(state.get("tool-1")?.status).toBe("complete");
  });
});
```

### 42.2 Contract tests

Record event fixtures from a known SDK version and verify:

- all event types parse
- unknown fields are preserved
- unknown event types do not crash consumers
- normalized schema remains compatible
- redaction rules remain effective

### 42.3 Integration tests

Test:

- simple response
- tool call
- tool failure
- permission approval
- permission denial
- sub-agent delegation
- sub-agent failure
- context compaction
- session resume
- client disconnect
- cancellation
- slow network consumer
- SDK/CLI process shutdown

### 42.4 Golden replay test

1. Capture a complete harness JSONL run.
2. Rebuild all UI projections from the file.
3. Compare final state against a saved golden snapshot.
4. Repeat after schema changes.
5. Verify older recordings still replay or migrate.

---

## 43. Performance evaluation for Copilot SDK harnesses

Measure at both boundaries:

### 43.1 SDK boundary

- time from `send()` to `assistant.turn_start`
- time to first `assistant.message_delta`
- time to first tool start
- tool duration
- sub-agent duration
- compaction duration
- time to `session.idle`
- callback event rate
- callback-to-persistence latency

### 43.2 Client boundary

- time from server receiving SDK event to client render
- event queue depth
- serialization time
- NDJSON/SSE write delay
- slow-subscriber memory
- reconnect replay duration
- dropped/coalesced ephemeral events

### 43.3 Replay correctness

For a captured run:

```text
live final UI state == replayed final UI state
```

This equality is more important than reproducing identical animation timing.

### 43.4 Suggested benchmark matrix

| Dimension | Values |
|---|---|
| Concurrent sessions | 1, 10, 50, 100 |
| Text delta rate | 10, 50, 200 events/s |
| Tool output | 1 KB, 100 KB, 10 MB |
| Sub-agents | 0, 1, 5, 20 |
| Client speed | unlimited, 1 MB/s, 100 KB/s |
| Persistence | none, JSONL, PostgreSQL, broker |
| Relay | direct, Nginx, CDN/API gateway |
| Resume gap | 10, 1,000, 100,000 events |

---

## 44. Recommended production design

For a durable custom Copilot SDK harness:

```text
                         ┌──────────────────────┐
                         │ Browser / CLI / IDE  │
                         └──────────┬───────────┘
                                    │
                         commands + approvals
                                    │
                         ┌──────────▼───────────┐
                         │ Harness API          │
                         │                      │
                         │ Auth / policy        │
                         │ Session registry     │
                         │ Event normalizer     │
                         │ Redaction            │
                         │ Backpressure         │
                         └───────┬───────┬──────┘
                                 │       │
                          SDK events     │ normalized events
                                 │       │
                    ┌────────────▼──┐    ▼
                    │ Copilot SDK   │  Durable event store
                    │ + CLI/runtime │    │
                    └───────┬───────┘    ├─ replay
                            │            ├─ audit
                 models/tools/MCP        ├─ analytics
                                         └─ SSE/NDJSON relay
```

### 44.1 Default recommendations

- Use one Copilot session per isolated user/workspace context.
- Subscribe before sending the first prompt.
- Enable `streaming: true` for interactive applications.
- Render only root-agent deltas in the primary chat.
- Route sub-agent events into an activity tree.
- Persist complete semantic events.
- Persist selected ephemeral events only when product requirements justify it.
- Normalize events before making them a public API.
- Add a harness monotonic sequence.
- Use SSE for detached browser subscriptions.
- Use NDJSON for one-request streaming or internal relays.
- Use explicit tool lists.
- Gate destructive permissions.
- Preserve `toolCallId`, `agentId`, event `id`, and `parentId`.
- Treat `session.idle` as turn completion.
- Handle `session.error` and abnormal shutdown distinctly.
- Reconcile usage events to prevent double counting.
- Pin SDK versions during public preview.

---

## 45. Copilot-specific decision matrix

| Harness requirement | Recommended Copilot SDK pattern |
|---|---|
| Interactive local CLI | Direct SDK callbacks + terminal renderer |
| Exact debugging transcript | Persist all SDK events to JSONL |
| Browser chat for one turn | POST + NDJSON response |
| Durable browser session | POST commands + SSE subscription |
| Repository specialist roles | `customAgents` with explicit tools |
| Main orchestrator only | Narrow `defaultAgent`; delegate privileged tools |
| Dangerous maintenance | Agent with `infer: false` |
| Live sub-agent visualization | `agentId` + `subagent.*` + `toolCallId` |
| Tool console streaming | `tool.execution_partial_result` |
| MCP progress UI | `tool.execution_progress` |
| Approval workflow | `permission.requested` + external broker |
| Session continuation | SDK resume + harness-owned event replay |
| Cost dashboard | live usage + durable usage checkpoints |
| .NET provider-neutral orchestration | Microsoft Agent Framework integration |
| Multi-provider public API | normalized harness event schema |

---

## 46. Failure modes to design against

### 46.1 Rendering every assistant delta

Symptom: duplicated text from root and sub-agents.

Correction: render main-chat deltas only when `agentId` is absent.

### 46.2 Declaring completion on final text

Symptom: UI enables new actions while tools or background work remain active.

Correction: use `session.idle` and inspect background-task metadata.

### 46.3 Depending on delta replay

Symptom: resumed sessions lose exact token-by-token transcript.

Correction: treat deltas as ephemeral or persist them in the harness.

### 46.4 Blindly proxying raw events

Symptom: reasoning, diffs, skill contents, paths, or secrets reach untrusted clients.

Correction: normalize and redact.

### 46.5 Unbounded callback fan-out

Symptom: memory growth during high token or tool-output rates.

Correction: bounded queues, event classification, coalescing, and backpressure.

### 46.6 One global “approve all”

Symptom: remote users can trigger arbitrary writes or commands.

Correction: action-aware policy and authenticated human approval.

### 46.7 Losing event lineage

Symptom: impossible reconstruction of tool, sub-agent, and message relationships.

Correction: preserve `id`, `parentId`, `agentId`, `messageId`, and `toolCallId`.

### 46.8 Treating preview schemas as permanent

Symptom: client breakage after SDK update.

Correction: pin versions, normalize events, tolerate unknown fields/types, and run contract fixtures.

---

## 47. Expanded sources for GitHub Copilot SDK harness design

### Official GitHub documentation

1. GitHub Docs, *Streaming session events*  
   https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/streaming-events

2. GitHub Docs, *Custom agents and sub-agent orchestration*  
   https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents

3. GitHub Docs, *Copilot SDK features*  
   https://docs.github.com/en/copilot/how-tos/copilot-sdk/features

4. GitHub Docs, *Microsoft Agent Framework integration*  
   https://docs.github.com/en/copilot/how-tos/copilot-sdk/integrations/microsoft-agent-framework

5. GitHub Docs, *Cloud sessions*  
   https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/cloud-sessions

### Official GitHub repository

6. GitHub Copilot SDK repository  
   https://github.com/github/copilot-sdk

7. Copilot SDK getting-started guide  
   https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md

8. Copilot SDK Microsoft Agent Framework integration guide  
   https://github.com/github/copilot-sdk/blob/main/docs/integrations/microsoft-agent-framework.md

### Source-use note

The code in Part II is original harness code designed around the official event model and documented SDK patterns. It intentionally adds production concerns—normalization, replay, redaction, bounded queues, event sourcing, permission brokerage, and client relays—that are outside the scope of basic SDK quick-start examples.

---

## 48. Final Copilot SDK mental model

The Copilot SDK is the agent runtime adapter; your harness is the operational control plane.

The SDK gives you:

- sessions
- typed lifecycle events
- streaming deltas
- complete messages
- tools
- MCP integration
- custom agents
- skills
- permissions
- usage
- compaction
- resume behavior

Your harness must still decide:

- what reaches the user
- what is persisted
- what is replayable
- what is redacted
- which tools are allowed
- who may approve actions
- how slow clients are handled
- how events are normalized
- how sessions survive process failure
- how billing and telemetry are reconciled
- what constitutes completion

The best design does not reduce the Copilot SDK to a stream of text. It preserves the complete agent lifecycle and then publishes purpose-specific projections:

```text
main transcript
tool console
sub-agent tree
permission queue
usage dashboard
audit log
replay stream
final semantic result
```

That is where JSONL remains valuable: not necessarily as the SDK's public callback format, but as a simple durable or relay representation for the rich typed event stream your harness receives.
