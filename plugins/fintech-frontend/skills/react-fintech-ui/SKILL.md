---
name: react-fintech-ui
description: React 19 UI standards for banking interfaces — money rendering, masked sensitive data, form and wizard architecture, async transaction UX, tables. Consult for any component, form, dialog, table, or display of financial or personal data.
---

# React Fintech UI Standards

## Money
- `<Money value="125.50" currency="USD"/>` → `Intl.NumberFormat`. Negatives get a sign/icon and an `aria-label` spelling it out ("negative 125 dollars 50 cents").
- Never `parseFloat` an amount; never sum client-side except as a labeled estimate.
- Amount inputs: `type="text"` + `inputMode="decimal"`, canonicalized to a decimal string on blur.

## Sensitive display
- Masked by default (PAN/account last4). Reveal = explicit action, fetch on demand, auto re-mask at 30s, audited server-side, never persisted client-side.
- Don't add copy-to-clipboard on sensitive fields unprompted — that's a product/risk decision.

## Forms & wizards (react-hook-form + zod)
- Schema-first; server `ProblemDetails` errors mapped back to fields via `setError`.
- Money-movement wizards: generate the idempotency key at **wizard start**, show a full review step before submit, disable the submit control while in flight, and guard double-submit at both UI and API layers.
- Destructive/irreversible actions require explicit confirmation with the consequence stated in plain language and the amount restated.

## Async transaction UX
- Three-state minimum: submitted → pending → settled/failed. Never show "success" for an accepted-but-unsettled payment.
- `aria-live="polite"` announces state changes; failures use `role="alert"` and include a support reference id.
- Never rely on a toast alone to communicate a transaction outcome — it must be reflected in the page state.

## Tables & lists
Real `<table>` semantics, `<th scope>`, `aria-sort` on sortable headers, virtualization for ledgers (see `frontend-performance`), stable keys if reorderable (see `dnd-architecture`).

## Safety
No `dangerouslySetInnerHTML`. No user-controlled URLs into `href`/`window.open` without scheme validation. Error boundaries per route with a support-reference id.
