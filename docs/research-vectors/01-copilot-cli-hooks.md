# Research Vector: Copilot CLI Hooks

**Collected:** 2026-08-01 to 2026-08-12  
**Confidence:** High for documented hook behavior; medium for release-specific
runtime details.

## Findings

- Current local hook inventory contains 14 events, including
  `userPromptTransformed`.
- Hook payloads arrive through stdin for command hooks and HTTP POST bodies for
  HTTP hooks.
- `preToolUse` is fail-closed on command-hook crashes/non-zero exits but
  fail-open on timeout. HTTP hook failures are fail-open.
- `postToolUse` can replace a result and inject context.
- `agentStop` and `subagentStop` can force continuation with loop protection.
- `notification` and `permissionRequest` are local CLI capabilities that do not
  map reliably to cloud-agent execution.
- Hook payloads do not provide the same stable tool-call identity as native
  GenAI spans; same-name concurrent tool matching needs FIFO heuristics.

## Implementation consequence

Hooks are governance and lifecycle evidence, not a substitute for native
conversation or GenAI telemetry. Observer hooks must write no decision-shaped
stdout, use bounded work, and preserve sanitized envelopes in an append-only
spool.

## Sources

- https://docs.github.com/en/copilot/reference/hooks-reference
- `docs/copilot-research/CHATGPT_github-copilot-cli-otel-hook-bridge/docs/hook-map.md`
- `docs/copilot-research/copilot-cli-hooks-otel-tutorial.md`
