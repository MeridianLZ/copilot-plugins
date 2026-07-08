---
description: STRIDE threat model for a feature or service, focused on banking attack paths
argument-hint: <feature or service name>
---

Threat-model: $ARGUMENTS

1. Read the actual code and manifests to build the real data flow — entry points, trust boundaries, and data classes touched (CHD, NPI, financial-reporting data). Don't model the diagram; model the code.
2. STRIDE per boundary, prioritizing: account takeover (session and step-up gaps), transaction tampering (idempotency or authZ bypass), information disclosure (logging, masking, span attributes, exfil), repudiation (audit trail gaps), and elevation via inter-service trust assumptions.
3. Rank by exploitability × impact. Map each mitigation to an existing control (hook, policy, middleware) or a concrete code change with file pointers.
4. Save to `docs/threat-models/<name>-<date>.md` and report the top three actions.
