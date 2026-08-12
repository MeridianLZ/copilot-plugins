# Acme OTel Reference — Azure, .NET 9, vendor-neutral

Shared instrumentation library plus a self-hosted Collector. One codebase
serves two profiles: the regulated deployment and the agent-session-tracing
product. The difference is a single enum.

```
src/Telemetry.ServiceDefaults/
  TelemetryOptions.cs        capture modes, convention pinning, baggage allowlist
  TelemetryExtensions.cs     AddServiceTelemetry() — the one call you make
  SemanticConventions.cs     every attribute name, grouped by stability
  Instrumentation.cs         owned ActivitySource + Meter
  Messaging/                 Service Bus producer/consumer, span links
  GenAi/                     agent, chat, tool spans + the hosted-MCP seam
  Redaction/                 IContentRedactor + the enforcing span processor
  Durable/                   replay-safe orchestrator spans (non-DTS backends)
collector/
  otel-collector-config.yaml tail sampling, PII scrub, delta conversion
  compose.yml                Collector + Jaeger + Prometheus + Aspire dashboard
```

## Wiring a service

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceTelemetry(o =>
{
    o.ServiceName    = "payments-api";
    o.ServiceVersion = ThisAssembly.InformationalVersion;
    o.OtlpEndpoint   = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]!;
    o.Capture        = ContentCapture.None;   // regulated default
});

var app = builder.Build();
```

That is the whole integration. Everything below is about the decisions baked
into it.

## The two profiles

| | Regulated deployment | Session-tracing product |
|---|---|---|
| `Capture` | `None` | `Full` |
| Prompts / completions | length only | verbatim |
| Tool arguments | key names only | values |
| `db.query.text` | suppressed | present |
| Guard | — | `ACME_ACKNOWLEDGE_FULL_CONTENT_CAPTURE=true` required or startup throws |
| Backend | Collector → Jaeger (+ App Insights, phase 2) | Collector → scoped store |

`ContentCapture.Redacted` sits between them: content passes through
`IContentRedactor` first. Use it when you want debuggability without holding
raw text. Redaction is a backstop, not a guarantee — `None` is the only mode
where the text never enters the span.

Token counts, finish reasons, tool names and timings are **structural**, not
content. They are recorded at every level, including `None`, because they are
what the usage-metering work consumes.

## Why head sampling stays at 1.0

A head sampler decides before the trace exists. It cannot know the trace
errored or took nine seconds — the only two traces anyone ever asks for. All
sampling therefore happens in the Collector's `tail_sampling` processor, which
sees the whole trace. Policies, in order: every error, every trace over 1s,
every agent session, every unobserved tool call, every financial operation,
then 5% of the boring remainder.

`decision_wait: 30s` must exceed your p99 trace duration or you will decide on
incomplete traces.

## Why Service Bus uses links, not parent-child

A message can sit in a queue for hours, be delivered to a competing consumer,
be dead-lettered and replayed, or arrive in a batch of 200 from 200 different
producers. Parent-child implies the parent is still running and that there is
exactly one. Neither holds. `StartConsumerActivity` links; use
`StartConsumerActivityAsChild` only for synchronous request/reply where the
producer is genuinely blocked.

Context is written to **both** the W3C `traceparent` application property and
the legacy `Diagnostic-Id` the Azure SDK has historically used, because the
producer cannot know which style the consumer runs. Extraction tries W3C first,
falls back to `Diagnostic-Id`.

`acme.messaging.queue_residency_ms` is non-standard and deliberate — it is the
number you want when someone asks why a workflow took nine minutes.

## Durable Functions

**If you are on Durable Task Scheduler, delete `Durable/DurableTracing.cs`.**
DTS auto-instruments orchestrations, activities, sub-orchestrations and timers
and propagates context across all of them; you only need the
`Microsoft.DurableTask` ActivitySource registered, which
`TelemetryExtensions.OwnedSources` already does. Requires Durable Functions
extension ≥ 2.13.0 plus `Microsoft.DurableTask.{Worker,Client}.AzureManaged`.

On classic Storage / MSSQL / Netherite backends you get nothing automatically,
and naive instrumentation is actively wrong: orchestrators are event-sourced
and re-execute from the top on every activity completion, so an orchestration
with 12 activities emits 78 spans with garbage timings. `DurableTracing` guards
every span creation on `context.IsReplaying`.

Two related traps: never call `DateTime.UtcNow` in an orchestrator (use
`context.CurrentUtcDateTime` — the former is nondeterministic across replays
and corrupts the orchestration itself, not just telemetry), and do not hold a
span open across a durable timer that may fire in three days.

## Data stores

Database conventions are **stable** as of semconv 1.43.0 — `db.query.text`,
`db.query.summary`, `db.system.name`. Cosmos DB is still Development. Migrate
with `OTEL_SEMCONV_STABILITY_OPT_IN=database/dup` first, verify dashboards
against both, then switch to `database`.

You said no on `db.query.text`, and that is the right call for two independent
reasons: the spec warns that SQL commenter context injection degrades both
prepared and non-prepared statements on SQL Server, and query text is a PII
surface. `SetDbStatementForText` is therefore bound to capture mode and off in
the regulated profile.

For Cosmos, `azure.cosmosdb.client.operation.request_charge` is the RU metric —
it is the only one that maps to money.

## Known gaps

**Provider-hosted MCP tools are invisible.** When a tool is configured through
`FoundryChatClient.get_mcp_tool(...)`, `OpenAIChatClient.get_mcp_tool(...)` or a
Foundry hosted-agent toolbox, the `tools/call` message is issued by the
provider's runtime. Your process never sends it, so there is nothing to inject
`traceparent` into and no child span comes back. `RecordUnobservedTool` emits a
marker span with `acme.tool.unobserved=true` reconstructed from the model
response — its duration is *not* the tool's duration. Alert on the ratio of
unobserved to observed calls. The fix, when you need real numbers, is to
self-host the MCP server and reach it with `MCPStreamableHTTPTool` from your own
process, which restores injection.

**GenAI conventions are not stable and have no tagged release.** They moved out
of the main semantic-conventions repo at v1.42.0 (2026-06-12) into
`semantic-conventions-genai`, which evolves on `main`. Pin `GenAiCommit` to a
vendored commit and set `GenAiLabel`; every span carries the label so a
consumer can tell which revision produced it. Expect renames.

**Azure Monitor discards resource attributes.** Only cloud role and role
instance survive the exporter. If correlation depends on richer resource
attributes, keep the parallel OTLP leg — which the Collector config already
does.

**Functions in-process C# has no OTel support at all.** You are on .NET 9 and
likely still in-process. Confirm this before planning Functions tracing; the
answer today is migrate to isolated worker or stay on classic App Insights for
those apps. `"telemetryMode": "OpenTelemetry"` in `host.json` only helps the
isolated worker.

**Functions sampling and correlation traps.** Parent-based sampling is the
default, so HTTP/Service Bus/Event Hubs triggers generate no request telemetry
when the incoming message is unsampled. And `OperationId` comes directly from
the incoming `traceparent` — reuse the same `traceparent` across calls and they
all collapse into one operation.

**Baggage is attack surface.** It is parsed eagerly on every request; see the
Aspire 13.2.4 baggage DoS. `InboundBaggageAllowlist` defaults to empty (strip
everything inbound). Widen deliberately.

## Local loop

```bash
cd collector && docker compose -f compose.yml up -d
```

- Jaeger UI — http://localhost:16686
- Aspire Dashboard — http://localhost:18888 (renders GenAI spans better)
- Prometheus — http://localhost:9090
- Collector zpages — http://localhost:55679 (first stop when spans vanish)

OTLP is **4317/4318**. The Aspire dashboard's 18888 is the UI, not a receiver —
pointing an exporter at it is the most common "nothing appears" cause.

Watch `otelcol_processor_dropped_spans` and
`otelcol_exporter_send_failed_spans` in Prometheus. That is how you find out
you are losing data before someone else does.

## Testing note

The OTLP exporter retries silently with exponential backoff and batches into
memory when the backend is down; recovery does **not** flush instantly. In
integration tests, either shorten `ScheduledDelayMilliseconds` from its 5s
default or call `TracerProvider.ForceFlush()` before asserting.
