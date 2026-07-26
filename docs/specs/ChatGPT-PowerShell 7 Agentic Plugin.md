# PowerShell 7 Agentic Plugin

**User:** Anonymous  
**Created:** 7/19/2026 21:36:12  
**Updated:** 7/19/2026 21:38:46  
**Exported:** 7/26/2026 12:56:03  
**Link:** [https://chatgpt.com/c/6a5d97ab-a1a0-83ea-976b-bd9ce2c9c223](https://chatgpt.com/c/6a5d97ab-a1a0-83ea-976b-bd9ce2c9c223)  

## Prompt:
7/19/2026, 9:36:11 PM

Web search, use context seven, and GitHub code search for the state of the art as of today's date. I need to make a agentic plugin, use the plugin dev skill, to container agent, MD files, references, hooks, and skills related to general PowerShell 7 agentic instruction and context, as well as custom organizational patterns, uses, and scripts.

## Response:
7/19/2026, 9:36:12 PM

I’m going to research the current Claude Code/plugin architecture, PowerShell 7 agent-instruction patterns, and real GitHub implementations, then synthesize a concrete plugin structure with agents, hooks, references, and reusable skills.

The current official model is clear: package this as a versioned Claude Code plugin, keep agent personas in `agents/*.md`, put reusable procedures in progressively disclosed `skills/*/SKILL.md`, and reserve hooks for deterministic policy/context injection rather than duplicating the instructional corpus.

I’m treating “container agent MD files” as “contain agent `.md` files.” I’m also making the plugin cross-platform, but PowerShell 7-native: hook entrypoints invoke `pwsh`, scripts use strict mode, and validation is driven by PSScriptAnalyzer rather than shell-only wrappers.

> **Searching official docs for Claude, PowerShell, GitHub**
>
> [PSScriptAnalyzer module - PowerShell | Microsoft Learn](https://learn.microsoft.com/en-us/powershell/utility-modules/psscriptanalyzer/overview?view=ps-modules)
> [Create plugins - Claude Code Docs](https://code.claude.com/docs/en/plugins)
> [claude-code/plugins/plugin-dev/skills/hook-development/SKILL.md at main · anthropics/claude-code · GitHub](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md)
> [Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems](https://arxiv.org/abs/2604.14228)
>
> **Searched official docs, learn.microsoft, Code Claude, GitHub, Arxiv**
>
> 
>
> **Resolved library ID and retrieved plugin-dev skill conventions**
>
> 
>
> **Searched GitHub repository for PowerShell examples and references**
>
> 
>
> **Searching for PowerShell agent plugin resources on GitHub**
>
> [everything-claude-code/README.md at main · affaan-m/everything-claude-code · GitHub](https://github.com/affaan-m/everything-claude-code/blob/main/README.md)
> [Using hooks with GitHub Copilot CLI - GitHub Docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
>
> **Searched for PowerShell agent plugin resources on GitHub**
>
> 
>
> **Created PowerShell plugin with organizational patterns**
>
> 
>
> **Checking versions of pwsh, claude, and git**
>
>
> **Checked versions of pwsh, claude, and git, cloned repositories**
>
> 
>
> **Creating and packaging PowerShell plugin**
>
>
> **Created and packaged PowerShell plugin and fixed hook schema**
>
> 
>
> Worked for 2m 14s

## PowerShell 7 agentic plugin scaffold

I built a complete Claude Code plugin containing:

- Four specialist agent definitions:
  - `powershell-architect`
  - `powershell-automation-engineer`
  - `powershell-reviewer`
  - `powershell-incident-responder`
- Five progressively disclosed skills:
  - PowerShell 7 core conventions
  - Module development
  - Testing and quality
  - Organizational patterns
  - Remoting and operations
- Shared organizational and reusable script-pattern references
- A `SessionStart` hook that injects project-specific PowerShell context
- A `PostToolUse` hook that analyzes changed `.ps1`, `.psm1`, and `.psd1` files
- PowerShell-native validation scripts
- PSScriptAnalyzer configuration
- Project-local configuration example
- Installation, development, and invocation documentation

[Download the complete PowerShell Agentic plugin](sandbox:/mnt/data/powershell-agentic-plugin.zip)

The unpacked source is also available here:

[Browse the plugin source directory](sandbox:/mnt/data/powershell-agentic/README.md)

## Research findings applied

### 1. Native plugin architecture

Claude Code plugins now directly support skills, agents, hooks, MCP servers, LSP servers, settings, and executable helpers. Skills are discovered from `skills/<name>/SKILL.md`, while agents are discovered from `agents/*.md`. Plugins are the appropriate distribution mechanism when the same capability must work across repositories and teams. ([code.claude.com](https://code.claude.com/docs/en/plugins?utm_source=chatgpt.com))

The plugin follows this structure:

```text
powershell-agentic/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   ├── powershell-architect.md
│   ├── powershell-automation-engineer.md
│   ├── powershell-incident-responder.md
│   └── powershell-reviewer.md
├── skills/
│   ├── powershell-core/
│   ├── module-development/
│   ├── organization-patterns/
│   ├── remoting-and-operations/
│   └── testing-and-quality/
├── hooks/
│   └── hooks.json
├── scripts/
├── references/
├── examples/
├── PSScriptAnalyzerSettings.psd1
└── README.md
```

### 2. Progressive disclosure rather than giant instruction files

Current skill architecture favors three levels of context:

1. Skill metadata is always available for routing.
2. The `SKILL.md` body loads when the skill activates.
3. References and scripts load only when the task requires them.

This avoids injecting the entire PowerShell corpus into every request while still preserving detailed organizational guidance. Current guidance also recommends keeping the primary skill concise and moving deeper material into references. 

Accordingly, the scaffold keeps:

- Operational instructions in `SKILL.md`
- Detailed PowerShell semantics in skill-local references
- Organization-wide policy in shared top-level references
- Deterministic behavior in executable scripts

### 3. Agents and skills have separate responsibilities

The agents define specialist judgment, scope, priorities, and review behavior. Skills contain reusable procedures and technical conventions.

For example:

- The architect decides module boundaries, compatibility strategy, configuration precedence, and public contracts.
- The automation engineer performs implementation.
- The reviewer independently checks API fidelity, security, error semantics, and test evidence.
- The incident responder performs evidence-first diagnosis without prematurely changing production state.

This follows the current community pattern of using agents as specialized reasoning contexts rather than pretending they are independently trained models. 

### 4. Hook registration avoids the duplicate-hook trap

The manifest intentionally does **not** declare:

```json
{
  "hooks": "./hooks/hooks.json"
}
```

Current Claude Code versions convention-load `hooks/hooks.json`. Explicitly registering that same path can cause duplicate hook execution or duplicate-file validation failures. This has caused repeated regressions in mature community plugins. 

### 5. PowerShell-native hook execution

Hook commands use:

```text
pwsh -NoLogo -NoProfile -File "..."
```

This provides:

- PowerShell 7 rather than Windows PowerShell 5.1
- Independence from user profile side effects
- Cross-platform behavior on Windows, Linux, and macOS
- A single implementation language for plugin automation

Claude Code’s recent releases have also expanded their native PowerShell-tool behavior and corrected several Windows command matching and output issues. 

### 6. PSScriptAnalyzer is a gate, not a cosmetic formatter

The plugin uses PSScriptAnalyzer for both static correctness and organizational consistency. PSScriptAnalyzer supports PowerShell 7 and checks issues including uninitialized variables, credential handling, `Invoke-Expression`, formatting, and many other community-maintained rules. 

The included settings enable:

- Default analyzer rules
- Error and warning severity
- `Write-Host` detection
- Consistent indentation and whitespace
- Command and keyword casing
- Redundant line-ending semicolon detection

The latter is a newer opt-in analyzer rule documented in June 2026. 

## Hook behavior

### `SessionStart`

The session hook reads:

```text
.claude/powershell-agentic.local.md
```

It extracts a deliberately constrained set of non-secret values:

```yaml
targetPowerShell: 7.4
supportWindowsPowerShell: false
moduleLayout: PublicPrivate
organization: braisenly
analyzerSettings: PSScriptAnalyzerSettings.psd1
testPath: tests
```

It then adds a concise context statement rather than injecting the entire settings document.

### `PostToolUse`

After `Write` or `Edit`, the plugin:

1. Reads the hook JSON from standard input.
2. Identifies the edited file.
3. Ignores non-PowerShell files.
4. Locates project-level analyzer settings.
5. Runs PSScriptAnalyzer against the changed file.
6. Returns diagnostics as additional agent context.
7. Never automatically rewrites or “fixes” source code.

That last point is intentional: hooks report deterministic evidence, while the agent remains responsible for understanding and correcting the root cause.

## Validation

The artifact was structurally checked for:

- Valid `plugin.json`
- Valid `hooks/hooks.json`
- Required files
- Expected directory structure
- Archive integrity

The current execution environment does not have `pwsh` or the `claude` executable installed, so I could not execute:

```powershell
claude plugin validate ./powershell-agentic
pwsh -NoLogo -NoProfile -File ./powershell-agentic/scripts/Invoke-PluginValidation.ps1
```

Those are the first two commands to run locally after extraction. Recent Claude Code releases have improved `claude plugin validate` so it now checks agent, skill, and command frontmatter along with hook schemas.

---

**Sources:**

- [everything-claude-code/README.md at main · affaan-m/everything-claude-code · GitHub](https://github.com/affaan-m/everything-claude-code/blob/main/README.md?utm_source=chatgpt.com)
- [PSScriptAnalyzer module - PowerShell | Microsoft Learn](https://learn.microsoft.com/en-us/powershell/utility-modules/psscriptanalyzer/overview?view=ps-modules&utm_source=chatgpt.com)



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)