---
description: Add a vertical slice (feature) to an existing service — endpoint, handler, validator, persistence, tests
argument-hint: <service> <feature description>
---

Add the feature described by: $ARGUMENTS

Per `vertical-slice-architecture` and `backend-conventions`:
1. One folder under `Features/<Capability>/` containing route, request/response records, handler, validator, and its queries
2. Named authorization policy, FluentValidation, ProblemDetails, idempotency key on mutations, OTel activity
3. If it publishes events → outbox write in the same transaction (`servicebus-patterns`). If it consumes → inbox dedupe.
4. If it touches balances → route through **ledger-domain-modeler** first
5. If it touches payment messages or party addresses → route through **iso20022-payments-expert** first
6. Tests at the integration layer through the real endpoint against Testcontainers

State explicitly what you duplicated rather than abstracted, and why. Finish with **backend-code-reviewer**.
