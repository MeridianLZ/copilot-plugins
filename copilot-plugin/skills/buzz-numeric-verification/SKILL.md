---
name: buzz-numeric-verification
description: Buzz's independent numeric verification - re-derive computations, budgets, capacity plans, financial math, and limits by a second method and compare to the claimed value with explicit tolerances. Use for "check this math", token/cost budgets, capacity estimates, interest/fee calculations, SLA arithmetic. Do NOT use for code-behavior verification — run the code; this skill verifies the numbers.
license: MIT
allowed-tools:
  - read
  - execute
argument-hint: "<computation or claim to verify>"
user-invocable: true
disable-model-invocation: false
---

# Buzz: Numeric Verification

Method — two independent paths or it isn't verified:
1. Restate the claim with its units and assumptions (unstated assumptions get stated for the record).
2. Derive independently by a *different* method than the original (different formula, simulation, or `execute` a quick script — not a re-read).
3. Compare: match within tolerance → VERIFIED (state the tolerance); mismatch → show both derivations and name the diverging assumption.
4. One method only possible → PLAUSIBLE, never VERIFIED — say so.

Money math: decimal/minor-units, banker's rounding stated, day-count conventions explicit. Verdict + derivations recorded to the blackboard as a `decision` event with `agent_name: buzz`.
