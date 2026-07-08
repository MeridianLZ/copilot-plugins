---
name: frontend-performance
description: React 19 performance reference — profiling method, React Compiler implications, virtualization, drag frame budget, selector memoization, bundle discipline, Core Web Vitals. Consult when UI feels slow, lists are large, bundle size grows, or interactions drop frames.
---

# Frontend Performance

## Method (do not skip)
Measure → classify → fix → re-measure. Capture a baseline from React DevTools Profiler (render cost/frequency), the Performance panel (long tasks, dropped frames), and bundle analysis. Report before/after numbers. Optimization without a measurement is a guess and gets reverted.

Classify first — render cost, render frequency, network waterfall, main-thread blocking, or layout thrash. Each has a different fix.

## React 19 specifics
- **React Compiler**: if enabled in the build, most manual `useMemo`/`useCallback` is dead weight and can obscure real problems. Check the toolchain before adding memoization; remove scaffolding the compiler makes redundant.
- `useTransition`/`startTransition` for filter and search updates over large ledgers so typing stays responsive.
- Suspense boundaries sized to meaningful chunks — one per data region, not one per component.

## Big lists
Virtualize transaction ledgers and long tables (TanStack Virtual). Keep row ids stable across windowing — unstable keys break both correctness and performance, and interact badly with sortable DnD.

## Drag frame budget
`pointermove` work stays off the React render path. Animate with transforms, not layout properties. No synchronous layout reads mid-drag (`offsetHeight`, `getBoundingClientRect` in a loop). Target 60fps; measure with the Performance panel during an actual drag.

## Selectors
Unmemoized parameterized selectors are the top re-render cause here. `createSelector`, instance-scoped via `useMemo` when parameterized.

## Bundle
Route-level code splitting; isolate heavy vendors (charts, PDF, date libs). Money formatting uses native `Intl` — never ship a formatting library for it. Audit new dependencies for size and tree-shakeability before adding.

## Network
RTK Query cache config beats hand-rolled dedupe. Hunt dependent-query waterfalls that could be parallelized or composed server-side in the BFF.
