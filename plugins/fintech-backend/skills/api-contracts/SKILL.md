---
name: api-contracts
description: API versioning, OpenAPI governance, and consumer-contract discipline for REST endpoints and Service Bus message schemas. Consult when adding or changing any endpoint or event payload, reviewing for breaking changes, or wiring the BFF to downstream services.
---

# API & Message Contracts

## REST versioning
URL segment versioning (`/api/v1/...`). New major version only for breaking changes; run n and n-1 concurrently with `Deprecation` and `Sunset` headers.

**Breaking**: removing or renaming a field, tightening validation, changing a type or its semantics, adding a required request field, changing status codes for existing conditions.
**Additive**: new optional fields, new endpoints, new enum values — provided consumers are tolerant readers (the BFF's zod schemas must be, and downstream deserialization must ignore unknown members).

## OpenAPI is the artifact
Generated at build, committed to `contracts/openapi/<service>.v<n>.json`. CI diffs against main with oasdiff; a breaking diff without a version bump fails the build. DTOs are records with accurate nullability; money is `{"amount":"125.50","currency":"USD"}` — a string pattern, never a JSON number.

## Message contracts
Payload records live in the owning service; consumers **copy** the shape rather than referencing a shared package — a shared contracts NuGet couples service internals and defeats independent deployability. Version in `Subject`; additive-only within a version; breaking changes get a new subject version with dual-publish during the migration window. Snapshot tests pin the serialized JSON of every event version — a failing snapshot means you broke a contract.

## BFF aggregation
The BFF owns its own SPA-facing contract and composes downstream calls. Downstream changes never leak to the SPA without a deliberate BFF contract change — that's the whole point of the layer.
