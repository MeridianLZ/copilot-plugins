---
description: Scaffold a feature slice — RTK Query endpoints, zod schemas, components, tests — per the feature-sliced layout
argument-hint: <feature-name> <short-description>
---

Create the feature slice described by: $ARGUMENTS

Under `src/features/<feature>/`, following `frontend-conventions`, `rtk-query-patterns`, and `react-fintech-ui`:
1. `model/` — zod schemas + inferred types; money as string + currency
2. `api/` — endpoints injected into `baseApi` with correct tag invalidation; idempotency key on mutations; **no optimistic updates if money moves**
3. `components/` — container + presentational split, `<Money/>` for amounts, WCAG AA labels/focus/live regions
4. `hooks/` — feature hooks wrapping the generated RTK Query hooks
5. Tests — Vitest + Testing Library colocated, MSW handlers in `api/__mocks__/`

Then run the **frontend-code-reviewer** and **a11y-auditor** agents on the new slice and report both verdicts.
