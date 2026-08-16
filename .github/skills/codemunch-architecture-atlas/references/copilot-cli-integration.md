# GitHub Copilot CLI — Agent Skills Integration

Reference for shipping this skill to GitHub Copilot CLI. Current as of **2026-08-16**.

Sources (checked 2026-08-16):
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
- https://github.com/github/awesome-copilot/blob/main/docs/README.skills.md

## Skill unit

A skill is a **directory** containing a file named exactly `SKILL.md` (case-sensitive), plus
optional bundled resources. Directory name is the skill's identity: lowercase, hyphens for
spaces, no underscores/spaces/uppercase. The frontmatter `name` should match the directory name.

```
codemunch-architecture-atlas/
  SKILL.md          # required
  scripts/          # executable helpers (py/js/sh/ps1)
  references/       # docs, schemas, patterns (this file)
  assets/           # templates, config samples
  agents/           # optional bundled .agent.md definitions
```

## SKILL.md frontmatter

| Field | Req | Semantics |
|---|---|---|
| `name` | yes | Unique lowercase-hyphen identifier. Becomes the `/name` invocation token. |
| `description` | yes | What the skill does **and when Copilot should use it**. This is the sole relevance signal — see below. |
| `license` | no | Applicable license string for redistribution. |
| `allowed-tools` | no | Tools pre-approved for this skill; skips per-call confirmation. |

Anything else in frontmatter is ignored by Copilot CLI (Claude-specific keys like `model:`
are harmless but non-functional — strip them when porting).

## Discovery directories

Project scope (repo-local, committed):
- `.github/skills/<skill-name>/`
- `.claude/skills/<skill-name>/`
- `.agents/skills/<skill-name>/`

Personal scope (all projects, per user):
- `~/.copilot/skills/<skill-name>/`
- `~/.agents/skills/<skill-name>/`

`~/.agents/skills` and `.agents/skills` are shared with other agent runtimes — the same
directory serves Copilot CLI and Claude Code without duplication. Precedence between
scopes is **not documented**; do not rely on shadowing.

Session management: `/skills list`, `/skills info`, `/skills reload` inside a session;
`/skills` toggles individual skills on/off interactively. `copilot skill add` installs
before session start. `gh skills install <repo> <skill-name>` (gh CLI ≥ 2.90.0) pulls from
a registry repo such as `github/awesome-copilot`.

## Invocation and relevance

- **Explicit:** name the skill with a slash inside the prompt —
  `Use the /codemunch-architecture-atlas skill to map this repo.` Not a slash command;
  it is a token inside natural-language prompt text.
- **Implicit:** Copilot matches the user's prompt against each skill's `description` only.
  The body of SKILL.md is loaded on-demand *after* selection (progressive disclosure).
  Therefore the description must carry trigger vocabulary — verbs, artifact names, symptom
  phrasing — not a summary of the procedure.

## allowed-tools caution

`allowed-tools: shell` (or `bash`) pre-approves terminal execution with **no confirmation
prompt** for anything the skill runs. GitHub's docs: only pre-approve if you have reviewed
the skill and fully trust its source. Omit shell/bash to keep confirmation in the loop; the
skill still works, the user just approves each command. For a skill distributed to others,
default to omitting it.

## Supporting files

Files in the skill directory are auto-discovered and made available alongside the
instructions — no frontmatter manifest. Reference them from the SKILL.md body by relative
path (`references/copilot-cli-integration.md`, `scripts/atlas.py`). Keep the body short and
push detail into `references/` so it is read only when needed.

## MCP tools inside Copilot CLI sessions

Copilot CLI supports user-configured MCP servers; their tools appear as `mcp__<server>__*`
in-session. A skill **may** reference such tools (e.g. `mcp__codemunch__get_repo_outline`),
but availability is a property of the *user's* config, not the skill — skills cannot declare
or install MCP servers. Consequence: every MCP-dependent step needs a documented graceful
fallback (native `grep`/file reads, or a bundled script) and the SKILL.md should state the
prerequisite explicitly so the agent degrades instead of erroring.

## Skills vs. custom instructions vs. custom agents

| | Skills (`SKILL.md`) | Custom instructions (`AGENTS.md`, `*.instructions.md`) | Custom agents (`*.agent.md`) |
|---|---|---|---|
| Loading | On-demand, when description matches or `/name` given | Always in context | Invoked contextually or explicitly |
| Payload | Instructions **plus** bundled scripts/refs/assets | Text guidance only | Persona + tool allowlist + execution logic |
| Scope | One specialized repeatable workflow | Repo-wide conventions | Autonomous multi-step delegation |
| Best for | Procedures needing code/data/reference bundles | Coding standards, architecture rules | Sub-agent that runs a job end to end |

Rule of thumb: standing rules → instructions; a bundle of procedure + tooling → skill;
a delegate that should run independently with its own tool budget → agent. Skills and
agents compose — a skill may instruct the model to hand off to a bundled `.agent.md`.

## Porting checklist (Claude skill → Copilot CLI)

1. Keep `name`, `description`; drop `model:`, `tools:`, and other Claude-only keys.
2. Verify directory name == `name`, lowercase-hyphen.
3. Leave `allowed-tools` unset unless shell pre-approval is genuinely required.
4. Rewrite `description` for implicit-selection recall (triggers, not summary).
5. Ensure every `mcp__*` reference has a fallback path.
6. Place under `.agents/skills/` (shared) rather than duplicating into `.github/skills/`.
7. Verify with `/skills list` then `/skills info <name>` in a live session.
