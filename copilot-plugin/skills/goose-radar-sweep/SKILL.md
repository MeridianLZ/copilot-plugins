---
name: goose-radar-sweep
description: Goose's radar sweep - fast, broad reconnaissance of a codebase, directory, or doc set; returns a ranked contact map (what exists, where, why it matters) with declared coverage, not file dumps. Use for "what's in this repo", "find everything touching X", unfamiliar-codebase orientation, pre-task scoping. Do NOT use for deep single-file analysis — sweep first, then dispatch a specialist.
license: MIT
allowed-tools:
  - read
  - search
  - web
argument-hint: "<area/topic to sweep> [--box <path>] [--depth shallow|standard]"
user-invocable: true
disable-model-invocation: false
---

# Goose: Radar Sweep

Method:
1. Define the box: paths, topics, time range. Written down before sweeping.
2. Sweep broad and shallow — filenames, outlines, greps; read excerpts, not whole files.
3. Rank contacts by task relevance; each contact = what, where (path:line), why it matters, confidence.
4. **Declare coverage**: swept zones AND unswept zones. Silence is never "clear" — an unswept zone is stated, not implied clean.
5. Call the blind-side contact: the one thing nobody asked about that will matter.

Output: contact map table + coverage declaration + recommended next dispatches. Recorded to the blackboard as an `artifact` event with `agent_name: goose`.
