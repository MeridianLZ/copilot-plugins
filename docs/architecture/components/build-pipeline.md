# Component: build-pipeline

**Responsibility:** Regenerates every non-canonical agent-ecosystem target from the canonical Claude Code plugin trees. It transforms plugin agents/skills into Codex skills and Copilot `.agent.md` files, fans the canonical guard and `AGENTS.md` out to all three targets, and then acts as the repo's single build/lint/test gate by validating every tracked JSON with `jq empty` and every `*.sh` with `bash -n`.

**Boundary:** in — reading `plugins/fintech-{frontend,backend}/` and `shared/guards/`, writing `targets/codex|cursor|copilot/`, frontmatter stripping/rewriting, tool tiering, and the validation gate. out — authoring rule logic (guard-enforcement), hook wiring semantics (fintech-plugins), and anything under `targets/` as an editable source: it is overwritten on every run.

## Constituent files

| File | Role |
|------|------|
| `build/build.sh` | The entire pipeline; 75 lines, `set -euo pipefail`, exits nonzero on any validation failure. |
| `plugins/fintech-{frontend,backend}/` | Canonical input: `agents/*.md`, `skills/*/SKILL.md`, `.mcp.json`, `scripts/*context*.sh`, `audit-log.sh`. |
| `shared/guards/guard-core.sh` | Canonical input fanned out to every target. |
| `targets/copilot/AGENTS.md` | Source of the `AGENTS.md` fan-out (copied over itself and to codex/cursor). |
| `targets/codex/`, `targets/cursor/`, `targets/copilot/` | Generated output trees. |

## Lynchpin symbols

| Symbol | Location | Why load-bearing |
|--------|----------|------------------|
| `ROOT` resolution + `cd "$ROOT"` | `build/build.sh:10` | Every path in the script is repo-relative; the build is runnable from any cwd. |
| `jq` precondition | `build/build.sh:13` | Hard requirement — no `jq`, no build (exit 1), matching the guard's fail-closed stance. |
| `strip_fm_keys()` | `build/build.sh:15` | The Claude→Codex transform: awk state machine that drops `model:`/`tools:` only inside the first frontmatter block. |
| codex loop | `build/build.sh:18` | Per-plugin regeneration; `rm -rf .../skills` at `:19` makes skill output idempotent (stale skills cannot survive). |
| skill copy | `build/build.sh:22` | `SKILL.md` copied verbatim — skills are format-compatible across Claude and Codex. |
| agent→skill conversion | `build/build.sh:26` | Each Claude agent becomes a Codex skill directory containing a frontmatter-stripped `SKILL.md`. |
| guard + `.mcp.json` copy (codex) | `build/build.sh:29` | Guard fan-out and MCP config passthrough; `chmod +x` at `:31`. |
| context/audit script copies | `build/build.sh:33` | `frontend-context.sh`, `backend-context.sh`, `audit-log.sh` carried into codex targets. |
| cursor stage | `build/build.sh:39` | Cursor gets only the guard (`.cursor/hooks/`) — content lives in `.cursor/rules/*.mdc`, which the build does not regenerate. |
| copilot agent loop | `build/build.sh:45` | Emits `.github/agents/<name>.agent.md`; `rm -f` at `:44` clears stale agents first. |
| `name`/`description` extraction | `build/build.sh:48` | Frontmatter values are re-emitted rather than passed through — Copilot needs its own schema. |
| tool-tier `case` | `build/build.sh:50` | Name-driven privilege: `*auditor\|*code-reviewer\|microservice-architect` ⇒ `read search` (read-only); everything else ⇒ `read edit search shell`. New reviewer agents must match this naming to stay read-only. |
| body extraction awk | `build/build.sh:56` | Emits only the post-frontmatter body (`fm>=2`) under the newly written Copilot frontmatter. |
| copilot guard fan-out | `build/build.sh:59` | Canonical guard copied to both `targets/copilot/scripts/` and `.github/hooks/scripts/`; `chmod +x` on `.sh` and `.ps1` at `:62`. |
| `AGENTS.md` fan-out | `build/build.sh:65` | `targets/copilot/AGENTS.md` is the single source copied to all three targets. |
| JSON validation gate | `build/build.sh:69` | `jq empty` over marketplace, plugin, hooks and target JSON — includes `targets/copilot/.github/hooks/*.json`. |
| shell syntax gate | `build/build.sh:74` | `bash -n` over every `*.sh` outside `.git`, generated output included. |
| final verdict | `build/build.sh:75` | `build: OK` or `build: FAILED` + exit 1 — the CI contract. |

## Dependencies

- **Inbound (who uses this):** developers after editing canonical sources (`bash build/build.sh`), CI, and pre-commit (indirectly, via the same validation commands).
- **Outbound (what this uses):** `jq`, `awk`, `sed`, `grep`, `find`, `bash -n`, `cp`/`rm`/`mkdir`/`chmod`; canonical inputs `plugins/*` and `shared/guards/guard-core.sh`.

## Data flow

See [build-pipeline-dataflow.mmd](build-pipeline-dataflow.mmd). Output payload summary:
Regenerated `targets/codex` (skill dirs + guard + `.mcp.json` + context scripts), `targets/cursor/.cursor/hooks/guard-core.sh`, `targets/copilot` (`.agent.md` files with tool tiers + guard in two locations), a fanned-out `AGENTS.md` per target, and a terminal verdict payload `build: OK` (exit 0) or `build: FAILED` (exit 1).
