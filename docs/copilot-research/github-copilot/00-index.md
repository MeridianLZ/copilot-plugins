# GitHub Copilot — Research Corpus

> SOTA discovery for GitHub Copilot's agentic surface, to inform (a) dual-manifesting
> `braisenly-base` for Copilot CLI and (b) designing `-dotnet`/`-fe` Copilot profiles
> analogous to `settings/global/claude-profiles/{ios,fe}/`.
> Compiled **2026-07-25**. Recency target: current as of compile date.

## Methodology

Three parallel research streams (one per modality), run as independent subagents, each
sourcing web search + Context7 + GitHub code search, each writing its own raw,
evidence-linked findings — no cross-stream synthesis at this stage.

| # | Stream | Modality | Status |
|---|--------|----------|--------|
| 1 | [`stream-1-copilot-cli/`](stream-1-copilot-cli/) | Copilot CLI (terminal agent) | complete (2026-07-25) |
| 2 | [`stream-2-copilot-vscode/`](stream-2-copilot-vscode/) | Copilot in VS Code | complete (2026-07-25) |
| 3 | [`stream-3-copilot-coding-agent/`](stream-3-copilot-coding-agent/) | Copilot coding agent (autonomous background/PR agent) | complete (2026-07-25) |

## Layout

```
docs/research/github-copilot/
├── 00-index.md                          ← this file
├── MISSION.md                           ← scope + method
├── stream-1-copilot-cli/RAW-RESEARCH.md         ← raw, agent-authored
├── stream-2-copilot-vscode/RAW-RESEARCH.md      ← raw, agent-authored
├── stream-3-copilot-coding-agent/RAW-RESEARCH.md ← raw, agent-authored
├── manuals/                              ← long-form instruction manuals (synthesized)
└── synthesis/                            ← profile-scheme + plugin-compat findings
```

## The one question every stream must answer

Does this modality expose a config-home/profile-isolation mechanism, a default-agent
selector, and a custom-instructions-file equivalent to Claude Code's `CLAUDE_CONFIG_DIR` /
`--agent` / `CLAUDE.md`? This gates the entire `-dotnet`/`-fe` profile-scheme design —
see `continuity/copilot-profiles/PLANS.md` scope decision 3.

## Status

- [ ] Stream 1 — Copilot CLI raw research
- [ ] Stream 2 — Copilot VS Code raw research
- [ ] Stream 3 — Copilot coding agent raw research
- [ ] Synthesis — profile-scheme feasibility + plugin-compat findings
- [ ] Manuals — long-form instructional writeups

## Related local artifacts (pre-existing, informed this corpus's scope)

- `docs/reference/kitchen-sink-plugins-compare-contrast.md` (2026-07-06 cross-CLI comparison; Copilot CLI section is this corpus's baseline to verify/extend)
- `plugins/kitchen-sink-copilot-cli/` (working dual-manifest scaffold)
- `platform/copilot/hooks/` (live `sessionStart` hook, confirms Copilot CLI's flat hook-output schema)
- `settings/global/claude-profiles/{ios,fe}/` + `skills/claude-profile/references/profile-runbook.md` (the scheme being duplicated)

## Evolution log

| Date | Change | Trigger |
|------|--------|---------|
| 2026-07-25 | Initial corpus scaffold; 3 research streams fanned out. | User request to duplicate claude-profiles scheme for GitHub Copilot |
