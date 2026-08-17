# CURRENT TASK STATE

_Last updated: 2026-08-17 (scope: codemunch-architecture-atlas skill + docs/architecture, and the ~/.agents branch consolidation; supersedes 2026-08-16 "copilot-fe mermaid design-vault skill" state — that work is committed in `~/.agents` and remains stable)_

## Where things stand

**Both repos are clean, pushed, and green.** Nothing in flight.

**This repo (`fintech-marketplace`), `main` = `ff582b9`, in sync with origin:**

- `.github/skills/codemunch-architecture-atlas/` — a gold-standard Agent Skill (Copilot-CLI-optimized, works in any Agent Skills host) that maps a repo with jCodemunch and emits a `docs/architecture/` breakdown. Layout: `SKILL.md` (3-pass workflow), `references/` (4 files), `agents/` (3 read-only `.agent.md` profiles), `scripts/` (3 bash, short+long flags, `Usage()`), `assets/templates/` (4 templates). SSOT copy lives at `~/.agents/skills/codemunch-architecture-atlas/` — the two are diff-identical.
- `docs/architecture/` — the skill's first full run against this repo: `README.md` index, `system-overview.mmd`, and 9 component pairs (`components/<name>.md` + `components/<name>-dataflow.mmd`) for plugin-marketplace, fintech-plugins, guard-enforcement, build-pipeline, target-ports, copilot-plugin, copilot-otel-bridge, copilot-mcp, agent-fannypack. Lynchpins carry exact `file:line` (e.g. `shared/guards/guard-core.sh:52` `emit_deny`, `build/build.sh:15` `strip_fm_keys`, `:72` jq gate, `:74` `bash -n` gate).
- Commits: `1eb818b` (skill + docs) → merged to main `fe1b038`; `ff582b9` (exec bits on generated target scripts — `build.sh` chmod +x's them, so the committed 100644 modes left the tree dirty after every build). Branch `feat/architecture-atlas` kept and pushed.
- Gates green: `validate-mermaid.sh` 10/10, `checklist.sh` 9/9, `bash build/build.sh` → `build: OK`, system overview render-validated `valid: true` via Mermaid Chart MCP.

**`~/.agents`, `development` = `20ea52bd`, in sync with origin:**

- `d6a3dac6` merged `feat/copilot-profiles-and-plugin` into development (8 conflicts, resolved).
- `20ea52bd` additively integrated the three divergent local lineages — 941 files present on `main`/`development`/`development-claude-integration` and absent upstream, incl. **133 skills**. Pure additions, zero overwrites.
- All 15 local branches now exist on origin (21 remote refs). 5 branches whose remotes had diverged were pushed under `local-snapshot/<name>-20260816` rather than force-pushed.

## Incident (resolved 2026-08-16, lessons in REMEMBER)

Branch switching in `~/.agents` rewrote the live plugin state behind the `~/.claude/plugins` symlink and uninstalled 5 plugins mid-session (claude-mermaid, vercel, all-ios-skills, apple-skills, apple-kit-skills); a later merge probe wrote conflict markers into the live global `CLAUDE.md`. All restored, all 16 plugins resolve, `CLAUDE.md` intact. Root cause fixed: per-machine plugin runtime state is now gitignored in `~/.agents`.

## Immediate next step

None in flight. Standing options: run the atlas skill against another repo (its real generalization test — it has only been exercised here); the 2026-08-07 repo items still stand (OTel trace of the four-way conversation; guard-core duplication cleanup, PLANS phase 3).

## Key decisions (2026-08-16/17)

- Payload-node convention is the atlas skill's defining invariant: every stage node in a data-flow diagram is immediately followed by a `<stage>_out` node (`class payload`) naming the concrete output — return type, JSON shape, file written, exit code. `checklist.sh` enforces it structurally; a doc without its dataflow twin fails.
- `validate-mermaid.sh` never installs tooling: uses `mmdc` only if already on PATH, else a structural lint (disk-constrained machine).
- `~/.agents` runtime plugin state is gitignored, not tracked — tracking it made every checkout mutate the running agent's own config.
- Diverged branches get `local-snapshot/*` refs instead of force-pushes; nothing is discarded to make a push succeed.
