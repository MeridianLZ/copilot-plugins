---
name: frontend-testing
description: Frontend testing reference — Vitest, Testing Library, MSW, Playwright, plus the hard cases: drag-and-drop, keyboard flows, RTK Query cache behavior, money formatting, optimistic revert. Consult when writing or reviewing frontend tests or diagnosing flake.
---

# Frontend Testing

## Layers
1. **Unit** — pure logic, formatters, zod schemas, reducers
2. **Integration** — component + RTK Query + MSW (the default layer; most value)
3. **E2E** — Playwright, golden money paths only, tagged `@critical`

## Rules
- Query by **role and accessible name**; the test doubles as an a11y assertion. `getByTestId` needs a justifying comment.
- MSW at the network boundary — never mock RTK Query hooks, or you stop testing cache and invalidation.
- `userEvent` over `fireEvent`. No bare `waitFor` timeouts; assert the expected state.
- Money: table-driven across locales, negatives, zero, and large values. Assert strings.

## Drag-and-drop (the commonly skipped part)
- **Keyboard is the primary automated path** — jsdom pointer-drag simulation is brittle. Drive the keyboard sensor: focus handle → activate → arrow → confirm. Assert resulting order **and** announcement text.
- Pointer drag belongs in Playwright against a real browser.
- Always cover: Escape cancels and restores original order; failed persist mutation reverts optimistic order and announces the revert.

## RTK Query behaviors worth testing
Cache invalidation after a mutation refetches the list; optimistic update rolls back on error; idempotency key is sent; polling/SSE subscription tears down on unmount.

## Flake policy
Flaky = broken. Quarantine with a linked issue and a one-sprint deadline, then fix or delete. Never re-run to green.
