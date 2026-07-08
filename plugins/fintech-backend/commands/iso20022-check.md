---
description: Audit payment models and message handling for ISO 20022 conformance, including structured-address readiness for the Nov 2026 Swift deadline
argument-hint: [service or path, defaults to whole repo]
---

Scope: $ARGUMENTS (if empty, scan the whole backend)

Delegate to **iso20022-payments-expert**:
1. Inventory every party/counterparty address model — flag any single-column or free-text address as a **deadline blocker**, with the expand-contract migration path and the fact that free text cannot be reliably parsed into structured fields
2. Inventory MT-format dependencies (MT101 especially) with their MX migration target
3. Check message construction against XSD **and** the applicable network usage guideline (CBPR+/HVPS+) — schema-valid is not network-valid
4. Verify identifier handling: `MsgId`, `InstrId`, `EndToEndId` echo semantics, `UETR` propagation
5. Check for truncation-on-overflow anywhere in the mapping path — that must reject, not silently trim

Verify current deadline details against live Swift publications before reporting them as fact. Output a readiness table: item, current state, required state, effort, blocker yes/no.
