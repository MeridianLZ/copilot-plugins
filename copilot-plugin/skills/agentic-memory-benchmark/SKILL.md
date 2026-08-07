---
name: agentic-memory-benchmark
description: Design an honest benchmark for an agent memory system - naive-baseline control arm, LoCoMo/LongMemEval task categories, stratified retrieval-lift attribution, saturation checks. Use for "benchmark our memory", "is this memory claim real", "design a memory eval". Do NOT use to pick a store without measurement — that is memory-architecture-eval.
license: MIT
allowed-tools:
  - read
  - execute
  - web
argument-hint: "<memory system or claim to benchmark>"
user-invocable: true
disable-model-invocation: false
---

# Agentic Memory Benchmark

Protocol (non-negotiable controls):
1. **Naive baseline arm** — raw transcripts in plain files + goal-directed retrieval. If the candidate doesn't beat it, the candidate loses (this exact control exposed the Mem0-vs-filesystem result).
2. Task mix per LoCoMo categories: single-hop, multi-hop, open-domain, temporal — report per-category, never a single blended score.
3. Attribution: stratify per 2605.29630 so lift is traced to retrieval vs prompt vs model.
4. Saturation check per 2602.19320: if all arms cluster near ceiling, the benchmark is exhausted — say so instead of shipping a decimal-point win.
5. Report cost with accuracy: tokens/retrieval, latency, write amplification.

Output: benchmark design doc + runnable harness sketch + pre-registered success criteria (written before the first run).
