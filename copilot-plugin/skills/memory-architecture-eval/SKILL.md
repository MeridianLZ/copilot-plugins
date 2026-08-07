---
name: memory-architecture-eval
description: Evaluate or choose an agent memory architecture for a workload - filesystem/JSONL baseline vs Mem0 vs Letta vs Zep/Graphiti vs LangMem, with the mid-2026 contested-benchmark landscape applied honestly. Use for "which memory system", "do we need a memory graph", "evaluate this memory design". Do NOT use for session-level context budgeting — that is context-compaction-audit.
license: MIT
allowed-tools:
  - read
  - web
argument-hint: "<workload or memory design to evaluate>"
user-invocable: true
disable-model-invocation: false
---

# Memory Architecture Eval

Method:
1. Characterize the workload: read/write ratio, multi-session span, temporal-reasoning need, latency + token budget.
2. Score the **naive baseline first** (append-only files + goal-directed retrieval). Letta's filesystem run scored 74.0% on LOCOMO vs Mem0-graph 68.5% — a fancy store must beat that honestly.
3. Candidates only if the baseline measurably fails: Mem0 (ADD/UPDATE/DELETE/NOOP, scope promotion), Letta (main/recall/archival paging), Zep/Graphiti (temporal KG, fact validity windows — pick when temporal multi-session reasoning is the actual requirement), LangMem (only if already LangGraph).
4. Verdict on total cost: tokens/retrieval, write amplification, forgetting/conflict correctness, ops burden. Cite 2602.19320 when a vendor leaderboard is doing the arguing.

Output: recommendation + the benchmark protocol that would falsify it. This plugin's own blackboard is the worked example: deliberate naive baseline, MCP as the interface if it ever externalizes.
