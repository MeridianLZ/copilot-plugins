# TASKS

## Done

- [x] Phase 1: initial Claude Code plugins (`fintech-frontend`, `fintech-backend`) — commit `f87c365`.
- [x] Extract `shared/guards/guard-core.sh` as the single portable enforcement implementation (3 dialects: claude/codex/plain).
- [x] `build/build.sh` — regenerates `targets/{codex,cursor,copilot}/` from canonical source; validates all JSON (`jq empty`) and all shell (`bash -n`).
- [x] Author root `CLAUDE.md` via `/init` (2026-07-19) — canonical/generated rule, build & validate commands, guard test recipes, hook architecture, target-fidelity summary, gotchas.
- [x] Smoke-test `guard-core.sh --dialect plain` against deny and allow cases — behaves as documented.
- [x] `bash -n build/build.sh` syntax check — passes.

## Open

- [ ] Review root `AGENTS.md` (untracked) — confirm it's the intended fan-out target/content and not stray/duplicate of `targets/copilot/AGENTS.md`.
- [ ] Decide fate of `plugins/fintech-backend/scripts/guard-core.sh` and `plugins/fintech-frontend/scripts/guard-core.sh` (untracked, unreferenced by any `hooks.json` or by `build.sh`) — likely leftovers from the fail-open → fail-closed migration described in the README. Either wire them in or delete them.
- [ ] Resolve the modified `README.md` — diff not yet inspected this session; confirm it matches the multi-agent-expansion section already read, and stage/commit intentionally.
- [ ] Run `bash build/build.sh` end-to-end (not yet run this session — it rewrites `targets/`, which is currently uncommitted/dirty; confirm safe before running).
- [ ] Commit the phase-2 multi-agent-expansion work once the above are resolved.
- [ ] Consider collapsing per-plugin write guards (`plugins/*/scripts/guard-*-write.sh`) into thin wrappers around `shared/guards/guard-core.sh` to remove the duplicated rule-set (see REMEMBER.md).

## Follow-ups / lower priority

- [ ] Keep `targets/*/AGENTS.md` and any Copilot `.agent.md` tool-tier assignments in sync if new `*auditor`/`*code-reviewer` agents are added (naming convention drives read-only vs. read/edit/shell tiering in `build.sh`).
