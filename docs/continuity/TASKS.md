# TASKS

## Done — 2026-08-02 (Copilot OTel bridge)

- [x] Promote `docs/copilot-research/CHATGPT_github-copilot-cli-otel-hook-bridge/` → top-level `copilot-otel-bridge/` (frozen reference left intact, `SHA256SUMS` untouched).
- [x] Fix phantom `typescript@6.0.0` pin → `7.0.2` (6.0.0 stable never shipped; guide was assembled offline with stubs).
- [x] Fix `ATTR_HOST_NAME`/`ATTR_OS_TYPE` imports — incubating semconv attributes with no stable exports; inlined as string literals in `src/otel.ts`.
- [x] Remap collector host ports 14317/14318 → **27431/27432** via `.env` SSoT + compose interpolation (14318 and 24317/24318 already squatted locally; 14318 answers HTTP 401).
- [x] `pnpm check` green with real deps: strict typecheck, 16/16 tests, build.
- [x] Install user-scope hooks: `~/.copilot/hooks/copilot-otel-bridge.json` — all 14 events, command transport, hash content mode; egress verified silent/exit-0/atomic-spool (fail-open).
- [x] Add `src/trace-projector.ts` (pure-data span reconstruction mirroring SpanAssembler FIFO pairing) + `/api/sessions`, `/api/sessions/:id`, `/ui` routes + `ui/index.html` trace viewer (session Sidebar; ChatConversation pane rendering all 14 event types; span waterfall with heuristic/open/error states; live polling).
- [x] End-to-end verify: smoke session → JSONL ledger → spans at dockerized collector; `/flush` clean; UI inspected in browser.
- [x] Commit `a2af5c3` on `feat/copilot-otel-bridge`.

## Open — Copilot OTel bridge

- [ ] **Acceptance run**: real `copilot` session in a trusted repo with `scripts/copilot-otel-env.ps1` sourced — confirm native lane + hook lane both arrive, and the session renders in `/ui`.
- [ ] Decide whether to merge `feat/copilot-otel-bridge` → `main` and/or push.
- [ ] Production hardening items from the README checklist remain open (replace debug exporter, TLS/auth for non-loopback, retention policy, collector-side redaction).
- [ ] Optional: containerized `hook-bridge` service in compose still defaults its OTLP endpoint to the internal `otel-collector:4318` — verified fine; host-run bridge uses 27432. Revisit if the bridge itself moves into Docker permanently.

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
