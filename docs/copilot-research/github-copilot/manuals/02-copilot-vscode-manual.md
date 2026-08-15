# Manual 2 — GitHub Copilot in VS Code

> Synthesized 2026-08-11 from `../stream-2-copilot-vscode/RAW-RESEARCH.md` (compiled
> 2026-07-25). Citations live in the raw stream.

## 1. Surface map

- **Chat modes:** Ask / Plan / Agent (Edit mode deprecated; restore via
  `chat.editMode.hidden`). "Local agents" (run in VS Code) vs "cloud agents" (run on
  GitHub's servers) is an orthogonal axis.
- **Custom agents** = the concept formerly called "custom chat modes" — renamed in
  VS Code 1.106 (`.chatmode.md` → `.agent.md`; old files still work with a migration
  quick-fix). GitHub-the-product made the same rename Oct 2025. Beware pre-rename content.
- Inline ghost-text completions remain a separate, stable feature.

## 2. Settings

No Copilot-specific settings file — standard VS Code layering: managed (enterprise) >
workspace `.vscode/settings.json` > user/profile `settings.json` > defaults. Namespace is
migrating `github.copilot.chat.*` → `chat.*`; both coexist.

Key knobs: `chat.agent.enabled`, `chat.agent.maxRequests` (iteration cap — silent stop
point, users routinely raise it), `chat.tools.terminal.autoApprove` (per-command/regex
map), `chat.tools.global.autoApprove` (YOLO — lockable via `ChatToolsAutoApprove`
policy), `chat.permissions.default` (`default`|`autoApprove`|`autopilot`),
`chat.instructionsFilesLocations`, `chat.agentFilesLocations`,
`chat.useNestedAgentsMdFiles`, `chat.disableAIFeatures` (kill switch).

**Enterprise managed settings** — three channels, per-key resolution, strict precedence:
native MDM (registry/`com.github.copilot`) > server-managed
(`copilot/managed-settings.json` in the org's `.github-private` repo — travels with the
GitHub account) > file-based (`/etc/github-copilot/managed-settings.json` etc.). One
schema governs both VS Code and Copilot CLI.

## 3. Profile isolation — the honest verdict

**Native Profiles do NOT fully isolate Copilot.** Profiles isolate settings, keybindings,
snippets, tasks, extensions, global state, **MCP config** (v1.102+), and BYOK/language-model
config. They do **not** isolate:

- Chat history — global per installation (maintainer-confirmed out of scope; not even
  shared Stable↔Insiders, and Settings Sync never syncs it).
- `.github/copilot-instructions.md` / `AGENTS.md` — repo files, follow the folder.
- User-level `.instructions.md`/`.agent.md` — stored in profile dirs but not
  switch-aware (open gap, `microsoft/vscode#290374`).

**For a true per-specialty runtime home** (the `CLAUDE_CONFIG_DIR`/`COPILOT_HOME`
analog): use `--user-data-dir` (+ `--extensions-dir`) — isolates settings, extensions,
credentials, and (inferred, medium confidence) chat history. Cost: extensions must be
reinstalled per dir. `code <folder> --profile "Name"` is the lower-friction/lower-completeness
option. Gotcha: Portable Mode's `data/` folder silently overrides both flags.
Per-workspace/per-profile GitHub *account* selection is separately supported (Accounts →
Manage Extension Account Preferences).

## 4. Custom instructions

Three tiers, all mergeable:

1. `.github/copilot-instructions.md` — unconditional, workspace-wide.
2. `.github/instructions/*.instructions.md` — frontmatter `applyTo:` glob (no glob = manual
   attach only); extra dirs via `chat.instructionsFilesLocations`.
3. `AGENTS.md` — the cross-tool convention; nested support behind
   `chat.useNestedAgentsMdFiles`.

Debugging "instructions ignored": the #1 causes are `applyTo` requiring the file to be
*attached to the request* (not merely open in a tab) and silent YAML parse failures.
Sentinel-string test + check the response's References section.

## 5. Custom agents (`.agent.md`)

Locations: workspace `.github/agents/`, Claude-compat `.claude/agents/`, user profile.
Frontmatter: `name`, `description`, `target` (`vscode`|`github-copilot` — same file
serves local chat or cloud agent; unknown attrs ignored per environment), `model`,
`tools`, `argument-hint`, `handoffs` (guided agent-to-agent transitions; pairs with
`/delegate`), `mcp-servers` (target github-copilot only). Invoked via the agent picker,
Command Palette, or referenced from `*.prompt.md` prompt files.

## 6. MCP

Dedicated **`mcp.json`** — NOT settings.json, and **top-level key is `servers`, not
`mcpServers`** (the #1 porting gotcha from Claude/Cursor-style configs).

- Workspace: `.vscode/mcp.json` (commit to share; teams commonly commit a `.template`
  variant to keep secrets out — use `inputs` + `${input:id}` prompted secrets instead).
- User: per-profile `mcp.json` via `MCP: Open User Configuration`; remote-scoped variant
  for SSH/WSL/containers.
- Fields: `type` (`stdio`|`http`|`sse`), `command`, `args`, `env`, `cwd`, `url`,
  `headers`, `envFile`, `dev`, `sandbox` (macOS/Linux).
- Governance: `chat.mcp.access` gates install *sources* (not per-call approval — that's
  `chat.tools.eligibleForAutoApproval`); gallery via `chat.mcp.gallery.enabled`;
  auto-start via `chat.mcp.autoStart`.

## 7. Skills

VS Code implements the open **Agent Skills spec** (same as Claude/Codex;
`anthropics/skills` compatible). Discovery paths are multi-vendor: project
`.github/skills/`, `.claude/skills/`, `.agents/skills/`; personal `~/.copilot/skills/`,
`~/.claude/skills/`, `~/.agents/skills/`. Frontmatter: `name` (must match dir),
`description` (capability + when-to-use), optional `allowed-tools`, `user-invocable`,
`disable-model-invocation`, etc. Progressive loading: description (~100 tokens) → body →
referenced resources. Rule of thumb from VS Code's own guidance: same capabilities every
step → Skill; context isolation or per-stage tool restrictions → Custom Agent.
Distribution: `gh skills install github/awesome-copilot <name>` (gh 2.90+).

## 8. Extensibility

- **GitHub-App "Copilot Extensions" platform is sunset (2025-11-10) — build MCP servers
  instead.** Any tutorial about Skillsets/Agent-extensions is dead-platform content.
- Live mechanism: VS Code extension API **Chat Participants**
  (`vscode.chat.createChatParticipant`, `@`-mention, Language Model API for generation).
- No unifying plugin manifest for the VS Code surface — customization is decomposed
  across instructions/agents/mcp.json/skills files. (An in-flight `vscode.chat.plugins`
  proposed API may surface Copilot CLI plugins in VS Code — unshipped as of 2026-07-25.)

## 9. BYOK and models

BYOK (Anthropic/Gemini/OpenAI/OpenRouter/Azure/Ollama/Foundry Local) — chat only, not
inline completions; billed by provider, not Copilot quota; works without GitHub sign-in
(then set `chat.utilityModel`/`chat.utilitySmallModel` or get nagged). Agent mode hides
models without tool-calling support. Org policy can disable BYOK.

## 10. Gotchas checklist

- `servers` vs `mcpServers` key on any MCP config port.
- Settings Sync never carries chat history; the only cross-device story is one-way
  `chat.sessionSync.enabled` push to github.com's Agents tab.
- `chat.agent.maxRequests` silently halts long agent loops.
- Extensions reinstall per `--user-data-dir` is the price of full isolation.
- Post-rename content bifurcation: `.chatmode.md` docs/posts describe the old world.
