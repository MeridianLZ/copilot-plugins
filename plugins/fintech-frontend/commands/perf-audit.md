---
description: Profile and diagnose a frontend performance problem with measured before/after evidence
argument-hint: <what feels slow — route, list, interaction, or "bundle">
---

Problem: $ARGUMENTS

Delegate to the **frontend-perf-engineer** agent. Require:
1. A captured baseline before any change (render counts/durations, long tasks, or bundle numbers)
2. Explicit classification: render cost / render frequency / network waterfall / main-thread blocking / layout thrash
3. React Compiler status checked before any memoization is added
4. The fix, then a re-measurement with the delta stated

Reject any proposed optimization that lacks a measurement.
