---
name: ledger-modeling
description: Double-entry ledger design reference — entries, immutability, balance projections, event sourcing tradeoffs, multi-currency, value vs posting dates, reconciliation. MUST be consulted for anything touching balances, postings, transfers, reversals, fees, interest, or statements.
---

# Ledger Modeling

## Invariants — enforce, don't merely test
1. **Append-only.** Posted entries are never updated or deleted. Corrections are new linked reversal entries. `UPDATE ledger_entries` is a blocker.
2. **Zero-sum per transaction per currency.** Enforce with a database constraint (or a checked posting procedure), not just application code.
3. **Balances are projections.** The entry stream is the truth. Materialized balances record the entry sequence they were computed at and must be reproducible by replay.
4. **`decimal` only**, with explicit ISO 4217 currency on every amount, at currency-appropriate precision. No float, ever.
5. **No implicit FX.** Cross-currency movements post through an FX account with the rate and rate timestamp recorded as data.
6. **Reserve → commit** for availability: reservations are entries against an authorization account, released or committed explicitly. Nothing expires silently without an entry.

## Event sourcing, honestly
A double-entry ledger *is* an event log — the entries are the events and balances are the projection, which is why the pattern fits here naturally. Adopt it for the ledger specifically; don't spread it reflexively across every service. Be explicit about the costs: replay performance, projection rebuild strategy, schema evolution of historical events, and transaction boundaries.

Moving money between two accounts in the same service is one transaction containing both entries. Across services, it's a saga with compensating reversal entries — never a distributed transaction. See `saga-orchestration`.

If someone proposes storing only mutable balances, reject it and name the consequences: no audit reconstruction (SOX/GLBA retention), no dispute investigation, no regulatory reporting rebuild, no way to prove a historical balance.

## Model checklist
- Entry carries: transaction id, account id, direction, amount, currency, **posting date**, **value/effective date**, **booking date**, entry sequence, and correlation to the originating business event. Those three dates are genuinely different — conflating them produces interest and statement bugs that surface at period close.
- Deterministic transaction ids so a replayed business event cannot post twice
- Period close: entries after cutoff belong to the next period; never backdate across a closed period — post an explicit adjustment
- Reconciliation: every external movement (processor, correspondent, clearing) reconciles to entries, with a defined break-handling workflow
- Statement generation reads a projection at a sequence boundary, never a live-mutating balance

## Testing
Property-based: for any generated set of transactions, entries sum to zero per currency; balance projection equals replay from zero; a reversal restores the prior balance exactly. Example-based tests alone are insufficient for money.
