# CURRENT TASK STATE

_Last updated: 2026-08-16 (scope: copilot-fe mermaid design-vault skill; supersedes 2026-08-07 "copilot-home plugin + persona MCP tools" state — that work merged to main `d94ec4c` and remains stable)_

## Where things stand

**Mermaid diagram-mastery skill for the copilot-fe profile is complete, verified, and committed.** The deliverable lives OUTSIDE this repo, in the `~/.agents` git repo (profile SSOT): `~/.agents/settings/global/copilot-profiles/fe/skills/mermaid/` — SKILL.md router + 8 reference files (core-syntax, advanced-techniques, color-systems, design-methodology, component-grammar, connector-grammar, compatibility-validation, pattern-library) + 3 scripts (mermaid-lint.sh, theme-scaffold.sh, validate-vault.sh) + evals/fixtures. Copilot sees it via symlink `~/.copilot-fe/skills → ~/.agents/.../fe/skills`.

Commits in `~/.agents`: `6ed5c69` (skill+wiring), `b138101` (TOCs), `addf0e7` (grammar/pattern refs, validator, evals), `bfea7df` (four vault themes), `a3ae84c` (derived theme mode, allowed-tools, 11.16.1 baseline, validator version-check fix). Working tree clean.

**Four canonical themes** (user spec, color-systems.md §6, all WCAG-checked, all render-validated via Mermaid Chart MCP): `light` (beige `#FAF6F0` + terracotta `#C2410C`), `dark` (slate `#0F172A/#1E293B` + neon cyan `#22D3EE`/lime `#A3E635`), `nord` (exact opencode hexes from `sst/opencode` `nord.json`, incl. non-Nord muted `#8B95A7`), `solarized-dark` (canonical ethanschoonover hexes). `theme-scaffold.sh --theme <name>` emits frontmatter; also has derived `--from-bg/--from-fg` two-color mode (linear hex mix, not contrast-guaranteed).

This repo (`fintech-marketplace`) is untouched this session: clean at `18d34c1`. `/Volumes/MACDEV` briefly unmounted 2026-08-16 (drive detached), remounted — `git fsck` clean.

## Incident (resolved, lessons in REMEMBER)

2026-08-15: a peer session built the same skill concurrently and converted `~/.copilot-fe/skills` from real dir to symlink mid-task; my consolidation `rm -rf $SSOT/mermaid` deleted the live skill through it. Recovered 100% via `git restore` in `~/.agents` (the peer session had committed). Theme work re-applied, everything re-verified.

## Immediate next step

None in flight — skill done. Optional follow-ups: mine the 6-agent research swarm's raw notes (scratchpad `tasks/{official-docs,components-connectors,color-theme,avant-garde,methodology,renderer-compat}.md` — session-scoped, may be gone) for more pattern-library material; repo-side open items from 2026-08-07 still stand (OTel trace of four-way conversation; guard-core duplication cleanup, PLANS phase 3).

## Key decisions (2026-08-15/16)

- Themes are single-mode by design (no `--dark` flag): pick by page background. Old `--palette` kept as back-compat alias for `--theme`.
- Neon discipline (dark theme): neon = strokes/edges/one highlighted path only; fills stay slate; dark text on any neon fill.
- validate-vault checks for any pinned `verified-against: mermaid@X.Y.Z`, not a hardcoded patch version (broke on 11.16.0→11.16.1 bump).
- Skill SSOT = `~/.agents` (git repo); profile dirs are symlinks. Always commit there after changes — it's the safety net.
