---
name: secure-logging
description: Redaction-safe structured logging for regulated data — Serilog destructuring policies, request-logging allowlists, audit vs diagnostic separation. Consult whenever adding log statements, configuring logging, building request middleware, or adding exception handlers.
---

# Secure Logging

## Never log
PAN, CVV, SSN, full account or routing numbers, passwords, tokens (session/JWT/refresh), OTP codes, security answers, full date of birth, or raw request bodies on payment and PII routes.

## Structured logging
- Serilog with `Destructure.With<PiiDestructuringPolicy>()`: the shared policy masks properties named like `Pan|CardNumber|Ssn|AccountNumber|Password|Token` and any string matching PAN/SSN patterns. New sensitive DTOs carry `[LogMasked]`/`[NeverLog]` attributes the policy honors, and the compliance test suite fails the build when one is missing.
- Log **identifiers, not payloads**: `PaymentId`, opaque `CustomerRef`, amounts (an amount alone is not NPI), tokenized card references.
- Request-logging middleware uses an allowlist; payment and PII routes log method, route, status, and duration only.
- Exceptions: `LogError(ex, "template")`. Never interpolate an entity's `.ToString()` — records happily dump every property including the ones you just masked.
- No `Console.WriteLine` in application code.

## Audit vs diagnostic — do not conflate
Business audit events (who did what to which account) go through `IAuditWriter` to the **immutable audit store**, retained 7 years for GLBA/SOX. Diagnostic logs go to the observability stack with ~30-day retention. Writing an audit event to Serilog and calling it evidence will fail an audit.
