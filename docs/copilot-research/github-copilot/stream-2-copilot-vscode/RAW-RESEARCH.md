# RAW RESEARCH — GitHub Copilot in VS Code (Stream 2 of 3)

**Compiled 2026-07-25** by Research Stream 2 (modality: GitHub Copilot VS Code extension — Copilot Chat, agent mode, inline completions, custom chat participants/extensions).

**Method summary:** This is a raw, unpruned research dump. No premature synthesis has been applied — findings are recorded per-question with inline citations, explicit confidence markers, and the check date. Training-data recall was treated as hypothesis-only and verified against live sources wherever possible. Methods used:

1. **WebSearch** — official `code.visualstudio.com/docs/*` pages (`agent-customization/*`, `agents/*`, `enterprise/*`, `configure/*`), `docs.github.com/en/copilot/*`, GitHub Changelog (`github.blog/changelog/*`), VS Code release notes (`microsoft/vscode-docs` release-notes), and third-party technical blogs current to mid/late-2026.
2. **Context7** (`user-context7` MCP) — resolved library IDs for "Visual Studio Code" (`/microsoft/vscode-docs`, `/microsoft/vscode`, `/websites/code_visualstudio`) and queried current docs on profile isolation/`--user-data-dir`, and on `github.copilot.*`/`chat.*` settings precedence.
3. **GitHub code search** (`user-github` MCP `search_code`) — live queries against GitHub's code index for real-world repos using `.github/copilot-instructions.md`, `.github/agents/*.agent.md`, `.github/chatmodes/*.chatmode.md` (legacy), `.vscode/mcp.json`, `*.instructions.md`, and `.github/skills/*/SKILL.md`.
4. **Local reference check** — read `/Users/derp/.agents/docs/reference/kitchen-sink-plugins-compare-contrast.md` (dated 2026-07-06) for what was already known; this raw research goes deeper and is more current, especially on the chat-modes→custom-agents rename (VS Code 1.106, which the local doc does not mention) and on the profile-isolation gap (GitHub issue microsoft/vscode#290374, filed after the local doc's date).

All findings below are checked as of **2026-07-25** unless otherwise noted. VS Code's Copilot surface changes very fast (monthly release cadence, near-weekly Copilot Chat extension releases) — treat anything not carrying today's check-date as potentially stale by the time this is read.

---

## 1. Product surface: chat modes, inline completions, agent mode capabilities

**Confidence: high | Checked: 2026-07-25**

### Current chat mode naming (as of July 2026)

VS Code Copilot Chat currently exposes **three built-in modes**, selectable from a dropdown at the bottom of the Chat view (`Ctrl+Alt+I` / `Cmd+Ctrl+I`):

- **Ask mode** — conversational Q&A, code explanation, snippet generation. No automatic file changes. Uses agentic capabilities to research the codebase and gather context, but changes must be applied manually via "Apply in Editor" on code blocks. [Local agents in VS Code](https://code.visualstudio.com/docs/agents/agent-types/local-agents), [chat-in-ide docs](https://docs.github.com/en/copilot/how-tos/chat-with-copilot/chat-in-ide?tool=vscode)
- **Plan mode** — generates a structured implementation plan for review before any code is touched. [chat-in-ide docs](https://docs.github.com/en/copilot/how-tos/chat-with-copilot/chat-in-ide?tool=vscode)
- **Agent mode** — the autonomous mode. Plans steps, determines which files to touch, edits multiple files, runs terminal commands, monitors output/errors, and iterates in a loop until the task is done or requires user input. [Introducing GitHub Copilot agent mode (VS Code blog, originally Feb 2025, still canonical)](https://code.visualstudio.com/blogs/2025/02/24/introducing-copilot-agent-mode), [GitHub Blog: ask/edit/agent](https://github.blog/ai-and-ml/github-copilot/copilot-ask-edit-and-agent-modes-what-they-do-and-when-to-use-them/)

**Edit mode is deprecated.** Per the VS Code docs (`docs/agents/agent-types/local-agents`), "Edit mode is deprecated. Use Agent mode for multi-file code edits instead." It can be restored via the `chat.editMode.hidden` setting for legacy workflows, but new guidance funnels everyone to Agent mode for multi-file work. Some third-party 2026 blog content (e.g., dev.to "Complete Guide 2026") still describes "Ask / Edit / Agent" as the three modes — this reflects the pre-deprecation state and should be treated as slightly stale relative to the official VS Code docs, which now describe Ask / Plan / Agent as the three chat modes with Edit demoted to a hidden legacy option.

**Agent-type distinction (newer framing, mid-2026):** VS Code docs now also distinguish "local agents" (agent orchestration runs in the VS Code process on your machine) from "Copilot cloud agents" (orchestration runs on GitHub's remote servers). The *type* of agent (local vs. cloud) is independent of which language model backs it — "the location of the language model does not depend on the agent type." [Local agents in VS Code](https://code.visualstudio.com/docs/agents/agent-types/local-agents)

### Inline completions

Ghost-text inline completions (the original "Copilot" autocomplete-as-you-type experience) remain a distinct feature from Chat. This document did not find evidence of major naming changes here as of 2026-07-25; it continues to be controlled by `editor.inlineSuggest.enabled` and Copilot-specific completion settings under `github.copilot.editor.*`. (Confidence: medium — this was not the focus of deep search since it's the most stable/legacy part of the surface and least likely to have changed.)

### Agent mode capabilities — confirmed autonomous behaviors

From official docs and the VS Code Copilot Chat changelog:

- **Multi-file autonomous edits**: agent determines which files to change without being told file-by-file. [chat-in-ide docs](https://docs.github.com/en/copilot/how-tos/chat-with-copilot/chat-in-ide?tool=vscode)
- **Terminal command execution**: agent proposes and (subject to approval settings) runs terminal commands, observes output, and iterates. Controlled by `chat.agent.enabled`, `github.copilot.chat.agent.runTasks`, `github.copilot.chat.agent.autoFix`, `chat.tools.terminal.autoApprove` (per-command/regex allow-deny map), `chat.tools.terminal.enableAutoApprove`. [AI settings reference](https://code.visualstudio.com/docs/agents/reference/ai-settings)
- **MCP tool use**: agent mode has had MCP server support since the mode went to VS Code Stable (per the Feb 2025 blog, "Agent mode is now available in VS Code Stable and has support for MCP servers"), and this has substantially deepened since — see §6.
- **Global "YOLO" auto-approve**: `chat.tools.global.autoApprove` (boolean) — bypasses per-action confirmation entirely for all tools; documented as a real security risk, and enterprises can lock it off via managed policy (`ChatToolsAutoApprove` → `disable`). [AI settings reference](https://code.visualstudio.com/docs/agents/reference/ai-settings), [Manage AI settings in enterprise environments](https://code.visualstudio.com/docs/enterprise/ai-settings)
- **Permission levels per session** (newer, experimental as of mid-2026): `chat.permissions.default` accepts `default` (Default Approvals), `autoApprove` (Bypass Approvals), or `autopilot` (Autopilot) — settable per session even if a different global default is configured. Enterprise policy can force this back to `default` regardless of the local setting. [AI settings reference](https://code.visualstudio.com/docs/agents/reference/ai-settings)
- **Agent delegation** (new, found in `vscode-copilot-chat` CHANGELOG): a `/delegate` command allows agent-to-agent handoff — related to the new `handoffs` frontmatter property on custom agent files (§5). [microsoft/vscode-copilot-chat CHANGELOG](https://github.com/microsoft/vscode-copilot-chat/blob/main/CHANGELOG.md)
- **`chat.agent.maxRequests`**: caps how many autonomous tool-call/edit iterations an agent session can run before stopping and asking the user to continue (default reported as low as 25 in some docs/blog snippets, with users commonly raising it to 250-300 for long-running tasks). [Tune GitHub Copilot Settings in VS Code](https://dev.to/pwd9000/tune-github-copilot-settings-in-vs-code-32kp), [StackOverflow: auto-approve terminal commands](https://stackoverflow.com/questions/79720577/how-to-automatically-approve-continue-github-copilot-terminal-commands-in-vs-cod)

**Terminology churn warning**: "Custom chat modes" were renamed "custom agents" in VS Code 1.106 (see §5) — so "agent mode" (the built-in autonomous chat mode) and "custom agents" (user/workspace-defined personas, formerly "custom chat modes") are now two different things that both use the word "agent." This is a significant naming collision introduced mid-2026 that raw web content from before the rename (and possibly some of the local reference doc's assumptions) will not reflect.

---

## 2. Config/settings locations: `github.copilot.*` / `chat.*` keys, workspace vs. user vs. enterprise precedence

**Confidence: high | Checked: 2026-07-25**

### Where settings live

Standard VS Code settings layering applies to Copilot/Chat settings — there is no Copilot-specific settings file separate from VS Code's normal `settings.json` mechanism (contrast with Claude Code's separate `.claude/settings.json`):

- **User settings** — global, apply across all workspaces, physically stored inside the active **profile's** folder (see §3 — this matters for isolation). Edited via `Cmd/Ctrl+,` or `Preferences: Open User Settings (JSON)`.
- **Workspace settings** — `.vscode/settings.json` at the project root. **Workspace settings take precedence over and override conflicting User settings.** [VS Code docs: Configure the editor > User vs Workspace settings](https://github.com/microsoft/vscode-docs/blob/main/docs/editing/getting-started.md) (via Context7 `/microsoft/vscode-docs`)
- **Remote settings** — when connected to SSH/WSL/Devcontainer remotes, a separate remote-scoped `settings.json` layer applies to remote-only keys (MCP servers configured for a remote workspace should be defined in remote settings, not local user settings — [Add and manage MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)).
- **Enterprise/managed settings** — a distinct, higher-precedence governance layer described below, separate from "VS Code enterprise policies" deployed via ADMX/configuration profiles.

### Representative `chat.*` / `github.copilot.*` keys (compiled from official docs + real-world `.vscode/settings.json` examples)

```jsonc
// Agent mode core
"chat.agent.enabled": true,
"chat.agent.maxRequests": 25,               // iteration cap before agent pauses
"chat.agent.thinkingStyle": "fixedScrolling",
"chat.agent.todoList.position": "default",
"chat.editMode.hidden": false,               // restore deprecated Edit mode

// Copilot-specific chat behavior (legacy namespace, still active)
"github.copilot.chat.agent.autoFix": true,
"github.copilot.chat.agent.runTasks": true,
"github.copilot.chat.agent.thinkingTool": false,
"github.copilot.chat.newWorkspaceCreation.enabled": true,
"github.copilot.chat.virtualTools.threshold": 128,
"github.copilot.chat.customOAIModels": [],
"github.copilot.chat.claudeAgent.enabled": true,     // 3rd-party model agent integration (Claude), gate-able by org policy "Claude3PIntegration"
"github.copilot.advanced": { "authProvider": "github-enterprise" },  // force GHE auth

// Tools / permissions
"chat.tools.global.autoApprove": false,       // "YOLO mode" toggle
"chat.tools.terminal.autoApprove": { "rm": false, "curl": false, "/^Remove-Item\\b/i": false },
"chat.tools.terminal.enableAutoApprove": true,
"chat.tools.eligibleForAutoApproval": {},     // policy-oriented allowlist of tools eligible for auto-approve
"chat.permissions.default": "default",        // "default" | "autoApprove" | "autopilot"

// MCP
"chat.mcp.access": true,                      // or "all" | "registry" under managed policy
"chat.mcp.discovery.enabled": false,
"chat.mcp.gallery.enabled": false,
"chat.mcp.autoStart": "newAndOutdated",
"chat.mcp.serverSampling": {},

// Instructions / custom agents
"chat.instructionsFilesLocations": {},        // extra dirs to scan for *.instructions.md
"chat.agentFilesLocations": {},               // extra dirs to scan for *.agent.md
"chat.useNestedAgentsMdFiles": false,

// Session / sync
"chat.sessionSync.enabled": true,             // sync session metadata TO github.com (one-way)
"chat.sessionSync.excludeRepositories": [],
"chat.emptyState.history.enabled": false,
"chat.disableAIFeatures": false,              // kill switch for all AI/chat features, settable at workspace or user level

// Utility models (needed when using BYOK without a GitHub sign-in)
"chat.utilityModel": "...",
"chat.utilitySmallModel": "..."
```

Sources: [AI settings reference](https://code.visualstudio.com/docs/agents/reference/ai-settings) (canonical, most current), [Tune GitHub Copilot Settings in VS Code (dev.to)](https://dev.to/pwd9000/tune-github-copilot-settings-in-vs-code-32kp) (real-world `.vscode/settings.json` sample), [Set up GitHub Copilot in VS Code](https://code.visualstudio.com/docs/setup/copilot) (per-workspace/profile GitHub account selection, `chat.disableAIFeatures`).

**Note on namespace split**: There is an ongoing (incomplete, as of 2026-07-25) migration from the `github.copilot.chat.*` namespace to a generic `chat.*` namespace as VS Code absorbs more Copilot-originated chat functionality into core (this mirrors how "custom chat modes" became a core "custom agents" concept in 1.106 — see §5). Expect both namespaces to coexist for the foreseeable future; **new features increasingly land under `chat.*`.**

### Enterprise-managed settings — three delivery channels with strict precedence

This is materially more sophisticated than plain workspace/user layering and was one of the more surprising findings. As of **VS Code 1.128**, precedence is strictly enforced across three channels (channel wins outright, not merged, though within a channel unset keys fall through):

1. **Native MDM** (highest) — Windows Registry (`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\GitHubCopilot`) or macOS managed preferences (`com.github.copilot` domain), deployed via Intune/Jamf/Group Policy.
2. **Server-managed** — resolved from the developer's signed-in GitHub account via a `copilot/managed-settings.json` file living in the org's `.github-private` repository. Because it's tied to the GitHub account, it travels across devices without any local device management.
3. **File-based** (lowest) — a well-known OS path, e.g. `/etc/github-copilot/managed-settings.json` on Linux, `%ProgramFiles%\GitHubCopilot\managed-settings.json`-style path on Windows. Must be owned by `root`/admin, not world-writable, not a symlink — deployable via Chef/Puppet/Ansible.

Precedence resolution is **per-key**: the highest-precedence channel that sets a given key wins for that key; a key left unset by native MDM still falls through to server-managed, then file-based. [Manage AI settings in enterprise environments](https://code.visualstudio.com/docs/enterprise/ai-settings), [Deploy managed Copilot settings via MDM (GitHub Changelog, 2026-07-08)](https://github.blog/changelog/2026-07-08-deploy-managed-copilot-settings-via-mdm-in-vs-code-and-cli/), [configure-enterprise-managed-settings (docs.github.com)](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings). Internal implementation detail confirmed directly from VS Code's own source-adjacent skill docs: `pickManagedSettings(nativeMdm, server, file)` in `copilotManagedSettings.ts` — [microsoft/vscode `.github/skills/add-policy/github-managed-settings.md`](https://github.com/microsoft/vscode/blob/234229df/.github/skills/add-policy/github-managed-settings.md).

Managed settings are explicitly **distinct** from generic "VS Code enterprise policies" deployed via ADMX templates/configuration profiles — Copilot managed settings use their own delivery channels and JSON schema shape so a single definition can govern both VS Code *and* the separate GitHub Copilot CLI product simultaneously. A managed setting maps to (and overrides) the corresponding VS Code Copilot policy/user setting on managed devices — e.g., managed key `permissions.disableBypassPermissionsMode` maps to policy `ChatToolsAutoApprove` which controls the `chat.tools.global.autoApprove` setting.

**Overall precedence chain (my synthesis of the two systems, high confidence)**:

```
Native MDM  >  Server-managed (.github-private)  >  File-based managed-settings.json
     (all three above = "managed settings," override everything below on managed devices)
                          ↓
              Workspace settings (.vscode/settings.json)
                          ↓
                  User/Profile settings (settings.json in active profile)
                          ↓
                    VS Code default values
```

---

## 3. Profile isolation — THE key question

**Confidence: high | Checked: 2026-07-25**

This is the most important finding of this research stream, so it's presented in full detail with all mechanisms considered.

### 3.1 What VS Code's native "Profiles" feature isolates

Per official docs and, more authoritatively, the actual TypeScript source (`src/vs/platform/userDataProfile/common/userDataProfile.ts`), a VS Code `IUserDataProfile` has these **resource-scoped, profile-isolated** fields:

```typescript
export const enum ProfileResourceType {
	Settings = 'settings',
	Keybindings = 'keybindings',
	Snippets = 'snippets',
	Prompts = 'prompts',
	Tasks = 'tasks',
	Extensions = 'extensions',
	GlobalState = 'globalState',
	Mcp = 'mcp',
	LanguageModels = 'languageModels',
}
```
[`microsoft/vscode` `userDataProfile.ts`](https://github.com/microsoft/vscode/blob/234229df/src/vs/platform/userDataProfile/common/userDataProfile.ts)

So natively, **Profiles DO isolate**: settings, keybindings, snippets, prompt files (`promptsHome`), tasks, extensions, global state, **MCP server configuration** (as of v1.102+, per the resource type list and corroborated by the GitHub issue below), and — newly — **language model configuration** (BYOK provider/key config, per the `LanguageModelsResource` field, which is a notably recent addition tracking the BYOK feature rollout in 2026).

Each profile is a real, separate directory under the user configuration root (`Code/User/profiles/<profile-id>/` pattern), with its own `settings.json`, `mcp.json`, extensions manifest, etc. [Profiles in Visual Studio Code](https://code.visualstudio.com/docs/configure/profiles)

A profile is associated with a folder/workspace — opening that folder auto-activates its associated profile. Profiles can be scoped narrowly too: "You can limit the new profile to only include a subset of configurations... and use the rest of the configurations from the Default Profile" — e.g., a profile could isolate only extensions and MCP servers while inheriting keybindings from Default.

### 3.2 What VS Code's native Profiles feature does NOT isolate (confirmed gap, actively tracked)

**This is the critical finding.** A GitHub issue filed directly against `microsoft/vscode` — **Issue #290374, "Extend Profile Isolation to AI Configuration Files (Copilot Instructions, AGENTS.md, Prompts)"** — explicitly documents this gap as of the current VS Code version range (issue references v1.75 through v1.108):

> "VS Code's current profile system (introduced in v1.75, enhanced through v1.108) isolates extensions, settings, keybindings, and MCP servers, but does NOT isolate AI configuration files."

Specifically called out as **not** profile-scoped:
- ❌ `.github/copilot-instructions.md` — workspace-level only, not profile-aware at all
- ❌ `AGENTS.md` — workspace-level only (experimental feature)
- ❌ `.github/prompts/` directory — workspace-level only
- ❌ `.instructions.md` — can live in workspace OR user profile (`promptsHome`), but user-profile copies are **not portable/exportable per-profile** in the same first-class way settings/extensions are
- ❌ `.agent.md` custom agent files — can be stored in the user profile folder, but **are not profile-scoped**: "Custom agents (.agent.md) can be stored in user profile but are not profile-scoped ... all profiles share the [same instance]" (issue text is truncated in the search snippet but the intent is unambiguous from context and from the "Gap" bullet list)
- ❌ **AI chat history is global, not per-profile** — this is stated explicitly and independently corroborated (see §3.4 below)

[microsoft/vscode Issue #290374](https://github.com/microsoft/vscode/issues/290374) — **this is a live, open, unresolved issue as of 2026-07-25**, meaning the gap is a currently-shipping limitation, not a historical one that's since been fixed.

The proposed fix in that issue (not yet implemented) would extend the profile-directory pattern already used for MCP servers (`%APPDATA%/Code/Profiles/ProfileName/mcp.json`-style) to a new `.../ai/` subdirectory holding `copilot-instructions.md`, `agents.md`, `.agent.md` files, and prompts, "presented virtually to the workspace" without physically writing files into the repo. **This does not exist yet.**

### 3.3 Direct answer to "does switching a Profile fully isolate Copilot like `CLAUDE_CONFIG_DIR` isolates a Claude Code runtime home?"

**No — not fully, and this is an acknowledged, open gap, not a matter of interpretation.**

What IS isolated by a Profile switch:
- Which extensions are enabled (so you could have a "dotnet profile" with the C#/dotnet extension pack enabled and a "frontend profile" with a completely different extension set, including potentially different Copilot-adjacent extensions or different versions)
- User-level `chat.*`/`github.copilot.*` settings (defaults, auto-approve policy, agent behavior toggles)
- MCP server configuration defined at the **user/profile level** (`mcp.json` in the profile folder) — profile A and profile B can have entirely different MCP server sets
- Language model / BYOK configuration (which providers/keys are registered) — new/notable, tracks the 2026 BYOK rollout
- Keybindings, snippets, tasks

What is NOT isolated by a Profile switch:
- **Chat/conversation history** — confirmed global across the whole VS Code installation, independent of profile (§3.4)
- **`.github/copilot-instructions.md`** and **`AGENTS.md`** — these are workspace-root files, not profile-scoped at all; they follow the *folder*, not the *profile*. If you open the same repo folder under two different profiles, both profiles see the same instructions file, because it's a file inside the repo, not inside profile storage.
- **`.instructions.md` / `.agent.md` files stored at user level** — technically live in a profile's storage location physically, but VS Code's own bug tracker states they are **not treated as profile-scoped** in the product's mental model/switching semantics — i.e., there's ambiguity/incompleteness here that the open issue is trying to resolve.

**Practical consequence for a "specialty" Copilot setup (e.g., dotnet-focused profile vs. frontend-focused profile) using ONLY native Profiles:** You can cleanly separate *extensions, MCP servers, model providers, and default chat settings* — genuinely useful for a specialty setup. But you get **zero isolation of instructions files** (since those live in the repo, not the profile) and **zero isolation of chat history** (since that's a single global store regardless of profile). If your specialty-isolation goal includes "different persistent conversational memory per specialty" or "different instructions auto-injected regardless of which repo is open," native Profiles alone do not deliver that — you'd need workspace-level `.github/copilot-instructions.md` per repo (which is a *repo* axis, not a *profile* axis) or custom `.agent.md` files placed carefully.

### 3.4 Chat history global-ness — independently corroborated

Multiple, independent GitHub issues confirm chat history is NOT profile- or even installation-scoped in the way you'd want for isolation:

- **microsoft/vscode #306502** ("Sync GitHub Copilot Chat History Across Devices"): "GitHub Copilot chat history is stored locally and is not synchronized across devices... Settings Sync already handles extensions, settings, keybindings, and UI state — chat history feels like a natural addition" but a maintainer response states this was **explicitly marked out-of-scope**: *"After consideration, syncing Copilot Chat history across devices is currently out of scope."* [Issue #306502](https://github.com/microsoft/vscode/issues/306502)
- **microsoft/vscode-copilot-release #991**: A maintainer (`@sandy081`) noted *"Syncing state is supported by Settings Sync. It is up to the owner of the state to sync or not"* — implying it's technically feasible via the Settings Sync mechanism but **no one owns implementing it for chat state specifically**. [Issue #991](https://github.com/microsoft/vscode-copilot-release/issues/991)
- **microsoft/vscode-copilot-release #14118** (filed 2026-02-09, i.e., recent): Chat history isn't even shared between VS Code **Stable and Insiders on the same machine**, let alone across profiles or devices — each stores history independently under its own `Application Support/Code*/` directory, "even when Settings Sync is enabled." [Issue #14118](https://github.com/microsoft/vscode-copilot-release/issues/14118)
- There IS a **partial, one-directional** mechanism: `chat.sessionSync.enabled` (requires `github.copilot.chat.localIndex.enabled`) uploads session data **to your GitHub account** for viewing via the Agents tab on github.com — but this does **not sync history back down into VS Code on another machine/profile**. It's an export-to-cloud-viewer feature, not a local-to-local sync feature. `chat.sessionSync.excludeRepositories` lets you opt specific repos out. [AI settings reference](https://code.visualstudio.com/docs/agents/reference/ai-settings)

### 3.5 Alternative isolation mechanisms beyond native Profiles

Since native Profiles are confirmed incomplete for AI-config isolation, here are the other mechanisms evaluated, exhaustively, as requested:

**(a) `--user-data-dir` (fully separate user data root) — the strongest alternative, officially documented for exactly this purpose:**

> "Use the `--user-data-dir` option to specify a unique directory for each VS Code instance. This ensures separate environment variables, settings, extensions, and UI state for each instance." [VS Code CLI docs, "Isolating VS Code instances"](https://github.com/microsoft/vscode-docs/blob/main/docs/configure/command-line.md) (via Context7), also [code.visualstudio.com/docs/configure/command-line](https://code.visualstudio.com/docs/configure/command-line)

```bash
code ~/dotnet-project --user-data-dir ~/vscode-data-dotnet
code ~/frontend-project --user-data-dir ~/vscode-data-frontend
```

Each `--user-data-dir` gets: its own environment variables, settings, preferences, **installed extensions** (must be reinstalled per dir — this is the tradeoff), UI state/layout, and (per StackOverflow deep-dive on the internals) **all "personalisable" things including credential caches** — this is the closest VS Code analogue to `CLAUDE_CONFIG_DIR`'s "isolate a whole runtime home" behavior, because it isolates GitHub/MS account credential caches too, not just settings.

Optionally pair with `--extensions-dir <dir>` to also separate the extensions *installation* directory from the user-data directory (by default extensions live in `~/.vscode/extensions` regardless of `--user-data-dir`, so without `--extensions-dir` your extensions list would still bleed across "instances" unless you also isolate that).

**Does this isolate chat history / AI config, unlike Profiles?** Reasoning from the evidence: since `--user-data-dir` isolates the entire user-data root (of which a Profile is a *subdirectory*), and workspaceStorage / chat session data is stored under the user-data root (per the Stable-vs-Insiders issue showing chat history lives at `~/Library/Application Support/Code*/`), **a fully separate `--user-data-dir` should isolate chat history too**, because it's a completely distinct VS Code "installation identity," not just a different named profile within one shared installation. This is inferred from architecture, not explicitly stated in a single doc — flagging as **confidence: medium** for this specific sub-claim (the isolation of chat history specifically), vs. **high** confidence for the general settings/extensions/credentials isolation claim.

Caveat: extensions must be reinstalled per `--user-data-dir`, which is real friction for a "specialty profile" workflow (you'd reinstall your language-server/linter extensions for each specialty root) — Profiles avoid this by allowing extensions to be shared across profiles via "Apply Extension to all Profiles."

**(b) Multiple VS Code product variants/installs (Stable + Insiders, or portable-mode copies):**

- VS Code Stable and Insiders are literally different products with different user-data roots by default (`Code/` vs `Code - Insiders/`), confirmed by issue #14118 above. This gives free, total isolation (including of chat history) between exactly two "profiles" without any flags — but doesn't scale past two without going to `--user-data-dir` anyway, and Insiders gets pre-release features/bugs.
- **Portable Mode**: placing a `data/` folder next to the VS Code executable makes that install fully self-contained (settings, extensions, "session state" all inside `data/`) and **this OVERRIDES both `--user-data-dir` and `--extensions-dir` if both are present** — a real gotcha if you're combining approaches. [vscode-docs command-line.md via Context7, "portable.md" cross-reference]
- A hidden, undocumented-in-`--help` flag `--profile-temp` exists (per a 2025 StackOverflow answer) for spinning up a throwaway profile/extensions dir combo without manually picking paths — useful for scratch/ad-hoc isolation but not a stable "specialty setup" mechanism since it's temp-only by design.

**(c) `--profile` CLI flag (native Profile launcher, for completeness):**

`code ~/projects/web-sample --profile "Web Development"` — opens a folder bound to a named profile, auto-creating it if absent. This is just the CLI entry point to native Profiles (§3.1-3.2), so it inherits all of that mechanism's isolation gaps for AI config files. [Profiles in VS Code](https://code.visualstudio.com/docs/configure/profiles)

**(d) Per-workspace/per-profile GitHub account switching (auth isolation, narrower than full config isolation):**

VS Code explicitly supports using **different GitHub accounts for Copilot per workspace or per profile** — via Accounts menu → "Manage Extension Account Preferences" → pick account for "GitHub Copilot Chat" extension, and "this configuration is saved per workspace and per profile." [Set up GitHub Copilot in VS Code](https://code.visualstudio.com/docs/setup/copilot) This solves the "I want dotnet-work Copilot billed to my work org, frontend-hobby Copilot billed to personal" auth-identity problem specifically, but is a narrower concern than full config/history isolation.

**(e) Workspace-level `.instructions.md`/`.agent.md` as a *pseudo*-isolation mechanism:**

Since instructions/custom-agent files can be scoped to a workspace (`.github/instructions/`, `.github/agents/`) rather than the user profile, one workaround for "specialty" behavior without touching Profiles at all is: put dotnet-specific instructions/agents in the dotnet repo's `.github/` folder, and frontend-specific ones in the frontend repo's `.github/` folder. This achieves *behavioral* specialization scoped to **the repo**, not to **an identity/profile you can switch between arbitrary repos with** — i.e., it solves a different axis of the problem (per-project customization, which Claude Code also has via `.claude/`) rather than the "one runtime home, many repos" axis that `CLAUDE_CONFIG_DIR` solves.

### 3.6 Verdict / synthesis for Q3

| Isolation need | Native Profiles | `--user-data-dir` (+ `--extensions-dir`) | Multiple installs (Stable/Insiders/Portable) |
|---|---|---|---|
| Extensions | ✅ (with opt-out via "apply to all profiles") | ✅ (must reinstall) | ✅ |
| User/workspace `chat.*` settings | ✅ | ✅ | ✅ |
| MCP servers (user-level) | ✅ (v1.102+) | ✅ | ✅ |
| BYOK / language model config | ✅ (newer resource type) | ✅ | ✅ |
| `.github/copilot-instructions.md`, `AGENTS.md` | ❌ (workspace-file, not profile-scoped — tracked in open issue #290374) | ❌ (same — these are repo files) | ❌ (same) |
| User-level `.instructions.md`/`.agent.md` | ⚠️ partial/ambiguous (stored in profile dir but not switch-aware per open issue) | ✅ (different root entirely) | ✅ |
| Chat/conversation history | ❌ (confirmed global, issue #306502) | ✅ likely (different user-data root = different session storage; medium confidence, inferred) | ✅ confirmed (different products/dirs) |
| GitHub account/auth identity | ✅ (per-workspace-and-profile, explicitly supported) | ✅ | ✅ |
| Setup friction | Low (native UI) | Medium (manual flags/shortcuts, must reinstall exts) | Low (Stable/Insiders) to Medium (portable) |

**Bottom line:** For a true "one fully-isolated Copilot runtime home per specialty" analogous to `CLAUDE_CONFIG_DIR`, **`--user-data-dir` (optionally paired with `--extensions-dir`) is the closest and most complete mechanism available today**, not native Profiles — because Profiles explicitly do not isolate chat history or AI instruction/agent files (this is an open, acknowledged product gap as of 2026-07-25, tracked in `microsoft/vscode#290374`). Native Profiles are the *lower-friction, lower-completeness* option, good enough if your isolation need is "different extensions + different MCP servers + different model keys" but insufficient if you also need "different chat history" or "instructions/agents that follow me regardless of which repo I open."

---

## 4. Custom instructions

**Confidence: high | Checked: 2026-07-25**

### File types and hierarchy

VS Code/Copilot supports three tiers of "always-on or auto-attached" instruction files, per the (very current, recently restructured) official doc [Use custom instructions in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-instructions):

1. **`.github/copilot-instructions.md`** (single file, repo root) — "VS Code automatically detects a `.github/copilot-instructions.md` Markdown file in the root of your workspace and applies the instructions in this file to all chat requests within this workspace." No frontmatter, no `applyTo` — it's unconditionally global-to-workspace. Recommended starting point for "project-wide coding standards."
2. **`*.instructions.md` files** (path-specific, can be many) — Markdown with optional YAML frontmatter:
   ```yaml
   ---
   name: 'Python Standards'            # optional, defaults to filename
   description: 'Coding conventions for Python files'   # optional, shown on hover
   applyTo: '**/*.py'                  # optional glob; if omitted, NOT auto-applied (manual-only)
   ---
   ```
   Default discovery location is `.github/instructions/`, but `chat.instructionsFilesLocations` setting can add more search paths. Multiple comma-separated globs are supported in `applyTo` (e.g. `"**/*.ts,**/*.tsx"`). [add-repository-instructions (docs.github.com)](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions?tool=vscode)
3. **`AGENTS.md`** — explicitly positioned by VS Code's own docs as the choice "if you work with multiple AI agents in your workspace" (i.e., a cross-tool-compatible convention, shared with Claude Code/Codex/etc.), as opposed to the Copilot-specific `copilot-instructions.md`. A newer setting, `chat.useNestedAgentsMdFiles`, suggests support for **nested** `AGENTS.md` files at different directory depths (mirroring how some other agent tools resolve `AGENTS.md` hierarchically) — found in a real `.vscode/settings.json` sample but not yet in the primary docs page text captured; flagging **medium confidence** on the exact nesting semantics, high confidence that the setting exists.

### Applying instructions in Copilot code review

Separately, `docs.github.com/en/copilot/tutorials/customize-code-review` documents that Copilot's **code review** feature (a related but distinct surface from VS Code chat) supports the same three file types (`copilot-instructions.md`, `*.instructions.md`, `AGENTS.md`) with a suggested directory convention:
```
AGENTS.md
.github/
  copilot-instructions.md
.github/instructions/
  python.instructions.md
  javascript.instructions.md
  security.instructions.md
  api.instructions.md
```
[customize-code-review](https://docs.github.com/en/copilot/tutorials/customize-code-review)

### Real-world naming variance (from GitHub code search, confirms convention adoption but also inconsistency)

A live `search_code` query for `filename:copilot-instructions.md path:.github` returned **58,984 total results** confirming this is an extremely widely-adopted convention. Notably, path **casing varies wildly** in the wild (`.GitHub/`, `.gitHub/`, `.Github/`, `.GITHUB/` all appear in real, indexed repos) — since GitHub's filesystem is case-insensitive on the default branch view for most platforms but git itself is case-sensitive, this is evidence that VS Code/Copilot's file-discovery for this convention is **case-insensitive on typical developer OSes (macOS/Windows)** in practice, though this specific claim about the discovery mechanism's case-sensitivity was not found stated explicitly in docs — **confidence: low** on the mechanism, **high** on the empirical observation that these variously-cased paths exist and presumably work for their authors. Example real repos found: `linsalrob/OligoDesigner`, `Skadie26/GitHub-Copilot-Playground`, `Adept-Team-OS/OSRS.github.io`. [GitHub code search, live query 2026-07-25]

A `*.instructions.md` search (6,128 total results) shows real adoption of the `applyTo`-glob pattern beyond docs, e.g. `microsoft/apm` (`.apm/instructions/cli.instructions.md`), `psake/PowerShellBuild` (`instructions/shorthand.instructions.md`), `orneryd/Mimir` (`.agents/repo.instructions.md`) — note **non-standard locations** (`.apm/`, `.agents/`, bare root) also appear, meaning `chat.instructionsFilesLocations` customization or manual/on-demand attachment (rather than auto-`applyTo`-triggered) is common in the wild. [GitHub code search, live query 2026-07-25]

### Known bug/gotcha: instructions silently ignored

A dated-but-current (May 2026) troubleshooting post catalogs the actual failure modes seen on the `microsoft/vscode` and `microsoft/vscode-copilot-release` issue trackers for "Copilot ignores my instructions":

1. Wrong VS Code setting disabled (instructions feature itself, or the specific mode not honoring instructions)
2. File in the wrong location for the *mode* being used (Ask vs. Agent behave differently re: which files get attached)
3. `applyTo` glob relies on **files being attached to the chat request**, not simply "the file you're editing" — "In Ask mode this happens automatically when you have the file open and your prompt references 'this file.' In Agent mode it happens when the agent's own file-read tool attaches the file. In neither case does it happen because you opened a tab."
4. Silent YAML frontmatter parse errors cause the whole instructions file to be skipped with no visible error.

Recommended debug technique: put a sentinel string at the top of the instructions file and ask Copilot Chat to recite it back; check the "References" section of a chat response to confirm which instructions files were actually loaded into context. [Fix: GitHub Copilot Ignores Repository Custom Instructions in VS Code](https://startdebugging.net/2026/05/fix-github-copilot-ignores-repository-custom-instructions-in-vs-code/)

### "Default agent" selection equivalent

No literal "default agent" *selection* setting was found in the sense of "which named custom agent runs by default" — however, adjacent concepts exist:
- `target: vscode` vs `target: github-copilot` frontmatter on `.agent.md` files controls *where* an agent definition is usable (see §5) — this is a "which environment," not "which default," distinction.
- The `/create-instructions` slash command and a documented "generate an instructions file" onboarding flow effectively establishes copilot-instructions.md as the de facto "default always-on persona" for a workspace, functionally similar to a "default agent" even though VS Code doesn't use that term for it. [Customize AI for your project](https://code.visualstudio.com/docs/copilot/guides/customize-copilot-guide)

---

## 5. Custom chat modes / custom agents

**Confidence: high | Checked: 2026-07-25**

### THE RENAME: `.chatmode.md` → `.agent.md` (VS Code 1.106)

This is a major finding **not present** in the local reference doc (dated 2026-07-06, which still only discusses "Custom" as an undifferentiated concept and doesn't mention this rename at all) — meaning the rename happened very recently, likely between the local doc's compile date and now.

> "Custom agents are available as of VS Code release 1.106. Custom agents were previously known as custom chat modes." [Custom agents in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-agents)

> "Chat modes have been renamed to custom agents throughout VS Code to better align with terminology used in other environments." [VS Code 1.106 release notes](https://github.com/microsoft/vscode-docs/blob/2e31a7ce/release-notes/v1_106.md)

**Backward compatibility**: existing `.chatmode.md` files in `.github/chatmodes/` **continue to work** and are automatically treated as custom agents — no breakage — but VS Code shows a quick-fix info marker on the first line of an old file offering one-click migration to the new `.agent.md` format/location. New commands: **Chat: New Custom Agent...** and **Chat: Configure Custom Agents...** (replacing older chat-mode-named commands).

### File format and structure

`.agent.md` files are Markdown with YAML frontmatter, default location **`.github/agents/`** for workspace-shared agents. Structure/fields (synthesized from the 1.106 release notes + `custom-agents.md` doc):

```yaml
---
name: 'code-reviewer'                # overrides label without renaming file
description: 'Read-only code reviewer'
target: vscode                       # "vscode" | "github-copilot"
model: gpt-5.5                       # optional model override; omit to use user's selected model
tools: ['codebase', 'search', 'fetch']  # tool/toolset restriction
argument-hint: 'PR number or branch name'
handoffs: ['triager', 'fixer']       # NEW: wires guided transitions to other named agents
mcp-servers: {...}                   # only meaningful for target: github-copilot
---

<body: the agent's system-prompt-like instructions>
```

**The `target` property is new and important**: `target: vscode` optimizes for local chat and unlocks `name`, `description`, `argument-hint`, `model`, `tools`, `handoffs` — "any tool installed in VS Code can be used." `target: github-copilot` prepares the *same file* for use as a Copilot cloud agent or via the GitHub CLI, supporting `name`, `description`, `tools`, `mcp-servers`, `target`, where `tools` can be `edit`, `search`, `shell`, `custom-agent`, or MCP-server-provided tools. "All agents can be run in all environments. Each environment ignores unknown attributes and tools." [1.106 release notes](https://github.com/microsoft/vscode-docs/blob/2e31a7ce/release-notes/v1_106.md)

**`handoffs`** is a genuinely novel multi-agent-workflow primitive: it "wires guided transitions to other agents, letting you chain multi-step workflows" — this is VS Code's answer to something like LangGraph-style agent handoff, built into the native custom-agent file format.

### Location/scope table (from official docs)

| Scope | Default file location |
|---|---|
| Workspace | `.github/agents/` folder |
| Workspace (Claude-compat format) | `.claude/agents/` folder — **explicit interop with Claude Code's own convention** |
| User profile | `~/.copilot/agents/` or "your user data (specific to your VS Code profile)" |

[Custom agents in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-agents)

Additional search paths configurable via `chat.agentFilesLocations` setting — useful for centralizing agents outside a single workspace or sharing across projects.

### How they're invoked

- Selected from the **agent picker** dropdown in the Chat view (same UI location as the built-in Ask/Plan/Agent mode picker — custom agents appear alongside/within that picker).
- Command Palette: **Chat: New Custom Agent...**, **Chat: New Mode File** (older/transitional naming still seen in some UI), **Chat: Configure Custom Agents...**.
- Can be referenced from **prompt files** (`*.prompt.md`) — a prompt file can specify which chat mode/custom agent should run it, and as of a slightly earlier VS Code release, prompt files gained the ability to reference *custom* modes/agents (not just built-in `agent`/`edit`/`ask`), with IntelliSense autocompletion for custom mode/agent names inside prompt files. [microsoft/vscode-copilot-chat CHANGELOG](https://github.com/microsoft/vscode-copilot-chat/blob/main/CHANGELOG.md)
- To avoid tool-name collisions between built-in tools and MCP-server/extension-provided tools, prompt files and custom agents now support **fully qualified tool names**.

### Real-world adoption (GitHub code search evidence)

- Live query for `.chatmode.md` under `.github/chatmodes` (legacy format, still enormously common): repos found include `microsoft/vscode-jupyter` (`.github/chatmodes/bugfix.chatmode.md`), `Azure-Samples/Copilot-Studio-with-Azure-AI-Search` (`adr.chatmode.md`), `momentum-design/momentum-design` (`Plan.chatmode.md`), `3MFConsortium/gladius` (`research.chatmode.md`) — confirms the legacy convention is still extremely widely deployed in real repos as of the search date, consistent with the "still works, not yet migrated" backward-compat story. [GitHub code search, live query 2026-07-25]
- Live query for `.agent.md` under `.github/agents` (new format): repos found include `syl20bnr/spacemacs` (`.github/agents/don.agent.md`), `whyour/qinglong` (`ql.agent.md`), `SAP-samples/hana-developer-cli-tool-example` (`mcp.agent.md`), and a personal "kitchen sink"-style repo (`Nickolai-Brennan/xXx_BlueprintZ`) with multiple specialized agents (`api-architect.agent.md`, `postgresql-dba.agent.md`, `expert-react-frontend-engineer.agent.md`, `markdown-accessibility-assistant.agent.md`) — this last repo is a good concrete illustration of the exact "specialty agent per domain" pattern the user's research context cares about, implemented at the workspace level via the new format. [GitHub code search, live query 2026-07-25]
- A third-party template repo (`Capgemini/template-github-copilot`) has an explicit deprecation README in its `.github/chatmodes/README.md`: *"⚠️ DEPRECATED: As of October 2025, GitHub renamed 'Chat Modes' to 'Agents'... This directory is maintained for backward compatibility with VS Code, but new development should use the `.github/agents/` directory."* This independently corroborates an **October 2025** rename announcement date (via [GitHub's changelog announcement](https://github.blog/changelog/2025-10-28-custom-agents-for-github-copilot/)), preceding VS Code's own 1.106 adoption of the new terminology — i.e., **GitHub.com/Copilot-the-product renamed the concept in Oct 2025, and VS Code followed with its own `.agent.md`-format/UI rename in release 1.106** (exact 1.106 ship date not independently confirmed in this research pass, but framed as "the current release" in docs checked 2026-07-25). [Capgemini/template-github-copilot README](https://github.com/Capgemini/template-github-copilot/blob/main/.github/chatmodes/README.md)

---

## 6. MCP integration

**Confidence: high | Checked: 2026-07-25**

### Config file location and schema

MCP server config lives in a JSON file named **`mcp.json`**, NOT in `settings.json` — this was an explicit, deliberate design choice ("MCP servers no longer live in `settings.json`—VS Code moved them to a dedicated `mcp.json`"):

- **Workspace**: `.vscode/mcp.json` — "Include this file in source control to share MCP server configurations with your team."
- **User profile**: a `mcp.json` inside the active profile's storage — opened via Command Palette **`MCP: Open User Configuration`**. "When you use multiple profiles, each profile can have its own MCP server configuration" (this directly confirms the §3 finding that MCP config IS one of the things Profiles correctly isolate).
- **Remote**: `MCP: Open Remote User Configuration` for a separate remote-scoped file when connected to SSH/WSL/Devcontainer/Codespaces — "MCP servers run wherever they are configured... If you're connected to a remote and want a server to run on the remote machine, define it in the workspace settings or remote user settings."

[Add and manage MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers), [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)

### Schema

```jsonc
{
  "servers": {                         // NOTE: top-level key is "servers", NOT "mcpServers"
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp"
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@microsoft/mcp-server-playwright"],
      "env": { "API_KEY": "${input:api-key}" },
      "cwd": "${workspaceFolder}"
    }
  },
  "inputs": [                          // optional: prompted secrets, never stored in plaintext in the file
    { "id": "api-key", "type": "promptString", "password": true }
  ],
  "sandbox": {}                        // optional: file-system/network sandbox rules for the server, macOS/Linux only
}
```

Field reference: `type` (`stdio` | `http` | `sse`), `command`, `args`, `env` (supports `${input:id}`, `${env:VAR}`, `${workspaceFolder}` variable substitution), `cwd`, `url`, `headers`, `envFile`, `dev` (dev-mode file-watch config), `sandboxEnabled` (macOS/Linux only). [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)

### Explicit divergence from Claude Code's `.mcp.json`

A third-party comparison blog (`contextbolt.com`, checked as a secondary source since it directly and correctly matches the primary-source schema found above) states the key practical porting gotcha plainly: **"The root key is `servers`, not `mcpServers`. Different from Claude Desktop, Cursor, and Windsurf"** (and, this research adds: different from Claude Code's `.mcp.json`, which also uses `mcpServers`). This means a raw copy-paste of a `.mcp.json`/Claude-style config into `.vscode/mcp.json` requires a top-level key rename to work. [VS Code MCP: Setup, Servers, and the 2026 Stack](https://contextbolt.com/blog/vscode-mcp-setup/) — corroborated structurally by the official schema doc above (high confidence on the key-name difference itself, since it's directly visible in the official example).

Also of note: VS Code's `mcp.json` has **first-class IDE support** — full IntelliSense/schema validation when editing the file directly in VS Code, code-lens inline actions for starting/stopping/restarting servers, and a **built-in MCP server gallery** browsable via the Extensions view (`MCP: Browse MCP Servers`) — this "gallery" concept (a curated, in-IDE discoverable marketplace of MCP servers) doesn't have a direct Claude Code equivalent in the same UI-integrated form as far as this research could determine (not independently deep-dived for Claude Code in this stream, since that's presumably Stream 1's territory).

### Governance/enterprise controls specific to MCP

- `chat.mcp.access`: `true`/`false` or, under **managed/enterprise policy** specifically, an enum of `"all"` | `"registry"` — controls which **sources** MCP servers can be installed from (an allowlist-of-registries knob), gated by VS Code policy `ChatMCP`. **Correction/nuance surfaced by a live GitHub issue discussion**: a contributor researching this for a cross-tool config-sync tool (`rulesync`) explicitly corrected a misconception that `chat.mcp.access` does per-tool-call approval — it does not; it's a server-installation-source gate. Per-MCP-*tool*-call auto-approval instead goes through the separate `chat.tools.eligibleForAutoApproval` setting (policy-oriented, meaningful mainly in managed/enterprise contexts, not a typical per-repo `.vscode/settings.json` knob). [dyoshikawa/rulesync Issue #1547](https://github.com/dyoshikawa/rulesync/issues/1547) — this is a nuanced, easy-to-get-wrong distinction and is flagged here explicitly so it isn't conflated in synthesis.
- `chat.mcp.discovery.enabled`: auto-discovery of MCP config **from other applications** (i.e., VS Code can detect and offer to import MCP servers already configured for some other tool on the machine) — default `false` per the AI settings reference.
- `chat.mcp.gallery.enabled`: toggles the in-IDE MCP server gallery/marketplace browsing feature.
- `chat.mcp.autoStart`: `"newAndOutdated"` (default) — auto-starts MCP servers when config changes are detected, vs. requiring manual start.
- `chat.mcp.serverSampling`: `{}` — configures which language models are exposed **to** MCP servers for sampling (i.e., governs servers calling back into the model, an MCP protocol feature).
- **"MCP Apps"** (experimental, `chat.mcp.appsEnabled`, defaulting `true` per the settings reference snippet captured): "rich user interfaces provided by MCP servers" — suggests VS Code has started supporting some form of MCP-server-rendered UI surfaces beyond plain text/tool-call chat turns, though this research did not find a dedicated deep-dive doc page for this feature — **confidence: low-medium**, flagged as an open question below.

### Real-world adoption evidence

Live GitHub code search for `filename:mcp.json path:.vscode` returned **3,484 total results**. Notable finds: `inspec/inspec` (a real, established open-source project, `.vscode/mcp.json` committed to the repo for team sharing — exactly the documented "commit it to share with your team" workflow), plus a long tail of `.template`/`.example`/`.sample` variants (e.g. `SCStelz/security-investigator`, `tivaliy/mcp-xray`, `pablosalvador10/northwestern-fy26-msai-foundry-agentic-ai`) indicating teams commonly commit a **template** version (to avoid committing secrets/API keys directly) rather than the live file — a real-world pattern not explicitly prescribed by the official docs but clearly a convention that's emerged, presumably because `inputs`/`${input:id}` secret-prompting wasn't always sufficient or known-about early on. [GitHub code search, live query 2026-07-25]

---

## 7. Extensibility: Copilot Extensions, Skills, plugin-packaging analogues

**Confidence: high | Checked: 2026-07-25**

### Copilot Extensions platform — SUNSET, not current

Critical, hard finding: the GitHub-App-based **"Copilot Extensions" platform was sunset on November 10, 2025.** A dedicated tracking page states plainly: *"Deprecated. GitHub App-based Copilot Extensions were sunset on November 10, 2025. Build MCP servers instead."* [GitHub Copilot Extensions for AI Agent Development — AgentPatterns.ai, "Last reviewed: 2026-06-13... Archived — kept for reference"](https://agentpatterns.ai/tools/copilot/copilot-extensions/)

This means: **any research, tutorial, or mental model built around "Copilot Extensions" (Skillsets, Agent Extensions, GitHub-App-backed chat participants reachable via `@`-mention across all Copilot surfaces) describes a platform that no longer accepts new development as of the sunset date.** The successor path GitHub explicitly recommends is **MCP servers**. Historical shape, for context/comparison purposes only (do not build against this):
- **Skillsets**: lightweight, up to 5 declared API endpoints; Copilot handled query→skill-selection→API-call→response-formatting automatically.
- **Agent extensions**: full custom-prompt, multi-turn, hosted-service-backed chat participants.
- Auth used OIDC (short-lived signed JWTs verified against GitHub's JWKS) rather than the older `X-GitHub-Token` model.
- Mutual exclusivity: one extension could not be both a skillset and an agent.

### The extension mechanism that DOES matter today: VS Code's own Chat Participant API

This is a **different, still-current** mechanism — a VS Code **extension** (installed `.vsix`, built with the standard `vscode` extension API, NOT a hosted GitHub App) can register a **Chat Participant**:

```typescript
vscode.chat.createChatParticipant(id: string, handler: ChatExtendedRequestHandler): ChatParticipant
```

Users invoke it by `@`-mentioning it in the Chat view (VS Code ships built-in participants like `@vscode`, `@terminal`, `@workspace` as examples of the pattern). The request handler receives the user's natural-language prompt, can stream a response, manage conversation history, and call the **Language Model API** (`vscode.lm.selectChatModels(...)`) to generate answers using whichever model the user has selected (including BYOK models) rather than hardcoding a specific provider. Extensions can declare a `disambiguation` property in `package.json` (description + examples per detection category) so VS Code can auto-route relevant queries to the participant **without** requiring an explicit `@`-mention. [Chat Participant API | VS Code Extension API](https://code.visualstudio.com/api/extension-guides/ai/chat)

Newer/proposed-API additions found directly in the `vscode-copilot-chat` source (not yet necessarily stable/finalized public API, flagged accordingly):
- `ChatParticipant.onDidChangePauseState` / pause-unpause of in-flight requests
- `participantVariableProvider` — lets a participant register custom `@`-completions/variables scoped only to itself
- A `vscode.chat.plugins` / `onDidChangePlugins` proposed API surfaced in a real, recent PR (`microsoft/vscode-copilot-chat#4962`, "feat: wire plugins through CopilotCLI customization provider") — this indicates an emerging, generic **"Plugins" concept inside VS Code's own chat customization UI**, distinct from both the old GitHub-App Extensions and from MCP servers, apparently intended to let the **Copilot CLI's own plugin system** (which does have a `plugin.json`-rooted manifest format per the local reference doc, §2 of that doc) surface its plugin resources inside VS Code's chat customization picker too. This is very fresh (an in-flight PR, not a shipped/documented feature) — **confidence: low**, flagged as an open question below for what "VS Code chat plugins" will mean once it ships. [PR #4962](https://github.com/microsoft/vscode-copilot-chat/pull/4962)

### "Skills" equivalent — CONFIRMED, and it's the SAME `SKILL.md` convention used elsewhere (cross-tool standard)

This is an important finding: **VS Code Copilot's "Agent Skills" is not a bespoke VS Code thing — it explicitly implements the open, cross-vendor "Agent Skills specification"** (`github.com/agentskills/agentskills`), the same convention referenced in the local kitchen-sink doc for other tools (Claude Code, Codex, OpenCode) and explicitly interoperable with Anthropic's own skills repo:

> "Agent skills are folders of instructions, scripts, and resources that Copilot can load when relevant... The Agent Skills specification is an open standard, used by a range of different AI systems. You can create your own skills... or use skills shared online, for example in the `anthropics/skills` repository." [about-agent-skills (docs.github.com)](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)

**Locations** (project vs. personal, and note the explicit **multi-tool-compatible path aliasing** — VS Code will discover skills placed for Claude Code or the generic "Agents" convention too):

| Skill type | Locations |
|---|---|
| Project (repo-scoped) | `.github/skills/`, `.claude/skills/`, `.agents/skills/` |
| Personal (cross-project, user-level) | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |

[docs/copilot/customization/agent-skills.md (vscode-docs)](https://github.com/microsoft/vscode-docs/blob/36ba054f/docs/copilot/customization/agent-skills.md), also [about-agent-skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)

**`SKILL.md` frontmatter fields**: `name` (required; lowercase+hyphens; **must match parent directory name**; max 64 chars), `description` (required; must describe *both* capability and *when to use it*; max 1024 chars — explicitly to aid the model's automatic relevance-based discovery/loading), plus optional `license`, `compatibility`, `metadata` (arbitrary k/v), `allowed-tools` (space-separated pre-approved tool list), `argument-hint`, `user-invocable` (default `true`, shows as a `/`-slash command), `disable-model-invocation` (default `false`; set `true` to force manual-only invocation).

**Progressive-loading design** (a deliberate token-economy feature, described consistently across sources): (1) Discovery — agent reads only `name`+`description` (~100 tokens) to decide relevance; (2) Instructions — full `SKILL.md` body loads (<5000 tokens recommended) only if relevant; (3) Resources — linked `scripts/`, `references/`, `assets/` files load only when the agent actually follows a reference to them. Best practices explicitly documented: keep `SKILL.md` under 500 lines, use keyword-rich descriptions, keep resource references one level deep. [vscode-copilot-chat skills reference](https://github.com/microsoft/vscode-copilot-chat/blob/main/assets/prompts/skills/agent-customization/references/skills.md)

**Skill vs. Custom Agent — official guidance on when to use which**, straight from VS Code's own internal agent-customization skill-selection prompt: *"Same capabilities for all steps → Skill. Need context isolation (subagent returns single output) or different tool restrictions per stage → Custom Agent."* [same source]

**Community distribution exists**: `github/awesome-copilot` is an official-org-maintained curated skill/instructions/agent collection, installable via **`gh skill` in GitHub CLI** (`gh skills install github/awesome-copilot <skill-name>`, requires GitHub CLI v2.90.0+) — a real package-manager-like distribution flow. [awesome-copilot README.skills.md](https://github.com/github/awesome-copilot/blob/main/docs/README.skills.md), [about-agent-skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)

**Real-world adoption confirmed via live search**: `filename:SKILL.md path:.github/skills` found real, established OSS repos using it, e.g. **`Z3Prover/z3`** (`.github/skills/prove/SKILL.md`), **`microsoft/fast`** (`.github/skills/rust/SKILL.md`), **`primer/react`** (`.github/skills/slots/SKILL.md`) — notable because these are prominent, well-known engineering orgs, evidencing real (not just toy/demo) production adoption. Also found significant filename-casing/convention drift in the wild (`skill.md` lowercase, `SKILL.MD` all-caps extension, `patch.skill.md`/`qa.skill.md` reversed-order naming, `rag-SKILL.md` hyphenated) — suggesting the ecosystem tooling is more lenient about exact casing than the spec's stated `name`-must-match-folder rule might imply, or that some of these are simply non-conformant/broken skill definitions nobody's validated. [GitHub code search, live query 2026-07-25]

### Plugin-manifest-analogue for VS Code Copilot specifically

No VS Code-Copilot-specific equivalent of a root `plugin.json` (the kind the local kitchen-sink doc documents for Copilot **CLI**, Claude Code, and Codex) was found for the **VS Code extension** surface — because VS Code already has its own, much older, general-purpose extension-packaging convention (`package.json` + `.vsix`, the standard VS Code Extension API), and Copilot-specific customization within a *workspace* (as opposed to a shipped VS Code extension) is composed instead from the individually-scoped file conventions covered in §4/§5/§6/§7 (`copilot-instructions.md`, `*.instructions.md`, `*.agent.md`, `mcp.json`, `SKILL.md`) rather than one unifying manifest. This is a **structural difference from Copilot CLI** (which per the local reference doc does have a unifying `plugin.json` with `agents`/`skills`/`hooks`/`mcpServers`/`lspServers` keys) — VS Code Copilot's workspace-level customization is **decomposed across multiple independent, individually-discovered files/folders** rather than centralized in one manifest. The one place a manifest-like registry appears is the emerging `vscode.chat.plugins` proposed API (see above), which is not yet documented/stable enough to confirm its final shape.

---

## 8. Hard constraints / gotchas

**Confidence: high | Checked: 2026-07-25**

### Model picker / BYOK

- **BYOK (Bring Your Own Key)** launched/expanded through 2026: "Copilot Business and Enterprise users can now use bring your own language model key (BYOK) in Visual Studio Code," supporting Anthropic, Gemini, OpenAI, OpenRouter, Azure, plus **local** models via Ollama and Foundry Local. [GitHub Changelog, 2026-04-22](https://github.blog/changelog/2026-04-22-bring-your-own-language-model-key-in-vs-code-now-available/)
- BYOK models "work without signing into a GitHub account and without a Copilot plan" — full offline/local-model scenarios are explicitly supported and documented (a meaningful capability for privacy-sensitive or air-gapped setups). [AI language models in VS Code](https://code.visualstudio.com/docs/agent-customization/language-models)
- BYOK does **not** apply to inline code-completion suggestions — only to Chat. Usage is billed directly by the chosen provider and does **not** count against Copilot request quotas. [same source]
- Org admins can **disable** BYOK entirely via the "Bring Your Own Language Model Key in VS Code" policy (enabled by default) on github.com. [same source]
- **Tool-calling requirement for agent mode**: "If a model does not support tool calling, it will not show up in the model picker when you are in an agent session" — a real, sharp constraint when configuring a custom/BYOK model (must explicitly set `"toolCalling": true` in the model provider config AND the underlying model must actually support it). [Adding Model Providers to GitHub Copilot and VS Code](https://zlarsen.cloud/posts/2026-07-06-model-providers-copilot-vscode/)
- **Utility models**: when using BYOK *without* a GitHub sign-in, VS Code's small internal background-task models (used for things like chat title generation) have no default — you must configure `chat.utilityModel` / `chat.utilitySmallModel` yourself or VS Code will show a nagging notification. [Use your own language model key in VS Code (blog)](https://code.visualstudio.com/blogs/2026/06/18/byok-vscode)

### Context window management

- Context window = `maxInputTokens` + `maxOutputTokens`, both required fields per configured BYOK model, and **"must not exceed the model's context window"** as documented by the actual provider — VS Code does not independently validate/clamp this against ground truth, it trusts your config. [AI language models in VS Code](https://code.visualstudio.com/docs/agent-customization/language-models)
- **Known bug/gotcha, found via a footnoted correction in a secondary source**: "For models configured via the `customendpoint` vendor, these values are correctly honored; however, using the built-in `openai` vendor may cause VS Code to ignore your configured limits in favor of its own internal metadata." [zlarsen.cloud, footnote 6, referencing an underlying issue not independently re-verified in this pass] — flagging **confidence: medium** since this is a secondary-source claim not cross-checked against a primary GitHub issue in this research pass, but it's a specific, falsifiable, plausible claim worth surfacing for anyone hitting unexplained context-truncation with an `openai`-vendor BYOK config.
- `chat.utilityModel`/`chat.utilitySmallModel` context management is separate from the main chat context and easy to overlook (see above).

### Auto-approval / "YOLO mode" and its enterprise lockability

Already covered in §1/§2 but worth restating as a "gotcha": `chat.tools.global.autoApprove: true` is a one-line settings change that disables essentially all per-action confirmation — StackOverflow answers show this is a commonly-sought and commonly-applied setting for smoother long-running agent sessions, but VS Code's own docs flag it plainly: *"this setting disables critical security protections."* Org admins should know the `ChatToolsAutoApprove` policy exists specifically to prevent developers from doing this on managed devices.

### Settings Sync behavior across machines/profiles — the single biggest surprise gotcha

Already covered in depth in §3.4, restated here as the headline "gotcha" answer to Q8: **Settings Sync does NOT sync Copilot chat history**, and this is an explicit, maintainer-confirmed, "out of scope" product decision (`microsoft/vscode#306502`), not a bug awaiting a fix. It doesn't even sync between **Stable and Insiders on the same physical machine** (`microsoft/vscode-copilot-release#14118`, filed Feb 2026 — recent). The only cross-device mechanism is the one-way `chat.sessionSync.enabled` push to github.com's Agents tab (view-only there, does not round-trip). Anyone assuming "Settings Sync = my whole Copilot setup including conversations follows me everywhere" **will be wrong** and should budget for this when designing a multi-machine or multi-profile workflow.

### Other constraints/gotchas noted in passing

- `chat.agent.maxRequests` (iteration cap, commonly hit and raised by users per StackOverflow evidence) — a silent stopping point for long agent loops that isn't always obvious until you hit it mid-task.
- Portable Mode's `data/` folder **silently overrides** both `--user-data-dir` and `--extensions-dir` if all three are somehow in play — a footgun for anyone building a custom multi-instance launcher script.
- Extensions must be manually reinstalled for every distinct `--user-data-dir` — real ongoing maintenance cost for the "specialty runtime home" pattern from §3, versus Profiles' "apply extension to all profiles" convenience feature.
- `.chatmode.md` files that still exist un-migrated will keep working indefinitely (no forced-migration deadline found in any source), but new tooling/docs increasingly assume `.agent.md`, so search results/community content will bifurcate for a while.

---

## Open questions / could not verify

1. **Exact VS Code version/date 1.106 shipped**, and therefore the exact timeline of the chatmode→agent rename relative to "today" (2026-07-25). Docs describe it as available "as of VS Code release 1.106" and reference it in a `v1_106.md` release-notes file, but this research did not independently pin down the calendar ship date for 1.106 nor confirm what the *current* VS Code version is as of the check date. Given VS Code ships roughly monthly, if 1.106 is more than a few months old, there may be an even newer rename/feature layered on top that this research missed.
2. **`chat.useNestedAgentsMdFiles` exact semantics** — found the setting name in a real-world `.vscode/settings.json` sample (dev.to article) but did not find/verify the dedicated docs paragraph explaining exactly how nested `AGENTS.md` resolution works (precedence between a repo-root `AGENTS.md` and a subdirectory `AGENTS.md`, for instance).
3. **`chat.mcp.appsEnabled` / "MCP Apps" feature** — found only in a settings-reference table entry ("rich user interfaces provided by MCP servers," Experimental, default `true`) with no accompanying deep-dive doc page located in this research pass. Unclear what UI surface this actually produces or which MCP protocol extension it maps to.
4. **`vscode.chat.plugins` proposed API** (from PR #4962) — this is clearly in-flight, unshipped/undocumented as stable, and its final relationship to (a) Copilot CLI's own `plugin.json` system and (b) VS Code's existing Skills/Custom-Agents/MCP trio is unclear. Worth re-checking in a future pass once it ships or gets a docs page.
5. **Whether `--user-data-dir` truly isolates chat history** — reasoned as highly likely from architecture (separate user-data root ⇒ separate workspaceStorage ⇒ separate chat session store) and corroborated indirectly by the Stable-vs-Insiders evidence (different install ⇒ different history), but no single source explicitly tested/stated "chat history is isolated by `--user-data-dir` specifically" as opposed to "by being a different VS Code product variant." Flagged as medium- rather than high-confidence in §3.5(a).
6. **Exact behavior of case-insensitive `.github/` path discovery** for `copilot-instructions.md` — empirically many differently-cased real-world paths exist and (presumably) function, but no doc explicitly states the file-discovery logic is case-insensitive; this could equally be explained by GitHub.com's web UI/API normalizing case in a way that doesn't reflect actual git blob paths, or by these repos' instructions files simply not being loaded/working for their authors without them realizing it. Not resolved with high confidence either way.
7. **Whether the local kitchen-sink doc's Copilot **CLI** claims (not VS Code) need updates in light of anything found here** — out of scope for this stream (this stream is VS Code-extension-only per the assignment), but the sharp product/branding overlap between "Copilot CLI" and "Copilot in VS Code" (e.g., the shared managed-settings system, the `target: github-copilot` custom-agent frontmatter, the `.claude/agents/` compat folder) suggests Stream 1/3 or a future synthesis pass should cross-check whether the CLI-specific doc is also affected by the Oct 2025 chat-modes→agents rename.
8. **Precise scope of "Enterprise" vs. "Business" plan gating** for individual features (BYOK policy, managed settings, MCP registry restrictions) — docs consistently say "Business and Enterprise" without always clarifying if a given control is available to both tiers identically or if Enterprise unlocks strictly more; not independently tested against GitHub's own plan-comparison page in this research pass.

---

## Sources

### Official Microsoft/VS Code documentation
- https://code.visualstudio.com/docs/agents/agent-types/local-agents
- https://code.visualstudio.com/blogs/2025/02/24/introducing-copilot-agent-mode
- https://code.visualstudio.com/docs/agent-customization/custom-instructions
- https://code.visualstudio.com/docs/copilot/guides/customize-copilot-guide
- https://code.visualstudio.com/docs/agent-customization/custom-agents
- https://code.visualstudio.com/docs/agent-customization/mcp-servers
- https://code.visualstudio.com/docs/agents/reference/mcp-configuration
- https://code.visualstudio.com/docs/configure/profiles
- https://code.visualstudio.com/docs/configure/command-line
- https://code.visualstudio.com/docs/setup/copilot
- https://code.visualstudio.com/docs/enterprise/ai-settings
- https://code.visualstudio.com/docs/agents/reference/ai-settings
- https://code.visualstudio.com/docs/agent-customization/language-models
- https://code.visualstudio.com/blogs/2026/06/18/byok-vscode
- https://code.visualstudio.com/api/extension-guides/ai/chat
- https://github.com/microsoft/vscode-docs/blob/main/docs/editing/getting-started.md (via Context7 `/microsoft/vscode-docs`)
- https://github.com/microsoft/vscode-docs/blob/main/docs/configure/command-line.md (via Context7)
- https://github.com/microsoft/vscode-docs/blob/main/docs/setup/copilot.md (via Context7)
- https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_114.md (via Context7)
- https://github.com/microsoft/vscode-docs/blob/2e31a7ce/release-notes/v1_106.md
- https://github.com/microsoft/vscode-docs/blob/36ba054f/docs/copilot/customization/custom-agents.md
- https://github.com/microsoft/vscode-docs/blob/36ba054f/docs/copilot/reference/mcp-configuration.md
- https://github.com/microsoft/vscode-docs/blob/36ba054f/docs/copilot/customization/agent-skills.md
- https://github.com/microsoft/vscode-copilot-chat/blob/main/CHANGELOG.md
- https://github.com/microsoft/vscode-copilot-chat/blob/main/src/extension/conversation/vscode-node/chatParticipants.ts
- https://github.com/microsoft/vscode-copilot-chat/blob/5863f5a7/src/extension/vscode.proposed.chatParticipantAdditions.d.ts
- https://github.com/microsoft/vscode-copilot-chat/pull/4962
- https://github.com/microsoft/vscode-copilot-chat/blob/main/assets/prompts/skills/agent-customization/SKILL.md
- https://github.com/microsoft/vscode-copilot-chat/blob/main/assets/prompts/skills/agent-customization/references/skills.md
- https://github.com/microsoft/vscode/blob/234229df/src/vs/platform/userDataProfile/common/userDataProfile.ts
- https://github.com/microsoft/vscode/blob/234229df/.github/skills/add-policy/github-managed-settings.md
- https://github.com/microsoft/vscode/issues/290374
- https://github.com/microsoft/vscode/issues/306502
- https://github.com/microsoft/vscode-copilot-release/issues/991
- https://github.com/microsoft/vscode-copilot-release/issues/14118

### Official GitHub (docs.github.com / github.blog) documentation
- https://docs.github.com/en/copilot/how-tos/chat-with-copilot/chat-in-ide?tool=vscode
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions?tool=vscode
- https://docs.github.com/en/copilot/tutorials/customize-code-review
- https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings
- https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- https://github.blog/ai-and-ml/github-copilot/copilot-ask-edit-and-agent-modes-what-they-do-and-when-to-use-them/
- https://github.blog/changelog/2026-04-22-bring-your-own-language-model-key-in-vs-code-now-available/
- https://github.blog/changelog/2026-07-08-deploy-managed-copilot-settings-via-mdm-in-vs-code-and-cli/
- https://github.blog/changelog/2025-10-28-custom-agents-for-github-copilot/ (referenced secondhand via Capgemini README, not directly fetched)

### GitHub code search (live, real-world repo evidence, queried 2026-07-25 via `user-github` MCP `search_code`)
- `filename:copilot-instructions.md path:.github` (58,984 results) — e.g. https://github.com/linsalrob/OligoDesigner, https://github.com/Skadie26/GitHub-Copilot-Playground
- `extension:agent.md path:.github/agents` (11,944 results) — e.g. https://github.com/Nickolai-Brennan/xXx_BlueprintZ, https://github.com/syl20bnr/spacemacs, https://github.com/SAP-samples/hana-developer-cli-tool-example
- `filename:mcp.json path:.vscode` (3,484 results) — e.g. https://github.com/inspec/inspec
- `extension:instructions.md applyTo` (6,128 results) — e.g. https://github.com/microsoft/apm, https://github.com/psake/PowerShellBuild, https://github.com/orneryd/Mimir
- `extension:chatmode.md path:.github/chatmodes` — e.g. https://github.com/microsoft/vscode-jupyter, https://github.com/momentum-design/momentum-design, https://github.com/Capgemini/template-github-copilot
- `filename:SKILL.md path:.github/skills` — e.g. https://github.com/Z3Prover/z3, https://github.com/microsoft/fast, https://github.com/primer/react
- https://github.com/github/awesome-copilot/blob/main/docs/README.skills.md
- https://github.com/dyoshikawa/rulesync/issues/1547
- https://github.com/Capgemini/template-github-copilot/blob/main/.github/chatmodes/README.md

### Third-party / secondary sources (used only where no primary source existed, or to corroborate/find real-world usage patterns; treated with appropriately lower confidence)
- https://dev.to/stacknotice/github-copilot-agent-mode-complete-guide-2026-1p8k
- https://startdebugging.net/2026/05/fix-github-copilot-ignores-repository-custom-instructions-in-vs-code/
- https://policylayer.com/integrations/vscode
- https://contextbolt.com/blog/vscode-mcp-setup/
- https://agentpatterns.ai/tools/copilot/copilot-extensions/
- https://zlarsen.cloud/posts/2026-07-06-model-providers-copilot-vscode/
- https://dev.to/pwd9000/tune-github-copilot-settings-in-vs-code-32kp
- https://stackoverflow.com/questions/79720577/how-to-automatically-approve-continue-github-copilot-terminal-commands-in-vs-cod
- https://stackoverflow.com/questions/70396384/vscode-what-exactly-user-data-dir-is-specifiying
- https://stackoverflow.com/questions/49667641/launch-vsc-with-clean-or-custom-profile
- https://superuser.com/questions/1449639/is-there-a-way-to-install-vs-code-extensions-only-inside-the-workspace

### Local repository reference (baseline, cross-checked against)
- `/Users/derp/.agents/docs/reference/kitchen-sink-plugins-compare-contrast.md` (dated 2026-07-06)

### Context7 library resolution
- Resolved library IDs: `/microsoft/vscode-docs`, `/microsoft/vscode`, `/websites/code_visualstudio`, `/websites/code_visualstudio_intelligentapps_copilot-tools`, `/aws/aws-toolkit-vscode` (used `/microsoft/vscode-docs` for the two `query-docs` calls in this research)
