---
description: Review ledger and balance code for double-entry invariants, immutability, and reconstruction guarantees
argument-hint: [path, defaults to ledger service]
---

Scope: $ARGUMENTS (if empty, locate the ledger service)

Delegate to **ledger-domain-modeler**. Verify and report on:
1. Append-only enforcement — any `UPDATE`/`DELETE` path on entries is a BLOCKER
2. Zero-sum per transaction per currency, enforced at the **database** level, not only in application code
3. Balances derived from the entry stream, with materialized balances carrying their entry sequence and reproducible by replay
4. `decimal` with explicit currency at correct per-currency precision; no float anywhere in the path
5. Posting date / value date / booking date modeled separately
6. Reversal and correction handling; period-close and backdating rules
7. FX movements posting through an explicit FX account with rate and timestamp recorded
8. Property-based test coverage of the invariants (not example-based only)
