---
name: csharp-api-design
description: Design or review a C#/.NET API surface — DDD boundaries, ASP.NET Core endpoint shape, versioning, nullability, money-type correctness, idempotency. Use for "design this API", "review this controller/service surface", or contract-first work. Do NOT use for infrastructure topology — that is azure-well-architected-review.
license: MIT
allowed-tools:
  - read
  - web
argument-hint: "<API area or spec to design/review> [--style minimal-api|controllers|grpc]"
user-invocable: true
disable-model-invocation: false
---

# C# API Design

Method: domain nouns → aggregate boundaries → endpoint table (verb, route, request/response DTO, status codes, idempotency key) → cross-cutting gates.

Non-negotiable gates: money = `decimal` or minor-unit `long`, never `float`/`double`; nullable reference types enabled and honest; every mutating endpoint idempotent or explicitly documented why not; pagination on every collection; versioning strategy stated (URL or header, pick one); errors as ProblemDetails; async end to end, no sync-over-async.

Output: endpoint table + DTO sketches (records) + one ADR for each contested choice. Read-only — designs, not edits.
