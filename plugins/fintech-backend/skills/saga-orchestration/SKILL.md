---
name: saga-orchestration
description: Distributed transaction patterns — orchestrated sagas, compensation, timeouts, state machines for multi-service money workflows. Consult when a business flow spans services (payment capture + ledger post + notification, card issuance, account opening) or when anyone proposes a distributed transaction.
---

# Saga Orchestration

## Rule zero
No 2PC, no distributed transactions. Cross-service consistency is a saga with compensations.

## Orchestrated (default for money movement)
The saga owner persists an explicit state machine:
```csharp
public enum TransferSagaState {
    Started, DebitReserved, CreditPosted, DebitCommitted, Completed,
    Compensating_ReleaseDebit, Failed
}
```
- Each step: send command → await reply event (correlation id = saga id) → transition + persist in one transaction, with a `rowversion` on the state row.
- Every step has a **timeout** (scheduled Service Bus message to self), a retry budget, and a **compensation**.
- Compensations are business operations — release a reservation, post a reversal entry — never deletes. The ledger is append-only (see `ledger-modeling`).
- Money uses **reserve → commit**: reserve funds, post credit, commit debit. A crash in between leaves a reservation the timeout releases.

## Choreography (only for)
Fan-out side effects with no consistency requirement: notifications, analytics, statement triggers. The moment you need "wait for X before Y", convert to orchestration.

## Idempotency & recovery
Saga handlers are inbox-deduped consumers. Transitions are idempotent via a transition table — replaying `CreditPosted` while in `Completed` is a no-op plus a warning metric, not an exception. On startup, a sweeper re-schedules timeouts for in-flight sagas past their step SLA.

## Observability
One OTel trace per saga (saga id on every hop); emit `saga.transition` with from/to; alert when in-flight age exceeds p99 × 3.

## Testing
Exhaustive transition-table tests: every state × every event, including illegal combinations. Integration: kill the orchestrator mid-saga in Testcontainers and assert recovery and compensation.
