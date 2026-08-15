# GitHub Copilot CLI — Raw Research (Stream 1 of 3)

**Compiled 2026-07-25.** All dates below reflect information as it stood on **2026-07-25** — GitHub ships Copilot CLI on a near-daily cadence (see §1), so treat this as a snapshot, not a permanent reference.

## Research method summary

- **Primary source**: `docs.github.com/en/copilot/...` reference and how-to pages, fetched live via web search (several full pages retrieved and read in full: `cli-config-dir-reference`, `cli-command-reference`, `hooks-reference`).
- **Primary source (repo)**: `github/copilot-cli` GitHub repository — `README.md` and `changelog.md` (2,862-line changelog fetched and grepped for entries from 2026-06 through 2026-07-24).
- **Primary source (spec)**: `vercel-labs/open-plugin-spec` — the vendor-neutral "Open Plugin Specification v1.0.0" that Copilot CLI adopted mid-July 2026.
- **Community secondary sources**: dev.to (pwd9000), kenmuse.com, htek.dev — used only to corroborate/illustrate primary-source claims, never as sole evidence.
- **GitHub code search** (`user-github` MCP `search_code`): confirmed 128 real public repositories containing `.plugin/plugin.json` (the new Open-Plugin-Spec canonical path), spot-checked 5.
- **Local baseline read first**: `/Users/derp/.agents/docs/reference/kitchen-sink-plugins-compare-contrast.md` (dated 2026-07-06) and `/Users/derp/.agents/plugins/kitchen-sink-copilot-cli/` scaffold (plugin.json, hooks/hooks.json, hooks/hooks.claude.json, .mcp.json, lsp.json, .github/plugin/{plugin.json,marketplace.json}, .claude-plugin/plugin.json) — used as the "what changed" diff baseline.
- Context7 was **not** used — no Copilot-CLI-specific Context7 library ID was found to exist as a productive alternative to the very thorough official `docs.github.com` and `github/docs` repo sources already retrieved; all findings below are sourced from primary docs, the CLI's own changelog, and the CLI's own GitHub repo, which was judged sufficient and higher-confidence than a generic library-doc index for this fast-moving CLI-specific product.
- Total external search calls used: 7 WebSearch + 1 GitHub code search = 8, within the 6–10 budget.

---

## 1. Product identity & install

**Confidence: high. Checked: 2026-07-25.**

- **Official name**: "**GitHub Copilot CLI**" (npm package `@github/copilot`; binary/command name `copilot`). No rename found — unlike "Copilot coding agent" → "Copilot cloud agent" (Stream 3 finding), the CLI's name has been stable. [Install docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli) confirm current name as of 2026-07-25.
- **Install methods** (four, all documented on the same page):
  1. **npm** (all platforms): `npm install -g @github/copilot` — requires Node.js 22+. If `~/.npmrc` has `ignore-scripts=true`, must run `npm_config_ignore_scripts=false npm install -g @github/copilot`. Prerelease channel: `npm install -g @github/copilot@prerelease`.
  2. **Install script** (macOS/Linux): `curl -fsSL https://gh.io/copilot-install | bash` (or `wget -qO-`). Supports `sudo bash` (installs to `/usr/local/bin`), `PREFIX=` env var (default `/usr/local` as root, `$HOME/.local` otherwise), and `VERSION=` to pin a specific version.
  3. **Homebrew** (macOS/Linux): `brew install copilot-cli`.
  4. **WinGet** (Windows).
  5. Direct binary download from [`github/copilot-cli` releases](https://github.com/github/copilot-cli/releases/).
  - [github/copilot-cli/README.md](https://github.com/github/copilot-cli/blob/main/README.md), [docs.github.com install page](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli).
- **Version/release cadence**: extremely fast — the changelog shows releases on 2026-07-24, -23, -20 (×2), -16, -09, -07, -01, -06-30 (×2), -06-24, -06-23, -06-15, -06-13, -06-09, -06-05, -06-01, -05-29, -05-28, -05-24 — i.e. **roughly every 2-4 days**, sometimes same-day. Current version at time of check: **1.0.75** (2026-07-24). [github/copilot-cli/changelog.md](https://github.com/github/copilot-cli/blob/HEAD/changelog.md).
- **Where release notes live**: the `changelog.md` file at the root of the `github/copilot-cli` repo (canonical), mirrored into the CLI itself via the `/changelog` (aka `/release-notes`) slash command, which supports `summarize`, a specific version, `last N`, or `since VERSION`. Also mirrored to [GitHub Releases](https://github.com/github/copilot-cli/releases/).
- **Auth flow**: default is **OAuth device-code / web-based browser flow** via `copilot login` (accepts `--host HOST`, default `https://github.com`, for GitHub Enterprise Cloud data-residency hosts). Token is stored in the **system credential store**; if none is found, falls back to a plaintext file under `~/.copilot/` (or `$COPILOT_HOME`) — gated by the `storeTokenPlaintext` setting (default `false`). Headless/automation auth uses an environment-variable token, checked in this **precedence order**: `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN`. Supported token types: fine-grained PATs (v2) with "Copilot Requests" permission, Copilot CLI app OAuth tokens, `gh` CLI OAuth tokens. **Classic PATs (`ghp_`) are explicitly not supported.** [cli-command-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).

---

## 2. Config/settings locations

**Confidence: high. Checked: 2026-07-25.**

Copilot CLI stores everything — config, session history, logs, customizations — in **one directory**, default `~/.copilot` (`$HOME/.copilot`), overridable wholesale via `COPILOT_HOME` (see §3). Full directory contents, per [cli-config-dir-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference):

| Path | Type | Description |
|---|---|---|
| `agents/` | dir | Personal custom agent definitions (`.agent.md`) |
| `config.json` | file | Auto-managed state: auth, installed-plugin metadata, `loggedInUsers`, `firstLaunchAt`, `staff` |
| `copilot-instructions.md` | file | Personal custom instructions (all sessions) |
| `extensions/` | dir | Personal JS SDK extensions |
| `hooks/` | dir | User-level hook JSON scripts |
| `ide/` | dir | IDE integration lock/state files |
| `installed-plugins/` | dir | `installed-plugins/{marketplace-name}/{plugin-name}/`, or `installed-plugins/_direct/` |
| `instructions/` | dir | Additional `*.instructions.md` |
| `logs/` | dir | `process-{timestamp}-{pid}.log` per session; `logs/extensions/` for extension logs |
| `lsp-config.json` | file | User-level LSP server defs |
| `mcp-config.json` | file | User-level MCP server defs |
| `mcp-oauth-config/` | dir | MCP OAuth token/PKCE fallback storage |
| `mcp-secrets/` | dir | MCP secret placeholder fallback storage |
| `permissions-config.json` | file | Saved tool/directory approvals, keyed per project path |
| `plugin-data/` | dir | Persistent per-plugin data |
| `session-state/` | dir | Session history (`events.jsonl` + workspace artifacts) per session ID |
| `command-history-state/` | dir | Ctrl+R reverse-search history |
| `session-store.db` | file | SQLite cross-session index (rebuild via `/chronicle reindex`) |
| `settings.json` | file | User settings (JSONC — supports comments) |
| `skills/` | dir | Personal `SKILL.md` skills |

**Note (migration):** user-editable settings used to live in `config.json`; they auto-migrate to `settings.json` on startup; `config.json` retains only app-state fields going forward.

**Config precedence (documented explicitly)**, later overrides earlier:
1. Built-in defaults
2. MDM managed settings (device policy)
3. User settings — `~/.copilot/settings.json`
4. Repository settings — `.github/copilot/settings.json` (committed, shared)
5. Local settings — `.github/copilot/settings.local.json` (gitignored, personal)
6. Environment variables
7. Command-line flags

**Cross-tool file it also reads**: `.github/copilot/settings.json`/`.local.json` scope aside, the CLI **also reads `.claude/settings.json` and `.claude/settings.local.json`** in the repo for a *shared cross-tool subset* of keys: `companyAnnouncements`, `disableAllHooks`, `enabledPlugins`, `extraKnownMarketplaces`, `hooks`. This is a direct, explicit interop shim with Claude Code, not a rumor.

**Only these keys are honored at repo level** (anything else silently ignored): `companyAnnouncements`, `contextTier`, `deniedUrls` (union-only), `disableAllHooks`, `disabledMcpServers` (union-only), `disabledSkills` (union-only), `effortLevel`, `enabledPlugins` (merged), `extraKnownMarketplaces` (merged), `hooks` (merged), `includeCoAuthoredBy`, `mergeStrategy`, `model`, `respectGitignore` (tighten-only).

**Environment variables** (full table from [cli-command-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) + [cli-programmatic-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference)):

| Variable | Purpose |
|---|---|
| `COPILOT_ALLOW_ALL` | `true` = full auto-permissions (`--allow-all` equivalent) |
| `COPILOT_AUTO_UPDATE` | `false` disables auto-update |
| `COPILOT_CACHE_HOME` | Override cache dir (marketplace caches, auto-update packages) — separate from `COPILOT_HOME`, follows platform conventions |
| `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` | Comma-separated extra instruction dirs |
| `COPILOT_EDITOR` | Editor for interactive edit (after `$VISUAL`/`$EDITOR`; default `vi`) |
| `COPILOT_ENABLE_HTTP2` | `1`/`true` opts into HTTP/2 transport |
| `COPILOT_GH_HOST` | GitHub host override for Copilot CLI only (independent of `GH_HOST`) |
| `COPILOT_GITHUB_TOKEN` | Auth token, **highest** precedence |
| **`COPILOT_HOME`** | **Override the entire config/state directory. Default `$HOME/.copilot`. See §3.** |
| `COPILOT_LARGE_OUTPUT_THRESHOLD_BYTES` | Max tool-output bytes returned to model (default 20480) |
| `COPILOT_MODEL` | Set AI model |
| `COPILOT_PROMPT_FRAME` | `1`/`0` toggle decorative input-prompt frame |
| `COPILOT_SKILLS_DIRS` | Comma-separated extra skill dirs |
| `COPILOT_STRIP_REASONING_ON_RESUME` | `0`/`false` keeps BYOK reasoning tokens on resume |
| `COPILOT_SUBAGENT_MAX_CONCURRENT` | Default 32, range 1–256 |
| `COPILOT_SUBAGENT_MAX_DEPTH` | Default 4, range 1–128 |
| `COPILOT_TASK_WAIT_TIMEOUT_SECONDS` | Max wait for background agents/shells in `-p [--autopilot]` mode (default 600, `0` = don't wait) |
| `GH_HOST` | Shared GitHub host for `gh` + Copilot CLI |
| `GH_TOKEN` | Auth token, 2nd precedence |
| `GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS` | `true` = load project extensions in `-p` mode (off by default, security) |
| `GITHUB_COPILOT_PROMPT_MODE_REPO_HOOKS` | `true` = load repo hooks in `-p` mode |
| `GITHUB_COPILOT_PROMPT_MODE_WORKSPACE_MCP` | `true` = load workspace MCP sources in `-p` mode |
| `GITHUB_TOKEN` | Auth token, 3rd precedence |
| `PLAIN_DIFF` | `true` disables rich diff rendering |
| `USE_BUILTIN_RIPGREP` | `false` uses system ripgrep |

**Repository-level models allowlist**: `.github/allowed_models.txt` — plaintext glob list + one required `fallback:` directive, re-evaluated on `/cd`.

Sources: [cli-config-dir-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference), [cli-command-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference), [cli-programmatic-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference).

---

## 3. Profile/multi-home isolation — THE KEY QUESTION

**Confidence: high. Checked: 2026-07-25.**

**Yes — Copilot CLI has a direct, first-class, documented equivalent of Claude Code's `CLAUDE_CONFIG_DIR`: the `COPILOT_HOME` environment variable.**

- `COPILOT_HOME` **fully replaces** the entire `~/.copilot` path — config, settings, session history, installed plugins, saved permissions, MCP/LSP config, hooks, skills, agents, extensions, logs, everything in the table in §2. Set it and the CLI behaves as if `$COPILOT_HOME` were `~/.copilot`.

  ```bash
  export COPILOT_HOME=/path/to/my/copilot-config
  ```

- This is **exactly** the isolation mechanism the research asked about: multiple concurrent profiles on one machine = run the CLI with different `COPILOT_HOME` values (e.g. per-terminal-session env var, or wrapper scripts/aliases like `copilot-work`/`copilot-personal` each exporting a different `COPILOT_HOME`). Each profile gets **fully separate** auth token storage, settings, session history, installed plugins, and permissions.
- There is also a **legacy, deprecated** `--config-dir=DIRECTORY` CLI flag that does the same thing for a single invocation, but the docs explicitly say: *"The `--config-dir` option is a legacy option. Prefer `COPILOT_HOME`."* Precedence when both could apply (documented for `permissions-config.json` resolution, generalizes to the whole directory): `--config-dir` (1) > `COPILOT_HOME` (2) > default `~/.copilot` (3) — **only the first applicable one is used, they do not stack/merge.**
- **Caveat**: changing `COPILOT_HOME` does **not** migrate existing data — old config/history stays in the old location; you must copy/move manually if you want continuity in a new profile dir.
- **Separate, not-fully-isolated piece**: the **cache directory** (marketplace caches, auto-update packages, ephemeral data) does **not** follow `COPILOT_HOME` — it always follows platform convention (`~/Library/Caches/copilot` macOS, `$XDG_CACHE_HOME/copilot` or `~/.cache/copilot` Linux, `%LOCALAPPDATA%/copilot` Windows) **unless** you separately set `COPILOT_CACHE_HOME`. So a fully airtight multi-profile setup needs **both** `COPILOT_HOME` and `COPILOT_CACHE_HOME` set per profile if you want zero cross-profile bleed (e.g. marketplace-plugin caching bleeding between "profiles" otherwise).
- Additional supporting env vars for granular isolation without a full `COPILOT_HOME` swap: `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` and `COPILOT_SKILLS_DIRS` (comma-separated extra dirs, additive not exclusive — these *add* search locations, they don't isolate).
- **This directly parallels Stream 2's VS Code finding that `--user-data-dir` is VS Code's closest analog** — but Copilot CLI's `COPILOT_HOME` is a cleaner, single-env-var, fully-documented, product-native mechanism (unlike VS Code Profiles, which explicitly do *not* isolate Copilot chat history/instructions per Stream 2). This makes Copilot CLI's profile story **more directly analogous to Claude Code's `CLAUDE_CONFIG_DIR` than VS Code's is** — same "one env var to relocate the entire home dir" shape, arguably first-class rather than incidental.
- No evidence found of a *named* "profile" concept (i.e. no `copilot profile switch work` command) — isolation is achieved purely by directory relocation via environment variable, exactly like Claude Code.

Sources: [cli-config-dir-reference § Changing the location of the configuration directory](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference#changing-the-location-of-the-configuration-directory), [cli-command-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference), [GitHub Enterprise Cloud mirror of same page](https://docs.github.com/en/enterprise-cloud@latest/copilot/reference/copilot-cli-reference/cli-config-dir-reference).

**Open question / not found**: no GitHub issue or discussion thread specifically titled around "multiple accounts" / "profiles" surfaced in the searches run (the `COPILOT_HOME` docs page itself already answers the question so directly that a supplementary community-request search wasn't necessary within budget — flagged in Open Questions below as unverified-by-community-discussion, though the official docs are unambiguous).

---

## 4. Default/custom agent selection

**Confidence: high. Checked: 2026-07-25.**

- **Yes**, there is a `--agent=AGENT` CLI flag: *"Specify a custom agent to use."* [cli-command-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).
- Interactive equivalent: **`/agent`** slash command — *"Browse and select from available agents (if any)."*
- **Agent definition files are `NAME.agent.md`** — Markdown with YAML frontmatter (`name`, `description`, `tools: [...]`, and per the config table, an optional `model`), body = system-prompt-like instructions. Same convention Stream 3 found shared with cloud agent/VS Code (`.github/agents/*.agent.md`).
- **Locations, in order of precedence** (project wins over personal):
  - **Project**: `.github/agents/*.agent.md` — takes precedence over personal agents of the same name.
  - **Personal**: `~/.copilot/agents/*.agent.md` (or `$COPILOT_HOME/agents/`) — available in all sessions everywhere.
  - **Plugin-contributed**: an installed plugin's `agents/` dir (as declared by its `agents` manifest key).
- Settings-level controls: `customAgents.defaultLocalOnly` (bool, default `false`) restricts to local-only agents (no remote org/enterprise agents); `subagents.agents` (per-agent model/effort/context-tier config, keyed by name); `subagents.disabledSubagents` (string array — every built-in agent except `rubber-duck` can be disabled: `explore`, `task`, `code-review`, `general-purpose`, `research`, `security-review`); `subagents.maxConcurrency` / `subagents.maxDepth` (usage-based-billing only).
- **Built-in agents** confirmed to exist by name in settings docs: `explore`, `task`, `code-review`, `general-purpose`, `research`, `security-review`, plus a special always-on `rubber-duck` adversarial-feedback subagent (`builtInAgents.rubberDuck` setting, default `true`).
- **This is directly analogous to Claude Code sub-agents** — a named-persona system with its own frontmatter file format, project override over personal, and CLI-flag/slash-command selection. Confirmed present, not merely inferred.

Source: [cli-command-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference), [cli-config-dir-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference) (`agents/` row + settings table), [plugins-creating](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating) (example `.agent.md` frontmatter).

---

## 5. Custom instructions

**Confidence: high. Checked: 2026-07-25.**

Copilot CLI loads custom instructions from **all** of the following **simultaneously** (merged, not first-match-wins):

| Location | Notes |
|---|---|
| `CLAUDE.md` | Git root and cwd |
| `GEMINI.md` | Git root and cwd |
| `AGENTS.md` | Git root and cwd |
| `.github/instructions/**/*.instructions.md` | Git root and cwd |
| `.github/copilot-instructions.md` | Git root and cwd |
| `$HOME/.copilot/copilot-instructions.md` (or `$COPILOT_HOME/...`) | Personal, all sessions |
| `$HOME/.copilot/instructions/**/*.instructions.md` | Personal, all sessions |
| `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` | Extra dirs via env var |

**This is the single most striking cross-modality finding in this stream: Copilot CLI natively reads `CLAUDE.md` and `GEMINI.md` files, not just its own `.github/copilot-instructions.md` and `AGENTS.md`.** This is an explicit, first-party, cross-vendor instruction-file convergence — not a compatibility shim bolted onto hooks (like the PascalCase hook-event compat layer), but native simultaneous loading of competitor-branded instruction files.

- **Imports**: instruction files support `@path` line-prefix imports (inline another file's contents), resolved recursively with a depth limit + cycle/size guards. Explicitly supported in `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` (not stated for `GEMINI.md` or `.instructions.md` files).
- **Generation**: `copilot init` (CLI) / `/init` (slash command) analyzes the codebase and writes/updates `.github/copilot-instructions.md` with build/test/lint commands, architecture, conventions. If missing, CLI nags on startup ("💡 No copilot instructions found. Run /init...") — silenceable per-repo via `/init suppress`.
- **Precedence/merge behavior**: all locations load and merge — there's no single-winner precedence table for instructions the way there is for `settings.json` (§2). This differs from the settings precedence model.
- Repository custom-instructions concept doc: [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions) (shared concept doc across all Copilot surfaces, consistent with Stream 3's finding).

Source: [cli-command-reference § Project initialization for Copilot / Custom instructions locations](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).

---

## 6. Plugin system

**Confidence: high (manifest/hooks/MCP/LSP/extensions), medium (exhaustive optional-field enumeration). Checked: 2026-07-25.**

### 6a. Manifest schema & locations

A plugin = a directory containing (at minimum) a `plugin.json` manifest. **Manifest search order** (per multiple corroborating sources — dev.to writeup + Open Plugin Spec adoption in changelog): `.plugin/plugin.json` → `plugin.json` (root) → `.github/plugin/plugin.json` → `.claude-plugin/plugin.json` (Claude-compat shim). The **only required field is `name`**.

Example (from official docs):
```json
{
  "name": "my-dev-tools",
  "description": "React development utilities",
  "version": "1.2.0",
  "author": { "name": "Jane Doe", "email": "jane@example.com" },
  "license": "MIT",
  "keywords": ["react", "frontend"],
  "agents": "agents/",
  "skills": ["skills/", "extra-skills/"],
  "hooks": "hooks.json",
  "mcpServers": ".mcp.json"
}
```
Optional component-path keys seen: `agents`, `skills` (array, supports multiple dirs), `hooks`, `mcpServers`, and (per the local kitchen-sink scaffold, consistent with docs) `lspServers`, `extensions.paths` (+`extensions.exclusive` bool).

Directory layout example:
```text
my-plugin/
├── plugin.json           # Required manifest
├── agents/               # optional
│   └── helper.agent.md
├── skills/                # optional
│   └── deploy/SKILL.md
├── hooks.json            # optional
└── .mcp.json             # optional
```

### 6b. **NEW since 2026-07-06: the "Open Plugin Spec"**

GitHub Copilot CLI **adopted the Open Plugin Specification v1.0.0** (authored by `vercel-labs/open-plugin-spec`, a vendor-neutral cross-host standard) as of **~1.0.74 (2026-07-23)**:
- Changelog 1.0.74 (2026-07-23): *"Add support for Open Plugin Spec v1 plugin manifests and mcp.json configuration."*
- Earlier partial-compat groundwork, chronologically (from full changelog grep):
  - *"Support Open Plugin spec file locations for loading plugin and marketplace manifests"*
  - *"Improve compatibility with the Open Plugins spec: support `.lsp.json`, PascalCase hook event names, `exclusive` path mode, and `:` namespace separator"*
- **`.plugin/plugin.json` is now the canonical, REQUIRED, vendor-neutral manifest path per the spec itself** — vendor-prefixed manifests (`.claude-plugin/plugin.json`, `.github/plugin/plugin.json`) are "supplemental overrides," preferred by their matching host when present, but every conformant host (Copilot CLI included) MUST also check `.plugin/plugin.json`.
- Verified via GitHub code search: **128 public repos** contain `.plugin/plugin.json` today (spot-checked 5, including `muratcankoylan/Agent-Skills-for-Context-Engineering`, `joaoh82/rustunnel`, `sipyourdrink-ltd/bernstein` — real-world adoption confirmed, not just theoretical spec text).
- **Implication for the kitchen-sink plugin research**: the 2026-07-06 compare-contrast doc's manifest-location table (`.plugin/`, `plugin.json`, `.github/plugin/`, `.claude-plugin/`) is **still accurate as a search list**, but it should now be reframed: `.plugin/plugin.json` is not just "one more location to check" — it is the **spec-mandated canonical one**, and Claude Code, Codex, and OpenCode should each be independently checked (in the other two research streams / a future pass) for Open Plugin Spec conformance, since this is a cross-vendor standard, not a Copilot-only feature.

Sources: [vercel-labs/open-plugin-spec README](https://github.com/vercel-labs/open-plugin-spec), [RFC Feedback Changelog discussion #1](https://github.com/vercel-labs/open-plugin-spec/discussions/1), [github/copilot-cli/changelog.md](https://github.com/github/copilot-cli/blob/HEAD/changelog.md) (1.0.74, 2026-07-23 entry, plus earlier 1.0.x entries visible around v1.0.11-era raw changelog).

### 6c. Skills

`skills/NAME/SKILL.md` convention (same as VS Code Copilot per Stream 2, same open cross-vendor Agent Skills format as Claude/Codex). Discovery locations: personal `~/.copilot/skills/`, project (implied `.github/skills/` — consistent with Stream 2's VS Code finding, not independently re-verified against a CLI-specific doc page in this pass but inferable from `disabledSkills` project-settings key + `COPILOT_SKILLS_DIRS`), plugin-contributed. Settings: `disabledSkills` (string array, repo-level union-only), `dynamicRetrieval.skills` (bool, disables embeddings-based dynamic skill retrieval), `skillDirectories` (extra search dirs, additive to `~/.copilot/skills/`). New in 1.0.74: `copilot plugins install --skill <file|URL|dir>` (optionally `--project`-scoped) — skills can now be installed directly, independent of a full plugin.

### 6d. Agents dir / Commands dir

Agents: covered in §4. **Commands dir**: the kitchen-sink scaffold references a `commands/` plugin key (slash-command markdown files), consistent with the general pattern across Claude/Codex/OpenCode, but this pass did not find a Copilot-CLI-specific *docs.github.com* page independently confirming a `commands/` plugin manifest key's exact schema — flagged as medium-confidence, inherited from the existing local scaffold rather than freshly verified this session.

### 6e. Hooks — full detail (14 events confirmed)

**Locations, loaded in this order and combined** (all sources fire for the same event — no override, pure union):
1. **Policy-level** — `/etc/github-copilot/policy.d/*.json` (Linux/macOS, alphabetical) or Windows Registry `HKLM\Software\Policies\GitHub\Copilot`. Machine-wide, admin-only, **cannot be disabled by `disableAllHooks`**, load regardless of folder trust.
2. **Repository-level** — `.github/hooks/*.json`.
3. **User-level** — `~/.copilot/hooks/*.json` (or `$COPILOT_HOME/hooks/`).
4. **Inline repo settings** — `hooks` key in `.github/copilot/settings.json` / `.local.json`. **Also reads `.claude/settings.json` / `.local.json`** for this key (cross-tool).
5. **Inline user settings** — `hooks` key in `~/.copilot/settings.json`.
6. **Plugin-contributed** — each plugin's own `hooks.json` / `hooks/hooks.json`.

**14 hook events** (confirmed exhaustive against the official reference — matches the local scaffold's "14 native events" claim exactly):

| Event | Can block/modify? | Notes |
|---|---|---|
| `sessionStart` | Optional — inject `additionalContext` | Fires new/resume; supports `prompt`-type hook entries (interactive new-session only, not `-p` or resume) |
| `sessionEnd` | No | `reason`: `complete`/`error`/`abort`/`timeout`/`user_exit` |
| `userPromptSubmitted` | No | |
| `userPromptTransformed` | Yes — mutation-only, can't block | Fires after prompt→model-content transform, per message in a batch |
| `preToolUse` | **Yes — allow/deny/modify** | The powerful one. `"ask"` → treated as `"deny"` when no user (cloud agent) |
| `postToolUse` | Yes — modify result / inject context | |
| `postToolUseFailure` | Yes — recovery guidance via `additionalContext` | exit code 2 for command hooks |
| `preCompact` | No — notification only | matcher on `"manual"`/`"auto"` trigger |
| `permissionRequest` | Yes — allow/deny | Fires *before* the permission engine; matcher on `toolName` |
| `agentStop` | Yes — can force continuation | `decision: "block"`; **capped at 8 consecutive blocks** (added 1.0.72, 2026-07-20 — new since baseline doc) with `stop_hook_active` flag for self-limiting hooks |
| `subagentStart` | Optional — prepend `additionalContext`, can't block creation | matcher on agent name |
| `subagentStop` | Yes — can force continuation | |
| `notification` | Optional — inject `additionalContext` | fire-and-forget, never blocks; matcher on `notification_type` |
| `errorOccurred` | No | |

**Handler types — UPDATED FINDING vs. the 2026-07-06 baseline doc.** The baseline doc claimed *"Copilot and Codex are command-only today."* **This is now stale**: Copilot CLI hooks reference (checked 2026-07-25) documents **three** handler types:
1. **`command`** — `bash`/`powershell`/`command` (cross-platform fallback) + `cwd`, `env`, `timeoutSec` (default 30s). Supports **progress messages** (`{"type":"progress","message":"..."}` streamed to stdout, stripped before final JSON parse; `"temporary": true` for transient status lines).
2. **`http`** — POSTs the JSON payload to a URL. `https://` required by default (localhost exception via `COPILOT_HOOK_ALLOW_LOCALHOST=1`); `allowedEnvVars` for header templating; for `preToolUse`/`permissionRequest` **must** use `https://` since the response can grant permissions.
3. **`prompt`** — auto-submits text as if user-typed; **`sessionStart`-only**; CLI-interactive-new-session-only (not resume, not `-p`).
   - No `mcp_tool` or `agent` handler types found (unlike Claude Code's five-type system per the baseline doc) — Copilot remains at 3 types, still short of Claude's 5, but **has grown from 1 to 3 since the 2026-07-06 baseline.**

**Blocking/exit-code semantics — asymmetric fail-open/fail-closed, explicitly documented:**
- **Command `preToolUse`**: **fail-closed** on crash/non-zero-exit (including exit 2) — denies the tool call even if stdout claims `permissionDecision: "allow"`. **BUT: timeouts are always fail-open** (even for `preToolUse` and admin policy hooks) — a hook that times out just warns and lets the normal permission flow proceed.
- **HTTP `preToolUse`**: **fail-open** — network error, timeout, or non-2xx → falls through to normal permission flow. (Opposite polarity from command hooks — deliberate, documented design choice for admins/authors to choose their risk posture.)
- **Output parsing**: hook stdout is scanned line-by-line; single-line `{"type":"progress",...}` JSON is stripped; everything else concatenates and is parsed as **one** `JSON.parse()` call — two decision objects on stdout → invalid JSON → treated as no-output/default-behavior.
- Dual naming/compat: **camelCase** = native (`sessionStart`, `preToolUse`, fields also camelCase) vs. **PascalCase** = "VS Code compatible"/Claude-compat format (`SessionStart`, `PreToolUse`, fields **snake_case**: `session_id`, `tool_name`, etc.) — **auto-selected by which casing you use for the event key in your hook config**, not a separate file. PascalCase `PreToolUse` additionally applies **Claude's matcher semantics** (`*`/`**`/empty = all; literal or `|`-alternation; else regex anchored `^(?:PATTERN)$`) against a **Claude tool-name mapping table** (`bash`→`Bash`, `view`→`Read`, `create`→`Write`, `edit`/`str_replace_editor`/`apply_patch`→`Edit`, `grep`/`rg`→`Grep`, `glob`→`Glob`, `web_fetch`→`WebFetch`, `web_search`→`WebSearch`, `ask_user`→`AskUserQuestion`, `update_todo`→`TodoWrite`, `task`→`Agent`/`Task`).
- **Matcher is anchored regex** `^(?:PATTERN)$` for native camelCase events too (confirms baseline doc's claim), applied against `toolName`/`notification_type`/agent-name/trigger depending on event.

Cloud-agent hook differences (relevant for cross-modality completeness, per Stream 3 overlap): only `.github/hooks/*.json` loads (no user-level, no `settings.json`, no plugins); only `bash`/`command` honored (no `powershell`); ephemeral filesystem; restricted network (GitHub/Copilot hosts only by default); `permissionRequest`/`notification`/manual-`preCompact` don't meaningfully fire (all tools pre-approved, no user to notify).

Sources: [hooks-reference](https://docs.github.com/en/copilot/reference/hooks-reference) (789-line page, read in full), [hooks concept page](https://docs.github.com/en/copilot/concepts/agents/hooks), [Enterprise Cloud mirror](https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/agents/hooks), changelog 1.0.72 (2026-07-20) entry.

### 6f. MCP server config

- **User-level**: `~/.copilot/mcp-config.json` (or `$COPILOT_HOME/mcp-config.json`).
- **Project-level**: `.mcp.json` or `.github/mcp.json` — **takes precedence over user-level on name conflicts**.
- **Session-only**: `--additional-mcp-config=JSON` flag (inline JSON string or `@file-path`) — augments `mcp-config.json`, overrides same-named installed servers, for that session only.
- Plugin-contributed via manifest `mcpServers` key.
- New in 1.0.74: Open Plugin Spec's own `mcp.json` configuration format now also supported.
- Managed/enterprise governance: MDM `allowedMcpServers`/`deniedMcpServers` (matched by `serverUrl` glob, `serverCommand` array, or `serverName`; deny always wins; trusted first-party GitHub MCP server always exempt) — independent of a separate "enterprise MCP allowlist" referenced in cli-command-reference.
- `--add-github-mcp-toolset=TOOLSET` flag lets you widen the built-in GitHub MCP server's default toolset subset (or `all`).

### 6g. LSP config

- `lspServers` object, keyed by server name: `command` (required), `args`, `fileExtensions` (required — maps extension → language ID), `env` (supports `${VAR}`/`${VAR:-default}` expansion), `rootUri` (relative to Git root, for monorepos), `initializationOptions`, `requestTimeoutMs` (default 90000ms).
- **User-level**: `~/.copilot/lsp-config.json`.
- **Project-level**: `lsp.json` (repo root) or `.github/lsp.json` — precedence over user-level.
- Managed via `/lsp` slash command or direct file edit. Copilot CLI does **not bundle** any LSP servers — install separately (e.g. `npm install -g typescript-language-server`).
- New in 1.0.71 (2026-07-16): sandbox filesystem policy now enforced on LSP file reads/renames.
- New in 1.0.72 (2026-07-20): toggling `/sandbox` restarts only local MCP servers (not remote).

### 6h. Extensions / SDK

This is the **CLI's programmatic extension mechanism**, distinct from plugins and distinct from the old GitHub-App-based "Copilot Extensions" product that Stream 2 found was sunset Nov 2025:
- An extension = a Node.js module in its own subdirectory with an entry file named `extension.mjs`, `.cjs`, or `.js`. **JavaScript only — no TypeScript.**
- **Locations**: `.github/extensions/NAME/` (project, shared with repo collaborators) or `~/.copilot/extensions/NAME/` (personal, all sessions) or plugin-contributed (`extensions.paths` manifest key, `exclusive` bool per local scaffold). Project extensions shadow user extensions on name collision.
- **Mechanism**: discovered at startup → forked as a **separate Node.js child process** (auto-resolves `@github/copilot-sdk`, never manually installed) → calls `joinSession()` to establish a JSON-RPC link into the running CLI session → registers tools/hooks, which become immediately available to the agent.
- **Lifecycle**: reloaded on `/clear`; stopped on CLI exit (SIGTERM → SIGKILL after 5s).
- **Distinct standalone SDK mode** also exists (`CopilotClient`, for embedding Copilot into external applications — create sessions, send messages, register tools programmatically) — different from the in-process `.mjs` extension model but shares the same tools/hooks/events conceptual surface.
- New in 1.0.71 (2026-07-16): "Add canvas support in the CLI for extension-driven interactions."
- **Distinction the docs draw explicitly**: *"An extension is a single JavaScript module... A plugin is an installable package that bundles reusable components... and can be distributed through a marketplace."* I.e., extensions are code-first/programmatic, plugins are manifest-first/declarative-bundle — this maps reasonably well onto the baseline doc's "manifest-first vs. code-first" axis (which placed OpenCode alone in the code-first camp) — Copilot actually straddles both: manifest-first plugins as primary distribution unit, **plus** a genuine code-first extension escape hatch not captured in the 2026-07-06 doc's extension-points matrix.

Sources: [About extensions for GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-extensions), [htek.dev deep-dive](https://htek.dev/articles/github-copilot-cli-extensions-complete-guide), changelog 1.0.71 entry.

---

## 7. Marketplace/distribution

**Confidence: high. Checked: 2026-07-25.**

- **Marketplace = a Git repository** containing a `marketplace.json` at `.github/plugin/marketplace.json`. This alone is sufficient for Copilot CLI to recognize the repo as a marketplace.
- **Schema**:
  ```json
  {
    "name": "my-marketplace",
    "owner": { "name": "Your Organization", "email": "plugins@example.com" },
    "metadata": { "description": "Curated plugins for our team", "version": "1.0.0" },
    "plugins": [
      { "name": "frontend-design", "description": "...", "version": "2.1.0", "source": "./plugins/frontend-design" }
    ]
  }
  ```
  `source` = path relative to marketplace repo root (`./` prefix optional/equivalent). New in 1.0.71: "Allow empty owner and author emails in marketplace metadata." New (per changelog around Open-Plugin-Spec era): remote plugin sources (GitHub repos, git URLs) supported directly in `marketplace.json` plugin entries, not just local relative paths.
- **Official example marketplaces**: `github/copilot-plugins` and `github/awesome-copilot` repos — VS Code discovers plugins from these by default too (cross-modality: same marketplaces serve both VS Code and CLI, per Ken Muse's writeup).
- **Namespacing**: marketplace `name` restricted to `[A-Za-z0-9-]`; installed-plugin identity becomes `plugin-name@marketplace-name` (e.g. `documents@anthropic-copilot-plugins`).
- **Install/manage commands**:
  - `copilot plugin` (top-level command family) — "Manage plugins and plugin marketplaces."
  - `copilot plugins list` — non-interactive inspection of every plugin/MCP-server/skill/instruction-source/LSP-server discovered for cwd (same data as the in-CLI dashboard). **Note**: custom agents and session-scoped hooks are NOT covered by this — "both require a live session."
  - Slash commands: `/plugins install SOURCE` (marketplace spec, GitHub repo, git URL, or local path), `/plugins install --skill [--project] <file|URL|dir>` (skill-only install, new in 1.0.74/75 era), `/plugins enable|disable|remove --plugin|--mcp|--skill NAME` (kind-flag defaults to `--plugin`), `/plugins marketplace add|remove|list|browse`, `/plugins mcp [SUBCOMMAND]` (delegates to `/mcp`).
  - **NEW in 1.0.75 (2026-07-24)**: `update`/`uninstall` verbs added to `/plugins`; `--plugin`/`--mcp`/`--skill` flags (or a positional "kind") let `enable`/`disable`/`remove` target any of the three resource kinds uniformly.
  - `--plugin-dir` flag: load a plugin from a local directory directly (bypassing marketplace install) — useful for plugin development/testing.
  - Declarative auto-install: `enabledPlugins` setting (`Record<string, boolean>`, keyed by plugin spec) — can be set at user level, repo level (repo-scoped activation — the plugin only activates in that repo, never globally, and leaving the repo tears down its MCP server/deactivates its agents/skills), or via MDM.
  - `extraKnownMarketplaces` setting registers additional marketplaces declaratively (source type `"directory"`, `"git"`, or `"github"`).
  - MDM-level governance: `strictKnownMarketplaces` (restrict to known marketplaces) and `extraKnownMarketplaces` as managed policy.
- **No `copilot plugin search` command** was found in the docs — discovery is via `/plugins marketplace browse NAME` or external web catalogs like `awesome-copilot.github.com`.

Sources: [Creating a plugin for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating), [Creating a plugin marketplace](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace), [Ken Muse blog](https://www.kenmuse.com/blog/creating-agent-plugins-for-vs-code-and-copilot-cli/), [dev.to pwd9000 writeup](https://dev.to/pwd9000/github-copilot-cli-plugins-and-marketplaces-extend-your-terminal-agent-16pc), changelog entries 1.0.74/1.0.75.

---

## 8. Hard constraints / gotchas

**Confidence: high. Checked: 2026-07-25.**

- **Plugin caching / reinstall requirement — CONFIRMED, matches baseline doc**: *"Plugin contents are cached at install time, so editing the source folder does not automatically update the installed copy."* Editing a locally-installed plugin's files requires an explicit **reinstall** (or use `--plugin-dir` during development to avoid the caching layer entirely). Same for `/plugin update` — this is now a real command (added per changelog, works for GitHub-installed plugins and marketplaces defined in project settings) that presumably supersedes pure manual-reinstall workflows for marketplace-sourced plugins, though local-directory plugins still need reinstall.
- **`preToolUse` fail-closed vs. fail-open asymmetry** (detailed in §6e) — command-hook crashes/non-zero-exit deny the tool call; command-hook *timeouts* fail open; HTTP-hook failures of any kind fail open. This is a subtle, easy-to-misconfigure trust boundary — a security-critical `preToolUse` hook written as an HTTP hook is meaningfully weaker (fail-open on any network hiccup) than the same logic as a command hook.
- **Dual PascalCase/camelCase hook event naming** with **different field casing** (`camelCase` fields vs Claude-compat `snake_case` fields) is a genuine gotcha for anyone hand-writing hook configs or porting hooks across tools — get the event-name casing wrong and you silently get the wrong payload shape and (for `PreToolUse` specifically) the wrong matcher semantics and tool-name strings.
- **Policy hooks (`/etc/github-copilot/policy.d/*.json` or Windows Registry)** — machine-wide, admin-installed, run before everything else, **cannot be disabled by `disableAllHooks`**, require root ownership + non-world-writable permissions on POSIX (else rejected). This is the closest Copilot CLI analog to the baseline doc's "hard constraint" framing, and it now has a **documented Windows equivalent** (`HKLM\Software\Policies\GitHub\Copilot` registry) not previously called out in the 2026-07-06 doc's mermaid diagram (which only showed the filesystem path `/etc/github-copilot/policy.d`).
- **MDM managed settings** — separate from policy hooks, covers a *fixed allowlist* of keys (`allowedMcpServers`, `deniedMcpServers`, `enabledPlugins`, `extraKnownMarketplaces`, `model`, `permissions`, `remoteControl`, `shellShortcut`, `strictKnownMarketplaces`, `telemetry`). Sourced from macOS MDM plist / `managed-settings.json` file, Windows registry / file, or Linux `/etc/github-copilot/managed-settings.json`. Resolved **per-key** against server-managed settings (MDM wins where set, server fills gaps) and **re-fetched hourly** during long-running sessions — so a policy change (e.g. disabling bypass-permissions mode) takes effect without restart.
- **`permissions.disableBypassPermissionsMode`**: when MDM sets this to `"disable"`, it suppresses `--allow-all-tools`/`--allow-all-paths`/`--allow-all-urls`/`--allow-all`/`--yolo` at startup, and **an MDM value here always wins over user settings** even though most other keys let user settings override the MDM baseline — called out explicitly as a special case in the precedence docs.
- **Prompt-mode (`-p`) security defaults**: extensions, repo hooks, and workspace MCP sources are all **disabled by default** in headless `-p` mode specifically to avoid running repository-controlled code/servers without interactive trust confirmation — each has its own opt-in env var (`GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS`, `_REPO_HOOKS`, `_WORKSPACE_MCP`). Repo hooks *do* auto-load in `-p` if the folder is already trusted or `COPILOT_ALLOW_ALL` is set.
- **`agentStop` infinite-loop guard** (new, 1.0.72/2026-07-20): a hook that always returns `decision: "block"` used to be able to loop forever; now capped at **8 consecutive blocks** and hooks receive a `stop_hook_active` flag to self-limit. (Note: the sibling Claude-Code research in the baseline doc independently documented Claude's own `Stop` hook having an identical "max 8 consecutive blocks" cap — this looks like a case of Copilot CLI adopting a Claude Code safety-limit convention verbatim, another data point for cross-vendor convergence beyond just file-format sharing.)
- **Classic PATs unsupported for auth** (`ghp_` tokens rejected outright) — only fine-grained v2 PATs, Copilot-CLI-app OAuth tokens, or `gh`-CLI OAuth tokens work.
- **Subagent limits are billing-gated**: `subagents.maxConcurrency`/`maxDepth` settings and their env-var equivalents are "only honored for usage-based billing users; ignored for all other plans" — a plan-tier gotcha, not a technical one.
- **Timeouts**: hook default timeout is 30s (`timeoutSec`), independently configurable per hook entry; no single global "600s" default was found for CLI hooks (contrast Codex's documented 600s default in the baseline doc) — Copilot's hook timeout default is much shorter (30s) and per-entry, not a single global knob.

Sources: as cited inline above (hooks-reference, cli-config-dir-reference "MDM managed settings" and "Managed MCP server allow/deny list" sections, changelog 1.0.71/1.0.72/1.0.74/1.0.75 entries, dev.to writeup).

---

## 9. What changed since 2026-07-06 (diff against the local baseline doc)

**Confidence: high. Checked: 2026-07-25.**

Concrete, dated deltas found this session, keyed to the local `kitchen-sink-plugins-compare-contrast.md` (2026-07-06) claims about Copilot CLI:

1. **Hook handler types went from 1 (command-only) to 3 (command, http, prompt).** The baseline doc's §4 table said *"Copilot and Codex are command-only today."* This is now **false for Copilot** — `http` and `prompt` hook types are both documented in the current [hooks-reference](https://docs.github.com/en/copilot/reference/hooks-reference). (Codex's status not re-verified in this stream — out of scope, flagged for the Codex-focused research stream.)
2. **Open Plugin Spec v1.0.0 adoption** (1.0.74, 2026-07-23) — the single biggest structural change. `.plugin/plugin.json` is now the spec-mandated canonical vendor-neutral manifest path across (at least) Copilot CLI, with `mcp.json` also gaining Open-Plugin-Spec-format support. This reframes the baseline doc's "manifest location" comparison table from "each platform has its own convention" to "there is now an emerging cross-vendor standard that Copilot has adopted, and other platforms should be checked for adoption too."
3. **`agentStop` infinite-loop protection** (1.0.72, 2026-07-20) — 8-consecutive-block cap + `stop_hook_active` flag, mirroring Claude Code's own `Stop`-hook cap (baseline doc §7 lists this as a Claude-only constraint; it is now shared).
4. **Plugin/skill/MCP-server lifecycle commands matured significantly**: `/plugin update` now works (both GitHub-installed and project-marketplace-defined); 1.0.75 added `update`/`uninstall` verbs plus uniform `--plugin`/`--mcp`/`--skill` kind-targeting to `enable`/`disable`/`remove`; direct skill installation (`copilot plugins install --skill <file|URL|dir>`, optional `--project` scope) landed independent of full plugin installs.
5. **`--plugin-dir` flag** for loading a plugin straight from a local directory (dev/test workflow) — not mentioned in the baseline doc.
6. **Settings-file rename**: `config.json` → `settings.json` split (user-editable settings vs. app-managed state) — the baseline doc doesn't discuss this file split at all; it's a meaningful internal-structure change for anyone scripting against `~/.copilot/config.json` directly (now must target `settings.json` for user-editable keys, with automatic one-time migration).
7. **Sandbox hardening**: 1.0.71 enforced the sandbox filesystem policy on LSP reads/renames; 1.0.72 defaulted macOS keychain access off in the sandbox and made `/sandbox` toggling restart only local (not remote) MCP servers; 1.0.72 also added opt-in git/gh auth inside the sandbox. None of this sandbox-policy detail appears in the baseline doc.
8. **Canvas support for extension-driven interactions** (1.0.71) — a new CLI UI surface for extensions, not covered by the baseline doc's extension-points matrix.
9. **Model additions**: Claude Opus 5 (1.0.75) and Gemini 3.6 Flash (1.0.74) support added — not structurally interesting but confirms active, fast model-catalog churn independent of the plugin/hook system.
10. **Windows policy-hook path now documented explicitly** (`HKLM\Software\Policies\GitHub\Copilot` registry) alongside the Linux/macOS filesystem path — the baseline doc's mermaid diagram only showed the filesystem path.

**No evidence of change** (baseline doc claims re-confirmed as still accurate): dual-manifest checking order broadly holds (though now framed around Open Plugin Spec rather than ad hoc Claude-compat); 14 native + PascalCase-compat hook-event dual-naming system unchanged in event *count* (still 14); anchored-regex matcher semantics unchanged; plugin-caching/reinstall gotcha unchanged; `.claude-plugin/plugin.json` compat shim still present and still explicitly supported per Open Plugin Spec's "vendor-prefixed manifest" carve-out.

---

## Cross-modality file-convention consistency (synthesis across all 3 streams)

Directly addressing the sibling-stream verification ask: **Copilot CLI shares the same core config-file conventions as cloud agent and (partially) VS Code**, with CLI going further than either in one respect:

| File/convention | Shared with cloud agent (Stream 3)? | Shared with VS Code (Stream 2)? | Copilot-CLI-only addition found this session |
|---|---|---|---|
| `.github/copilot-instructions.md` | ✅ yes | ✅ yes (workspace-scoped) | CLI *also* reads `CLAUDE.md`, `GEMINI.md`, `AGENTS.md` natively, all merged together — broader than either sibling finding reported |
| `.github/instructions/*.instructions.md` | ✅ yes | not independently confirmed by Stream 2 | — |
| `AGENTS.md` | ✅ yes | not independently confirmed by Stream 2 | — |
| `.github/agents/*.agent.md` | ✅ yes (Stream 3) | ✅ yes, renamed from "custom chat modes" in VS Code 1.106 (Stream 2) | CLI adds a **personal** (non-repo) `~/.copilot/agents/` tier that VS Code/cloud-agent don't have (project still wins on name collision) |
| `.github/skills/*/SKILL.md` | not explicitly confirmed here | ✅ yes (Stream 2) | CLI also has personal `~/.copilot/skills/`, `COPILOT_SKILLS_DIRS` |
| MCP config | `.github/mcp.json` shared | `.vscode/mcp.json` (VS Code-specific, `servers` key — **different file/key** per Stream 2) | CLI's own `~/.copilot/mcp-config.json` (user) + `.mcp.json`/`.github/mcp.json` (project) — the `.mcp.json` name is the one that's actually portable across CLI/cloud-agent; VS Code's is genuinely its own thing |
| Plugin manifest | — | — | Copilot CLI now implements the **Open Plugin Spec**, a cross-vendor standard independent of GitHub — this is bigger than "Copilot CLI convention," it's a candidate for genuine multi-tool portability if Claude Code/Codex/OpenCode also adopt it (unverified in this stream — recommend checking in the other two plugin-research streams or a follow-up pass) |

**Net conclusion for the profile/plugin design this research feeds**: Copilot CLI's `COPILOT_HOME` gives you the same clean profile-isolation primitive as `CLAUDE_CONFIG_DIR`; its instruction-file loading is the *most* permissive/interoperable of the three Copilot surfaces studied across streams (reads competitor files natively); and its plugin manifest system is mid-migration toward a genuinely vendor-neutral spec that could become the actual interoperability layer this whole kitchen-sink-plugin research program is implicitly trying to hand-roll.

---

## Open questions / could not verify

1. **No GitHub issue/discussion thread specifically about "multiple accounts"/"profiles" was searched for and read directly** — the official `COPILOT_HOME` docs page answered the isolation question so unambiguously that a supplementary community-request search was deprioritized to stay in budget. If a future pass has budget, searching `github/copilot-cli` issues for "profile" or "multiple accounts" would add corroborating real-user-need context (or surface edge cases/bugs with `COPILOT_HOME` in practice) but is not expected to change the core finding.
2. **`commands/` plugin-manifest key schema** — referenced by the local kitchen-sink scaffold (`commands/scaffold.md`, `commands/audit.md`) but not independently re-confirmed against a fresh docs.github.com page this session. Medium confidence only, inherited from prior research.
3. **Skills project-level directory path** (`.github/skills/`) for Copilot CLI specifically — inferred from Stream 2's VS Code finding and from the `disabledSkills`/`skillDirectories` settings existing, but not read from a Copilot-CLI-specific docs page that names the exact path this session. Recommend a targeted follow-up: fetch `docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills` directly (found in a citation but not fetched in full this session due to budget).
4. **Whether Claude Code, Codex, and OpenCode have also adopted (or plan to adopt) the Open Plugin Spec** — out of scope for a Copilot-CLI-focused stream, but this is now the single most important cross-cutting question for the parent kitchen-sink-plugins research program, since it could obsolete much of the platform-specific manifest-location tooling if broadly adopted.
5. **Exact current list of `--available-tools`/`--excluded-tools`/`--deny-tool`/`--allow-url`/`--deny-url` flag syntax** was seen in passing (`--deny-tool='write(PATH)'` scoping example) but not exhaustively cataloged — out of scope for this research's required questions, noted only because it appeared adjacent to permissions-config.json material.
6. **Whether `copilot plugin install` (singular, non-slash CLI form) exists as documented CLI syntax distinct from the `/plugins install` slash command** — the docs consistently showed `/plugins install SOURCE` (slash command) and `copilot plugin` / `copilot plugins list` (CLI); it's plausible a `copilot plugins install` CLI-only equivalent exists (symmetrical to `copilot plugins list`) but this exact command form was not directly observed in the fetched pages.

---

## Sources

- https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli
- https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli
- https://github.com/features/copilot/cli
- https://github.com/github/copilot-cli/blob/HEAD/changelog.md
- https://github.com/github/copilot-cli/blob/main/README.md
- https://raw.githubusercontent.com/github/copilot-cli/v1.0.11/changelog.md
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- https://docs.github.com/en/enterprise-cloud@latest/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://docs.github.com/en/copilot/concepts/agents/hooks
- https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/agents/hooks
- https://docs.github.com/en/copilot/reference/hooks-reference
- https://docs.github.com/en/enterprise-cloud@latest/copilot/reference/hooks-reference
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating
- https://github.com/github/docs/blob/main/content/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating.md
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace
- https://dev.to/pwd9000/github-copilot-cli-plugins-and-marketplaces-extend-your-terminal-agent-16pc
- https://www.kenmuse.com/blog/creating-agent-plugins-for-vs-code-and-copilot-cli/
- https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-extensions
- https://htek.dev/articles/github-copilot-cli-extensions-complete-guide
- https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/add-lsp-servers
- https://mcpservers.org/agent-skills/github/lsp-setup
- https://github.com/vercel-labs/open-plugin-spec
- https://github.com/vercel-labs/open-plugin-spec/blob/main/README.md
- https://github.com/vercel-labs/open-plugin-spec/discussions/1
- https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering/blob/c578e85e40fe2bda7c1fec91ff64cf5285434934/.plugin/plugin.json (GitHub code search spot-check)
- https://github.com/joaoh82/rustunnel/blob/e65cb1ec86f343ec60f54eb65a9f1aeacdbd3901/.plugin/plugin.json (GitHub code search spot-check)
- https://github.com/sipyourdrink-ltd/bernstein/blob/bee84ddc0116e3c610931f8c182f72d213ac211b/.plugin/plugin.json (GitHub code search spot-check)
- Local: `/Users/derp/.agents/docs/reference/kitchen-sink-plugins-compare-contrast.md` (2026-07-06 baseline)
- Local: `/Users/derp/.agents/plugins/kitchen-sink-copilot-cli/` (plugin.json, hooks/hooks.json, hooks/hooks.claude.json, .mcp.json, lsp.json, .github/plugin/{plugin.json,marketplace.json}, .claude-plugin/plugin.json, references/*.md)
