# fintech-frontend

React 19 + TypeScript plugin for regulated banking UI.

## Agents
| Agent | Model | Purpose |
|---|---|---|
| `react-dnd-architect` | opus | Drag & drop: library selection, `@dnd-kit/react` next-gen plugin API, persistence contracts, keyboard a11y |
| `react-frontend-expert` | sonnet | Components, hooks, React 19 idioms, forms |
| `redux-rtk-architect` | sonnet | RTK Query endpoints, tags, optimistic-update policy, SSE caches |
| `a11y-auditor` | sonnet | WCAG 2.1 AA audit (release gate) |
| `frontend-perf-engineer` | sonnet | Profiling, React Compiler, virtualization, drag frame budget |
| `frontend-test-engineer` | sonnet | Vitest/TL/MSW/Playwright, incl. keyboard-drag testing |
| `frontend-code-reviewer` | opus | Pre-PR gate review |

## Commands
`/new-slice` · `/add-dnd` · `/migrate-dnd` · `/a11y-audit` · `/perf-audit` · `/review-frontend`

## Skills
`frontend-conventions` · `dnd-architecture` · `rtk-query-patterns` · `react-fintech-ui` · `a11y-standards` · `frontend-performance` · `frontend-testing` · `bff-client-auth`

## Hooks
- **PreToolUse[Write|Edit]** — denies Luhn-valid PANs, SSN patterns, auth values in browser storage, `dangerouslySetInnerHTML`, `react-beautiful-dnd` imports, and `VITE_*SECRET` leaks
- **PostToolUse[Write|Edit]** — prettier on the touched file
- **SessionStart** — reports declared React and dnd-kit versions; warns if an unmaintained DnD library is installed

## Drag-and-drop stance

The plugin targets **`@dnd-kit/react` next-gen (v0.x)** — `DragDropProvider` with a plugin array, `useSortable({id, index})`, `Feedback`/`Accessibility` plugins, typed `DragDropEventMap` events. This is a different API from the `DndContext` + `SortableContext` + `arrayMove` pattern that dominates search results, which is v6.

That line is **pre-1.0 and moving**, so the agent and skill both instruct verifying the installed API surface (`node_modules/@dnd-kit/react`, or Context7 `/clauderic/dnd-kit`) before emitting code rather than trusting recalled syntax. `pragmatic-drag-and-drop` is the documented choice for OS file drops and cross-window drag.

One opinionated rule worth knowing before you hit it: the agent **refuses to make money movement a drag gesture** and will offer an explicit confirmed form instead.
