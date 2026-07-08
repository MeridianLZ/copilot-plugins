# Copilot Surface Map — where every artifact lives

Reference for `fintech-copilot-install`. Paths verified against GitHub Docs and the
`github/copilot-cli` issue tracker as of July 2026. Re-verify before relying on any
line marked BUG — those are open upstream issues.

## Discovery paths

### Hooks
| Scope | Path |
|---|---|
| Repository | `.github/hooks/*.json` |
| User | `~/.copilot/hooks/*.json` |
| Plugin | `<plugin>/hooks.json` — **BUG: preToolUse does not fire (#2540)** |

Cloud agent requires the config on the **default branch**.

### Skills
| Scope | Paths |
|---|---|
| Repository | `.github/skills/`, `.claude/skills/`, `.agents/skills/` |
| User | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| Explicit | `skill_directories` in `~/.copilot/config.json` |

Each skill is a directory containing `SKILL.md` (required), plus optional
`scripts/`, `references/`, `assets/`. Directory names lowercase-hyphenated.

Note: `~/.agents/skills/` is NOT discovered by some CLI versions even though VS Code
reads it (#2230). If skills installed by a VS Code extension are invisible to the CLI,
add the path to `skill_directories` or symlink into `~/.copilot/skills/`.

### Agents
| Scope | Path |
|---|---|
| Repository | `.github/agents/*.agent.md` |
| User | `~/.copilot/agents/` |

Frontmatter: `name`, `description`, `tools[]`. Invoked with `/agent`.

### Instructions
| File | Behavior |
|---|---|
| `.github/copilot-instructions.md` | Copilot-specific, always-on |
| `AGENTS.md` | Cross-tool open standard, always-on |

## Hook events

| Event | Can block? | Notes |
|---|---|---|
| `sessionStart` | No | Output ignored; **BUG: ordering/stdout unreliable (#2201, #1730)** |
| `sessionEnd` | No | |
| `userPromptSubmitted` | No | Can return `modifiedPrompt` |
| `preToolUse` | **Yes** | `allow` \| `deny` \| `ask` |
| `postToolUse` | No | Can return `modifiedResult` |
| `errorOccurred` | No | |
| `agentStop` | No | |
| `permissionRequest` | **Yes** | Fires before the permission service; CLI only, not cloud agent |

## preToolUse contract

Input on stdin: `toolName`, `toolArgs` (object **or** JSON-encoded string), `cwd`, `timestamp`.

Output on stdout:
```json
{ "permissionDecision": "deny", "permissionDecisionReason": "..." }
```

Failure semantics — the important part:
- exit 2, crashes, and other non-zero exits **fail closed and deny**
- **exit 2 denies even if stdout says `allow`**
- **timeouts fail open** — keep hooks fast
- first `deny` short-circuits remaining hooks

Config entries take both `bash` and `powershell` keys; Copilot selects by OS.

## Known open issues shaping this track
- `#2540` plugin-defined `preToolUse` hooks never fire
- `#2392` `preToolUse` not enforced in subagents
- `#2201`, `#1730` `sessionStart` ordering and stdout
- `#2230` `~/.agents/skills/` not in default CLI discovery
- `#1819` (JetBrains) input rewrites ignored — deny-with-suggestion is the only workaround there
