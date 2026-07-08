---
name: frontend-conventions
description: Baseline conventions for this React 19 banking frontend — stack, TypeScript rules, money handling, sensitive-data rules, file layout, tooling. Consult at the START of any frontend task in this repo, and whenever unsure which library, pattern, or file location is correct. Read this before writing any component, hook, test, or config.
---

# Frontend Conventions (authoritative)

## Stack — do not substitute
React 19 · TypeScript 5.x strict · Vite · **pnpm** (never npm/yarn) · Redux Toolkit 2.x + RTK Query · react-hook-form + zod · `@dnd-kit/react` (next-gen) · Vitest + Testing Library + MSW · Playwright · `tsup` for library packages.

## TypeScript
- `unknown` over `any`, always. `noImplicitAny` on; hunt implicit anys in callbacks and event handlers.
- No non-null `!` assertions on API data — narrow it.
- Zod schemas are the source of truth for API shapes; types are `z.infer`red, not hand-maintained in parallel.

## Money (highest-frequency bug source)
- Amounts are **strings** with an explicit ISO 4217 currency, end to end. Never `number`, never float math.
- Render only via `<Money value currency/>`; totals come from the server. Any client-side sum is display-only and labeled as an estimate.
- Amount inputs: `type="text"` + `inputMode="decimal"` with locale-aware parsing to a canonical string. `type="number"` is banned for money (scroll-wheel mutation, float coercion).

## Sensitive data
- Default masked: PAN last4 (`•••• 4242`), account last4. SSN never displayed after entry.
- Reveal = explicit user action → fetch on demand → auto re-mask after 30s → never written to Redux, localStorage, sessionStorage, or the URL.
- Card entry uses the processor's hosted-fields iframe. Raw PAN must never touch our JS.
- Session replay and analytics are disabled on payment and profile routes.

## Layout
```
src/features/<domain>/{components,hooks,api,model}/
src/shared/{ui,lib,config}/
```
Feature-sliced. No global `components/` junk drawer. Cross-feature sharing goes through `shared/`, and if two features need the same thing, duplicating once is better than a premature abstraction.

## Tooling
- `pnpm` scripts only; lockfile committed; `pnpm dlx` for one-offs.
- No `console.log` in committed code. Error reporter has a `beforeSend` scrubber.
- No browser storage for anything auth-related — the BFF owns the session cookie.

## Companion skills
DnD → `dnd-architecture` · data layer → `rtk-query-patterns` · UI/money/forms → `react-fintech-ui` · a11y → `a11y-standards` · perf → `frontend-performance` · tests → `frontend-testing` · auth → `bff-client-auth`.
