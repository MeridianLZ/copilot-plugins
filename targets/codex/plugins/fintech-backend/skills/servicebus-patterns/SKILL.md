---
name: servicebus-patterns
description: Azure Service Bus implementation patterns — transactional outbox, inbox dedupe, sessions, DLQ, retries, emulator-based testing. Consult for any publish/consume code, topology definition, poison-message handling, or duplicate-processing bug.
---

# Azure Service Bus Patterns (raw SDK)

## Topology
- Topic per event category (`payments-events`, `cards-events`); one subscription per consuming service with a SQL filter on `Subject`.
- Queues for point-to-point commands (`statement-generation-requests`).
- `Subject` = `<entity>.<event>.v<n>` — e.g. `payment.settled.v2`.

## Outbox (producer)
```csharp
// same EF transaction as the state change
db.Outbox.Add(OutboxMessage.From(evt, messageId: $"{evt.PaymentId}:{evt.Version}"));
await db.SaveChangesAsync(ct);
```
A hosted `OutboxDispatcher` batch-reads unsent rows, sends, and marks them sent. Deterministic `MessageId` also lets broker-side duplicate detection (10m window) help.

## Inbox (consumer)
```csharp
if (await db.Inbox.AnyAsync(x => x.MessageId == msg.MessageId, ct))
{ await args.CompleteMessageAsync(msg, ct); return; }
// process + insert inbox row in ONE transaction, then Complete
```
Complete only after the transaction commits. Abandon on transient failure (delivery count handles retry); DeadLetter with an explicit reason on permanent failure (deserialization error, unknown schema version).

## Sessions
`SessionId` = aggregate id where ordering matters (per-account streams, card lifecycle). Use `ServiceBusSessionProcessor`; never mix sessionful and sessionless consumers on one subscription.

## Retry
Client: `ServiceBusRetryOptions { Mode = Exponential, MaxRetries = 5, MaxDelay = 30s }`. Beyond delivery count, schedule a copy with `ScheduledEnqueueTime` plus an attempt-count property — never a spin loop.

## DLQ
A dedicated `DlqMonitor` consumer per subscription: log the reason, emit `servicebus.dlq.received`, write to the ops review queue. Replays are explicit, audited CLI actions — never automatic.

## Testing
Testcontainers + the Service Bus emulator. Assert the full outbox → publish → inbox path, and that sending the same `MessageId` twice processes once.
