---
description: Add or refactor a drag-and-drop interaction — library selection, dnd-kit next-gen wiring, persistence contract, keyboard a11y, tests
argument-hint: <what should be draggable, e.g. "payee list rows" or "dashboard widgets">
---

Target interaction: $ARGUMENTS

Delegate to the **react-dnd-architect** agent. Require, in order:
1. **Library decision** with rationale (`@dnd-kit/react` next-gen vs `pragmatic-drag-and-drop`) — and confirm the installed version's API before writing code; do not emit remembered v6 API.
2. Refuse and flag if the request implies dragging to move money — offer an explicit confirmed form instead.
3. Provider + plugin composition (`Feedback`, `Accessibility` with real announcement text), sortable component, and the persistence mutation contract (resulting order or fractional rank, idempotency key, revert-on-failure).
4. Keyboard path verified end to end: activate, move, drop, Escape-cancel.
5. Tests per `frontend-testing`: keyboard path in Vitest, pointer path in Playwright, cancel and failed-persist revert.

Finish with the **a11y-auditor** agent on the result.
