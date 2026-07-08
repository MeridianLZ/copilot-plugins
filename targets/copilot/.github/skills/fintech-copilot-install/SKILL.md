---
name: fintech-copilot-install
description: How the fintech compliance track is installed, distributed, and governed under GitHub Copilot — the four distribution shapes (repo-scope, user-scope, gh skill, org policy), which artifact goes where, precedence and reload semantics, and the plugin-hook bug that dictates the layout. Consult when installing this track, onboarding a repo or developer, debugging hooks or skills that do not load, or deciding user-scope vs repo-scope for a given artifact.
---

# Installing the Fintech Track under Copilot

There is no single "install" — Copilot discovers four artifact classes from different locations with different trust properties. Getting this wrong is the usual reason "the hooks don't fire" or "my skill isn't loading."

## The artifact map

| Artifact | Repo scope (team, via git) | User scope (personal) | Enforcing? |
|---|---|---|---|
| **Hooks** | `.github/hooks/*.json` | `~/.copilot/hooks/*.json` | **Yes** — `preToolUse` denies tool calls |
| **Custom agents** | `.github/agents/*.agent.md` | `~/.copilot/agents/` | No — persona + tool grants |
| **Skills** | `.github/skills/<name>/SKILL.md` | `~/.copilot/skills/<name>/SKILL.md` | No — model-selected guidance |
| **Instructions** | `.github/copilot-instructions.md`, `AGENTS.md` | — | No — always-on context |

Copilot also reads `.claude/skills/` and `.agents/skills/` at repo scope, and `~/.claude/skills/` and `~/.agents/skills/` at user scope. That cross-compatibility is why one skill directory can serve several agent hosts.

## Why this track is NOT a Copilot plugin

Copilot has a plugin system (`config.json` → `installed_plugins`), and it would be the obvious home for this. Do not use it here.

**Plugin-defined `preToolUse` hooks in a plugin's `hooks.json` do not fire** — `github/copilot-cli#2540`, open as of CLI 1.0.18. The plugin's skills load correctly; only its hooks are silently ignored. Packaging this track as a plugin produces a config that *looks* installed, loads its skills, and enforces nothing. For a PCI/SOX control that failure mode is unacceptable, so hooks ship as repo-scope `.github/hooks/`.

Re-test that issue before moving to a plugin layout. If it closes, the migration is mechanical.

## The four distribution shapes

### 1. Repo scope via git — the default for this track
```bash
cp -r targets/copilot/.github <repo>/.github
cp targets/copilot/AGENTS.md <repo>/AGENTS.md
git add .github AGENTS.md && git commit -m "Add fintech compliance track" && git push
```
Every collaborator gets hooks, agents, and skills on `git pull`. **No per-developer install step.** The policy is version-controlled, diffable, and reviewable in PRs — which is exactly what SOX change control wants. This is the only shape where enforcement is guaranteed for the whole team.

For the Copilot **cloud agent** (issue/PR-triggered), the config must exist on the **default branch** to take effect. A hook added in a feature branch does not govern cloud-agent runs until merge.

### 2. User scope — personal, cross-repo
```bash
mkdir -p ~/.copilot/hooks ~/.copilot/skills
cp .github/hooks/fintech-compliance.json ~/.copilot/hooks/
cp -r .github/skills/* ~/.copilot/skills/
```
Applies to every repo you touch. Useful for a consultant working across several banking clients, or as a personal backstop when a repo hasn't adopted the track. Not auditable by the team — never treat user scope as the control of record.

### 3. `gh skill` — package-manager distribution (skills only)
GitHub CLI v2.90.0+ ships `gh skill` (public preview), which treats skills as installable packages following the agentskills.io spec:
```bash
gh skill preview <org>/<skills-repo> fintech-backend-conventions   # ALWAYS inspect first
gh skill install <org>/<skills-repo> fintech-backend-conventions@v1.2.0
gh skill install <org>/<skills-repo> <skill> --agent claude-code --scope user
gh skill update --all
```
Install writes provenance into the SKILL.md frontmatter (source repo, ref, git tree SHA), and `gh skill update` compares local SHAs against upstream to detect drift. Pinned skills are skipped by `update --all`, so upgrades stay deliberate.

**Pin every skill by tag or SHA in CI.** Skills are executable instructions; an unpinned skill is a live dependency on someone else's `main`.

`gh skill` handles **skills only** — it does not distribute hooks or agents. It resolves the correct directory per agent host, so the same command serves Copilot, Claude Code, Cursor, Codex, and Gemini CLI.

### 4. Organization policy — enterprise rollout
Publish the track to an internal skills repository, tag it, and enable tag protection plus immutable releases (`gh skill publish` offers to configure these and validates against the spec). Consumers pin to tags. Combine with repo-scope hooks committed by a platform team so application repos inherit enforcement rather than opting into it.

## Precedence and loading

- **Hooks**: user-scope and repo-scope configs both load. Multiple `preToolUse` hooks run in order and **the first `deny` short-circuits** — remaining hooks are skipped. Composition is safe: adding this track alongside another policy hook cannot weaken either.
- **Skills**: discovered and selected *by the model* from the description. There is no whitelist, blacklist, or priority setting — you cannot force a skill to load. Influence it by writing a sharp `description`, or by promoting the content to `AGENTS.md` if it must always apply.
- **Reload**: hooks load at CLI **startup** — restart after editing. Skills support `/skills reload` in-session; verify with `/skills info <name>`.
- **Disable without deleting**: `disableAllHooks` keeps config on disk but stops execution — for debugging. Never leave it set in a repo that carries compliance hooks.

## Verifying the install actually works

Do not assume. Confirm enforcement:
```bash
jq --version                        # missing jq ⇒ guard exits non-zero ⇒ every tool call denied
copilot                             # restart to load hooks
/skills info fintech-copilot-install
```
Then ask the agent to run `kubectl delete pod x`. Expect a denial citing the change-control ticket requirement. If it executes, the hook is not loaded — check the file is at `.github/hooks/`, the JSON has `"version": 1`, and the scripts are executable.

Audit trail lands in `$COPILOT_FINTECH_AUDIT_DIR` (default `~/.copilot-fintech-audit`). Do not commit it.

## Supply-chain warning

**Skills are not verified by GitHub** and may contain prompt injections, hidden instructions, or malicious scripts. Always `gh skill preview` before installing, and review skill diffs like production code. Be especially careful with `allowed-tools`: pre-approving `shell` or `bash` removes the confirmation step and lets an attacker-controlled skill run arbitrary commands. Omit them and make Copilot ask.

In a regulated environment, treat an internal, tag-protected skills repository as the only approved source, and require review for `allowed-tools` changes the same way you'd review an IAM policy.
