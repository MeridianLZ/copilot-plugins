# CURRENT TASK STATE

_Last updated: 2026-08-06 (scope: copilot-otel-bridge hardening + conversation UI)_

## Where things stand

**copilot-otel-bridge level-up is implemented and verified locally, uncommitted.** Working tree under `copilot-otel-bridge/`:

| Area | Status |
|---|---|
| Dockerfile UI copy | Done — runtime stage `COPY ui ./ui` |
| Content-mode split-brain | Done — `generate-hooks` honors `--content-mode` / env + `--post-timeout-ms` |
| Smoke failure coverage | Done — `postToolUseFailure` + `errorOccurred` in both smoke scripts |
| Conversation projector | Done — `src/conversation-projector.ts` + tests |
| Bridge export APIs | Done — `GET /api/sessions/:id/conversation[.md]` |
| Conversation UI | Done — nested timeline, sidebar sort/filter, code-block toolbar, MD/JSON/PDF export |
| Validation | `pnpm check` **18/18** pass; live smoke `smoke-session-1785975144` = 15 events / 2 tools / 2 errors; `/ui` 200 |

Bridge process on **:14329** was restarted during verification and is healthy. Collector on 27431/27432 still assumed up from prior sessions.

**copilot-mcp workstream remains complete & pushed** on `feat/copilot-mcp` (`3fa0f1e..db436b2`). No change this session.

## Immediate next step

1. **Review + commit** the uncommitted `copilot-otel-bridge/` delta (prefer atomic commits: hardening, conversation projector/API, UI, docs).
2. Optional: real-`copilot` dual-lane acceptance (hook already proven; re-check native GenAI spans + `/ui` render after commit).
3. Merge/PR decisions still open for both `feat/copilot-otel-bridge` and `feat/copilot-mcp`.

## Key decisions this session (2026-08-06)

- Dual-lane architecture stays: native GenAI = execution authority; hooks = lifecycle/governance; links not invented parents.
- Conversation export is **server-authoritative** (`conversation-projector` + MD) with UI client fallback.
- UI remains a single static `ui/index.html` (zero npm UI build); code-block polish is vanilla CSS/JS.
- Smoke scripts remain HTTP fixtures against the bridge (not full command-hook egress path); failure/error events are now included.
