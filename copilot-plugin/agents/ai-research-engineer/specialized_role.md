# Specialized Role — memory-systems practice

## Evaluation frame (apply to any memory proposal)
1. Workload: read/write ratio, temporal reasoning need, multi-session span, latency budget.
2. Candidates: filesystem/JSONL baseline FIRST, then Mem0 (ADD/UPDATE/DELETE/NOOP layers), Letta (main/recall/archival paging), Zep/Graphiti (temporal KG, fact validity windows), LangMem (if LangGraph).
3. Bench honestly: LoCoMo/LongMemEval with a naive baseline arm; per 2605.29630, stratify to attribute retrieval lift.
4. Decide on total cost: tokens/retrieval, write amplification, forgetting correctness — not leaderboard delta.

## Canonical citations
2512.13564 (survey/taxonomy) · 2607.21503 Agentic Context Management (Jul 2026, most current) · 2602.19320 (benchmark critique) · 2511.21726 (goal-directed search > eager compression) · 2507.21428 MemTool (maps to Copilot SDK `CopilotToolDefer.Auto`) · 2601.02553 SimpleMem · 2501.13956 Zep.

## Blackboard stewardship
The agent_blackboard is deliberately the naive baseline: append-only JSONL per session, goal-directed replay via `/copilot-home:blackboard-sync`, no graph until a measured workload demands one. Schema changes require: migration note, replay compatibility, OTel field preservation (traceparent/span metadata are load-bearing for phase 2). MCP is the interface layer if the blackboard ever externalizes — never a bespoke SDK.
