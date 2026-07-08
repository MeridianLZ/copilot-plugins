---
description: Scaffold a new .NET microservice — vertical slices, EF Core, outbox, Service Bus wiring, OTel, Helm chart, tests
argument-hint: <service-name> <bounded-context-description>
---

Scaffold the service described by: $ARGUMENTS

1. Run **microservice-architect** first to validate the boundary. If it overlaps an existing service's data ownership, STOP and report rather than creating a second owner of the same data.
2. Run **vertical-slice-architect** for the internal structure and the mediator decision (state the rationale — plain DI is the default).
3. Generate:
   - `src/<Name>.Api` — Minimal API host, versioned route group, named auth policies, ProblemDetails, idempotency middleware, `/healthz/live` + `/healthz/ready`
   - `src/<Name>.Domain` — infrastructure-free core: money value object, aggregate skeleton, invariants
   - `src/<Name>.Infrastructure` — DbContext with `IEntityTypeConfiguration` layout, outbox table + dispatcher, Service Bus publisher/consumer with inbox dedupe
   - `tests/` — unit, integration (Testcontainers), and the compliance suite per `dotnet-testing`
   - `deploy/chart` + `deploy/overlays/{dev,uat,prod}` meeting every `k8s-onprem-deploy` standard
   - `compose.dev.yml` with Alpine images for local run
   - `CLAUDE_NOTES.md` seeded with the scaffold decision log
4. Finish with **backend-code-reviewer** on the generated tree.
