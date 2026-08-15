# Manual 3 — Copilot Cloud Agent (formerly "Copilot coding agent")

> Synthesized 2026-08-11 from `../stream-3-copilot-coding-agent/RAW-RESEARCH.md`
> (compiled 2026-07-25). Citations live in the raw stream.

## 1. Identity

Renamed **"Copilot cloud agent"** ~2026-04-01 (was "Copilot coding agent"). Legacy names
survive in URLs (`/coding-agent/`), bot identities (`copilot-swe-agent[bot]`, `Copilot`,
`copilot[bot]`), branch prefix `copilot/`, and API fields (`used_copilot_coding_agent`,
deprecated ~2026-08-01). Asynchronous agent running in an ephemeral GitHub
Actions-hosted container — distinct from IDE/CLI "agent mode" (local, synchronous).
Requires a paid Copilot plan; org/enterprise must enable it by policy. GitHub-hosted
repos only.

## 2. Triggers

1. Assign an issue to Copilot (UI, Mobile, CLI) — always creates a draft PR.
2. Prompt at `github.com/copilot/agents` — branch-first; since 2026-04 can research/plan/
   code without ever opening a PR.
3. Repo seeding from a prompt.
4. `@copilot` (also `@claude`, `@codex`) in PR review comments to iterate.
5. REST/GraphQL (`assignCopilotAgentToAssignable` + `GraphQL-Features:
   issues_copilot_assignment_api_support` header; needs "Copilot for PRs and Issues"
   enabled or fails opaquely).
6. `gh agent-task create|list|view [--log --follow]` (gh 2.80+). **Gotcha:** needs an
   interactive OAuth token — plain `GITHUB_TOKEN`/PAT in CI fails (open `cli/cli#11845`);
   workaround = drive via remote GitHub MCP server with a PAT.

Third-party agents (Claude, Codex) ride the same assignment/mention surfaces and consume
the same premium-request pool; model selection available since 2026-04-14.

## 3. Environment — `copilot-setup-steps.yml`

The **only** environment-customization surface (no Dockerfile/devcontainer analog).

- Path exactly `.github/workflows/copilot-setup-steps.yml`, on the **default branch**.
- Exactly one job, key literally `copilot-setup-steps` — misnamed = **silently ignored**.
- Honored job keys only: `steps`, `permissions`, `runs-on`, `services`, `snapshot`,
  `timeout-minutes` (max **59**). No checkout step → Copilot checks out for you.
- Convention: also give it `workflow_dispatch` + path-filtered `push`/`pull_request`
  triggers so the file self-validates as normal CI. Keep steps minimal (checkout + one
  language setup), don't replicate full CI.
- Session hard cap: **59 minutes**, cannot be extended. Break big tasks up.
- Default env: Ubuntu-based Actions container; firewall on by default.

## 4. Config surfaces (mostly Settings UI, not files)

- **Firewall:** Repo Settings → Copilot → Cloud agent. Recommended allowlist (package
  registries, container registries, CAs, Playwright hosts) + custom domain/URL rules;
  org can lock. **Scope trap:** firewall applies only to the agent's Bash-tool
  processes — NOT to MCP servers, NOT to setup steps (which have unrestricted network).
  Incompatible with self-hosted/Windows runners.
- **MCP:** Repo Settings → Copilot → MCP servers — a JSON blob in the UI (shared with
  Copilot code review), NOT a committed file. Defaults: GitHub MCP (read-only token) +
  Playwright MCP. Schema: `mcpServers` keyed by name; `type`
  (`local`|`stdio`|`http`|`sse`); **`tools` allowlist is required** — and MCP tools run
  autonomously with **no per-call approval**, so never `["*"]` for anything with write
  capability. Secrets must be "Agents secrets" prefixed `COPILOT_MCP_`. No OAuth remotes;
  tools only (no MCP resources/prompts). Runtime deps for servers go in
  `copilot-setup-steps.yml`. Porting from `.vscode/mcp.json` = manual transform (add
  `tools`, replace `inputs`/`envFile` with `env`).
- **Org/enterprise MCP governance:** registry URL + "Allow all"/"Registry only" policy.
  Enforcement is name-matching only and **bypassable by editing config** — GitHub's own
  advice for the strictest bar today: disable MCP entirely.

## 5. Instructions and agent profiles

- Reads all of: `.github/copilot-instructions.md`, `.github/instructions/**` (`applyTo`
  globs), `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`, org-level instructions. No personal
  (user-home) instructions — the container has no persistent user home.
- **Agent profiles** = `.agent.md`/`.md` in `.github/agents/` (repo), `/agents/` in the
  org's `.github`/`.github-private` repo (org), or a designated `.github-private`
  (enterprise); lowest level wins on filename clash. Frontmatter: `description`
  (required), `name`, `tools` (MCP tools as `server/tool`), `mcp-servers` (scoped to that
  agent), `target`, `disable-model-invocation`, `user-invocable`; `model` honored in
  IDE/CLI contexts only. Body ≤ 30,000 chars. Picked from the agent dropdown at
  assignment/prompt time; "Create an agent" scaffolds one in-browser.
- Code-review nuance: instructions/skills read from the **head branch**, so you can test
  instruction changes in the PR that carries them.

## 6. Review, cost, security

- Output PRs are always drafts needing human review. Copilot code review posts
  `COMMENT`-state reviews only — never counts toward required approvals, never blocks;
  gate-on-Copilot requires custom automation (watch the review event, not the check-run —
  the check-run completes 1–2s before comments post).
- **Cost = two budgets at once:** GitHub Actions minutes + one premium request per
  session (model + token volume also draw AI credits). Either budget exhausted → agent
  won't run.
- **Prompt injection is a live, partially-exploited attack surface.** GitHub filters
  hidden HTML comments and ignores events from non-write users by default, but published
  research (Trail of Bits 2025-08; "Comment and Control" 2026-04) demonstrated bypasses
  including invisible-markdown payloads and token exfiltration. Treat filtering as
  partial mitigation: human-review every agent PR, and scrutinize diffs touching
  lockfiles, CI config, or `copilot-setup-steps.yml` itself.

## 7. Don't confuse with `gh-aw`

GitHub Agentic Workflows (`gh-aw`, tech preview 2026-02) is a separate product: compiles
markdown workflows to Actions YAML, defaults to Copilot **CLI** as engine, has its own
firewall (AWF) and its own 20-min default job timeout. It can *hand off to* the cloud
agent (`assign-to-agent` / `create-agent-session` safe outputs) but is not the cloud
agent. Don't conflate its timeouts/sandbox with the 59-minute session cap.
