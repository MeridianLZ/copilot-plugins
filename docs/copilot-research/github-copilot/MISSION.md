# Mission Statement — GitHub Copilot SOTA Research

*(Compiled 2026-07-25.)*

**Mission.** Establish a current, evidence-linked picture of GitHub Copilot's agentic
surface across three modalities — **Copilot CLI**, **Copilot in VS Code**, and **Copilot
coding agent** (autonomous background/PR agent) — so that (a) `braisenly-base` can be
dual-manifested for Copilot CLI installability, and (b) a Copilot-CLI equivalent of the
`claude-profiles` specialized-profile scheme (`-dotnet`, `-fe`) can be designed against
what Copilot actually supports, not assumption.

**Why now.** The repo already has a 2026-07-06 cross-CLI comparison
(`docs/reference/kitchen-sink-plugins-compare-contrast.md`) and a working
`plugins/kitchen-sink-copilot-cli/` scaffold. This research pass extends that baseline to
current (2026-07-25) SOTA and answers the specific open question the comparison doc does
not: **does Copilot CLI expose a config-home/profile-isolation mechanism, a default-agent
selector, and a custom-instructions file equivalent to Claude Code's `CLAUDE_CONFIG_DIR` /
`--agent` / `CLAUDE.md`?**

**Method.** Three parallel research streams (one per modality), each independently
sourcing from official docs/release notes (primary), Context7 (current library/CLI docs),
and GitHub code search (real-world usage conventions), each writing its own raw,
evidence-linked findings doc under `stream-N-<modality>/` — no synthesis, no pruning, full
raw dump with sources and dates checked. Synthesis and the long-form instructional manuals
happen afterward in `manuals/` and `synthesis/`, once all three streams have landed.

## Where the work lives

- **Raw research (per-modality, agent-authored):** `stream-1-copilot-cli/`,
  `stream-2-copilot-vscode/`, `stream-3-copilot-coding-agent/`
- **Long-form instruction manuals (synthesized):** [`manuals/`](manuals/)
- **Profile-scheme + plugin-compat findings (synthesized):** [`synthesis/`](synthesis/)
- **Corpus map & status:** [`00-index.md`](00-index.md)
