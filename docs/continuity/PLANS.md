# PLANS

## Goal

A Claude Code plugin marketplace (`fintech-frontend`, `fintech-backend`) for enterprise fintech/banking work, with compliance-enforcement hooks (PCI-DSS, SOX, SOC 2, GLBA-FFIEC), now expanding to target four coding agents (Claude Code, Codex, Cursor, Copilot CLI) from one canonical source.

## Phases

1. **Initial prototype** (done, commit `f87c365`, 2026-07-08) — the two Claude Code plugins: `.claude-plugin/`, `.mcp.json`, `.lsp.json`, `agents/`, `skills/`, `commands/`, `hooks/hooks.json`, `scripts/`, `output-styles/` for both `fintech-frontend` and `fintech-backend`.
2. **Multi-agent expansion** (in progress, uncommitted as of 2026-07-19) — `shared/guards/guard-core.sh` extracted as the single portable enforcement implementation; `build/build.sh` regenerates `targets/{codex,cursor,copilot}/` from canonical `plugins/` + `shared/guards/`; `AGENTS.md` and `CLAUDE.md` added at repo root.
3. **Not yet started** — resolving the orphaned `plugins/*/scripts/guard-core.sh` copies (see REMEMBER.md); deciding whether per-plugin write guards should be collapsed into calls to `shared/guards/guard-core.sh` instead of inlining duplicate checks.
4. **Agent observability — Copilot OTel hook bridge** (working, committed 2026-08-02, branch `feat/copilot-otel-bridge`, commit `a2af5c3`) — the ChatGPT research deliverable `docs/copilot-research/CHATGPT_github-copilot-cli-otel-hook-bridge/` (frozen, SHA256SUMS-checksummed) promoted to top-level `copilot-otel-bridge/` as the runnable implementation: dual-lane (Copilot native OTel + hook JSONL ledger) bridge on port 14329, OTel Collector via docker compose on host ports 27431/27432, user-scope hooks installed to `~/.copilot/hooks/copilot-otel-bridge.json` (all 14 events), plus a self-contained trace-viewer UI at `/ui` (session Sidebar + ChatConversation pane with span waterfall) backed by `/api/sessions` and a pure-data `trace-projector.ts`.

## Current facts (as of 2026-08-02, OTel scope)

- Branch `feat/copilot-otel-bridge` (from `main` @ `6506241`), one commit `a2af5c3` — 42 files, `copilot-otel-bridge/` only. Not pushed.
- Validation green: `pnpm check` = strict typecheck + 16/16 node:test + tsc build; synthetic smoke session verified end-to-end (13 hook events accepted, 16 spans received by the collector with `service.name=github-copilot-cli-hook-bridge`); UI browser-inspected.
- Residual acceptance test: a **real** `copilot` session against the installed user-scope hooks (smoke lane was synthetic).
- Bridge + collector were left running locally (stop: `docker compose down` in `copilot-otel-bridge/` + kill the node process on 14329).

## Current facts (as of 2026-07-19)

- Single commit on `main`: `f87c365` "Initial prototype" (2026-07-08).
- Everything else — `build/`, `shared/`, `targets/`, root `AGENTS.md`, root `CLAUDE.md`, `plugins/*/scripts/guard-core.sh`, and edits to `README.md` — is **uncommitted**.
- `CLAUDE.md` was authored this session via `/init`, documenting the canonical-vs-generated rule, build/validate commands, and guard testing.
- Root `AGENTS.md` is untracked and has not yet been read/reviewed this session — unclear if it's hand-authored or generated; `build.sh` fans out `targets/copilot/AGENTS.md` to the other targets but does not appear to write a root-level `AGENTS.md`.
- `shared/guards/guard-core.sh` is confirmed working: tested `--dialect plain` against a `kubectl delete` command (blocked, exit 1), a `double Amount` money type (blocked, exit 1), and `ls` (allowed, exit 0). `jq` 1.8.1 is present. `bash -n build/build.sh` passes.

## Non-goals

- No application/service code lives in this repo — it is plugin manifests, agent/skill/command Markdown, and enforcement shell scripts only.
- `targets/` is never hand-edited; it is a build artifact.
