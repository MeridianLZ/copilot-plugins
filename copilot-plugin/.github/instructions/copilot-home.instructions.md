---
applyTo: "**"
excludeAgent: "code-review"
---

# copilot-home path-scoped instructions

- Blackboard files (`agent_blackboard/*.jsonl`) are append-only evidence: never rewrite, reorder, or "clean up" existing lines; corrections are new entries.
- When editing agent definitions, keep the four-file contract intact: `<name>.agent.md` + `system-prompt.md` + `specialized_role.md` + `mission.md` in the agent's directory, fused in that order.
- Skill and command names stay in lockstep: `skills/<name>/SKILL.md` ↔ `commands/<name>.toml`; renaming one without the other breaks the slash evoker.
- Trace metadata (traceparent/tracestate) in any schema here is phase-2 OTel surface — changes require the ai-research-engineer's schema-steward review.
