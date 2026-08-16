# Component: target-ports

**Responsibility:** Holds the three generated ports of the canonical plugin content —
`targets/codex/`, `targets/cursor/`, `targets/copilot/` — each laid out in its host's
native surface format. Nothing here is authored by hand: `build/build.sh` overwrites the
whole tree from `plugins/*` and `shared/guards/`. Each port re-expresses the same
guardrails at the fidelity its host allows, from near-lossless (Codex) to advisory
(Cursor file edits).

**Boundary:** in — generated skills/agents/rules, per-host hook manifests, copies of
`guard-core.sh`, the Windows `guard-core.ps1` reimplementation, pre-commit + CI wrappers,
fanned-out `AGENTS.md`. out — the canonical sources they derive from (`fintech-plugins`,
`guard-enforcement`) and the generation logic itself (`build-pipeline`). **Never hand-edit
anything under `targets/`.**

## Constituent files

| File | Role |
|------|------|
| `targets/codex/marketplace.json` | Codex-dialect marketplace registry (`source:{source:"local",path}`, `policy`, `category`) |
| `targets/codex/plugins/*/skills/*/SKILL.md` | Claude skills copied verbatim + Claude **agents** converted to skills with `model:`/`tools:` frontmatter stripped (`build/build.sh:15`, `:26-28`) |
| `targets/codex/plugins/*/hooks/hooks.json` | Same hook event names and JSON-on-stdin contract as Claude; guard runs `--dialect codex` (deny = exit 2) |
| `targets/codex/plugins/*/scripts/guard-core.sh` | Copy of the canonical guard (`build/build.sh:29`) |
| `targets/cursor/.cursor/rules/*.mdc` | Lossy port: skills/agents flattened to Cursor rule files (advisory prose, not enforcement) |
| `targets/cursor/.cursor/hooks.json` | Wires `guard-cursor.sh` to `beforeShellExecution` + `beforeMCPExecution` only |
| `targets/cursor/.cursor/hooks/guard-cursor.sh` | Adapter: normalizes Cursor payload → core shape, maps `BLOCKED:` → `{"permission":"deny"}` |
| `targets/cursor/.cursor/hooks/guard-core.sh` | Copy of the canonical guard (`build/build.sh:39`) |
| `targets/copilot/.github/hooks/fintech-compliance.json` | Repo-scope hook manifest: `sessionStart`, `preToolUse`, `postToolUse`, `errorOccurred`, each with `bash` + `powershell` commands |
| `targets/copilot/.github/hooks/scripts/guard-core.{sh,ps1}` | Bash guard copy + full PowerShell reimplementation (Luhn included) — the only Windows-parity target |
| `targets/copilot/.github/agents/*.agent.md` | 18 agents with generated `tools:` tiers assigned by name (`build/build.sh:50-53`) |
| `targets/copilot/scripts/pre-commit`, `.github/workflows/fintech-compliance.yml` | `--dialect plain` gates that close Cursor's write-time gap |
| `targets/{codex,cursor,copilot}/AGENTS.md` | Fanned out from `targets/copilot/AGENTS.md` (`build/build.sh:65`) |

## Lynchpin symbols

| Symbol | Location | Why load-bearing |
|--------|----------|------------------|
| `strip_fm_keys()` | `build/build.sh:15` | Awk frontmatter filter that makes a Claude agent a valid Codex skill |
| Tool-tier `case "$name"` | `build/build.sh:50-53` | `*auditor\|*code-reviewer\|microservice-architect` → `read search` (read-only); everything else gets `read edit search shell`. New reviewer agents must match this naming to stay read-only |
| `AGENTS.md` fan-out loop | `build/build.sh:65` | Single source (`targets/copilot/AGENTS.md`) copied to all three targets |
| Cursor payload normalizer | `targets/cursor/.cursor/hooks/guard-cursor.sh:12` | `jq` remap of `{command,file_path/path,content}` into `{tool_input:{…}}` the core expects |
| Cursor deny mapping | `targets/cursor/.cursor/hooks/guard-cursor.sh:14-17` | Greps `^BLOCKED: ` from `--dialect plain` and emits `permission:"deny"` + agent message |
| Cursor jq-missing fallback | `targets/cursor/.cursor/hooks/guard-cursor.sh:7-10` | Degrades to `permission:"ask"` (softest failure mode of the three ports) |
| `preToolUse` entry | `targets/copilot/.github/hooks/fintech-compliance.json:13-21` | `guard-core.sh --dialect copilot` / `guard-core.ps1`, `cwd:.github/hooks`, 15s timeout; non-zero exit denies, so the guard's fail-closed exit 3 denies automatically |
| `bash -n` sweep | `build/build.sh:74` | Validates every `.sh` including generated ones — a broken port fails the build |

## Dependencies

- **Inbound (who uses this):** Codex CLI, Cursor, and Copilot CLI runtimes; the repo's
  pre-commit hook and the `fintech-compliance.yml` CI job.
- **Outbound (what this uses):** `shared/guards/guard-core.sh` (copied verbatim into every
  target), `plugins/*/agents|skills|scripts` (transformed), `build/build.sh` (the writer).

## Data flow

See [target-ports-dataflow.mmd](target-ports-dataflow.mmd). Output payload summary:
per-host surface trees (Codex skills+hooks, Cursor `.mdc` rules+shell/MCP hooks, Copilot
`.github/hooks`+agents+PowerShell parity) that at runtime emit host-dialect verdicts —
exit 2 (Codex), `{"permission":"deny"}` (Cursor), non-zero exit (Copilot) — plus injected
context and audit JSONL.
