---
name: context-compaction-audit
description: Audit a session or agent system's context economics - accumulation vs compaction cost curves, compaction-threshold tuning (Copilot SDK infinite sessions 0.80/0.95), prompt-cache invalidation interaction, what should move to sleep-time/background compute. Use for "context too big", "compaction settings", "token cost audit", "cache misses after compaction". Do NOT use for choosing a memory store — that is memory-architecture-eval.
license: MIT
allowed-tools:
  - read
  - execute
argument-hint: "<session/system to audit> [--budget <tokens>]"
user-invocable: true
disable-model-invocation: false
---

# Context Compaction Audit

Produce numbers, not vibes:
1. Measure: context size per turn, growth curve (accumulation is quadratic in conversation length), compaction events and their trigger points, cache hit rates around them.
2. The known trap: **compaction invalidates prompt caches** — token savings partially refund at the infra layer. Quantify both layers before recommending thresholds.
3. Tune: background-compaction threshold (default 0.80) vs exhaustion block (0.95); what belongs in durable store + query-time retrieval instead of context at all (goal-directed search beats eager summarization — 2511.21726).
4. Offload: consolidation to sleep-time/background lanes (Copilot background compaction, MAF BackgroundAgentsProvider).

Output: cost table (before/after per proposal), recommended thresholds with the assumption each dies on, and which context should never have been in context.
