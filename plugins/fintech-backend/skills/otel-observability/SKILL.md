---
name: otel-observability
description: OpenTelemetry tracing, metrics, and log correlation across .NET services and Service Bus hops. Consult when adding instrumentation, diagnosing latency, wiring dashboards or alerts, or naming spans and metrics.
---

# OTel Observability

## .NET setup
`AddOpenTelemetry()` with ASP.NET Core, HttpClient, and SqlClient instrumentation, exporting OTLP to the on-prem collector (4317). Enrich activities with `bank.customer_ref` (opaque hash) — **never raw identifiers or PII in span attributes**; the same rules as `secure-logging` apply, and span attributes are frequently overlooked in redaction reviews.

## Messaging trace continuity
Publisher injects `traceparent` into `ServiceBusMessage.ApplicationProperties`. Consumer extracts it and starts a span **linked** to the producer span (an async hop is a link, not parent-child), with `messaging.system=azureservicebus`, `messaging.destination`, `messaging.operation=process`. Sagas carry `bank.saga_id` on every hop so one business transaction is one queryable trace.

## Metrics
RED per endpoint via instrumentation. Business metrics via the Meter API: `payments.submitted`, `payments.settled`, `payments.failed{reason}`, `servicebus.dlq.received`, `outbox.lag_seconds`, `saga.stuck`, `ledger.posting.duration`. Alert on **SLO burn rate**, not point thresholds — point thresholds page at 3am for noise and stay silent through slow degradation.

## Logs
Serilog → OTLP with `TraceId`/`SpanId` enrichment so logs and traces pivot. Diagnostic retention ~30 days; the audit store is separate with 7-year retention.

## Naming
Spans: `VERB /api/v1/resource` for HTTP, `<topic> process` for messaging. Business attributes prefixed `bank.*`.
