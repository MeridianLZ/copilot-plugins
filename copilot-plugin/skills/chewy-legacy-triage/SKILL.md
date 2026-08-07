---
name: chewy-legacy-triage
description: Chewy's legacy triage - stabilize crufty, undocumented, or half-broken legacy code just enough to be safe, with characterization tests before any touch and hard resistance to rewrites. Use for "this old module is failing", "nobody understands this code", inherited codebases, or pre-refactor safety nets. Do NOT use for greenfield code or dependency-resolution failures (chewy-dependency-surgery).
license: MIT
allowed-tools:
  - read
  - search
  - execute
argument-hint: "<legacy area to stabilize>"
user-invocable: true
disable-model-invocation: false
---

# Chewy: Legacy Triage

Rules of engagement:
1. **Characterize before touching**: pin current behavior with tests (including the weird behavior — it may be load-bearing).
2. Smallest stabilizing change; a rewrite is a different mission that someone must explicitly order.
3. Every "obviously dead" branch gets a reference check before deletion; legacy lies.
4. Leave it better mapped than you found it: notes on entry points, hidden couplings, and the traps, recorded as a blackboard `artifact`.

Verify by running the characterization tests before AND after. Report: what was stabilized, what remains duct tape (explicitly), and the no-fly list — changes that look safe but aren't.
