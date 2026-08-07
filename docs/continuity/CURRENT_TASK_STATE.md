# CURRENT TASK STATE

_Last updated: 2026-08-07 (scope: copilot-home plugin + persona MCP tools; supersedes 2026-08-06 "trace-UI conversation replica" state — that work merged to main via PR-equivalent merges `cfdb37f`/`8786d33`)_

## Where things stand

**Everything is merged to `main` (`d94ec4c`) and pushed.** Two workstreams landed today:

1. **copilot-home Copilot CLI plugin** — built in worktree `/Volumes/MACDEV/fable-medium_copilot_plugin` (branch `fable-medium_copilot_plugin`, merged to main): `copilot-plugin/` with 7 agents (primary-orchestrator, csharp-azure-architect, foundry-sdk-implementer, ai-research-engineer + peers Chewy/Buzz/Goose), each agent = `.agent.md` (full frontmatter) + system-prompt/specialized_role/mission fused assets; 22 skills + 22 TOML slash evokers; dual-lane hooks (plugin `${PLUGIN_ROOT}` workaround + `.github` projection payload); agent_blackboard (append-only JSONL/session, trace_id = md5(session_id)); `~/.copilot` user-scope templates + installer skill; `docs/injection-and-projection.md`; root `.github/plugin/marketplace.json` (marketplace `copilot-home-marketplace`).

2. **copilot-mcp persona tools** (branch `feat/copilot-otel-replica`, merged): `chewy`/`buzz`/`goose` MCP tools (12 → 15) pin an SDK custom agent per session (`customAgents` + `agent` select-at-create, `infer:false`); personas fused at startup from `COPILOT_MCP_PERSONA_DIR` (default = the worktree's `copilot-plugin/agents` — cross-tree dependency, deliberate); identity preamble fix (`d2c1fa1`) so peers introduce as Chewy/Buzz/Goose, not "Copilot"; proper-noun capitalization sweep (`c9cfb48`/`b6022a4`, prose only — machine identifiers stay lowercase).

**Live-fire verified** (stdio MCP client, real Copilot turns): identity by name, session persistence, distinct role fidelity, readonly write denied, sanitized events, 500-event ring cap, timeout guard, clean destroy; four-way 6-round debate with by-name cross-referencing and accurate cross-memory; blackboard audit 32 lines, 0 malformed, stable trace_id. `copilot-mcp` registered in Claude Code user scope (`claude mcp add`, ✔ Connected) — native `mcp__copilot-mcp__*` visible after session restart.

## Immediate next step

**In flight:** locate the four-way persona conversation in OTel traces and open the trace-UI conversation replica (copilot-otel-bridge, port 14329) displaying it. Peer sessions live in `~/.copilot/session-state/{271242fd…,14e5787f…,fb7022cb…}` (disconnected, not deleted; native `events.jsonl` present).

Then: optional — plugin live-install into Copilot CLI (`copilot plugin marketplace add`), phase-2 OTel exporter tailing the blackboard JSONL.

## Key decisions (2026-08-07)

- Persona mechanism = SDK `customAgents` + `agent` pin + `infer:false` (NOT systemMessage-only, NOT prompt-prefix); `systemMessage {mode:"replace"}` forbidden — SDK documents it as removing security guardrails.
- Persona SSoT = plugin markdown, loaded at server startup; identity preamble prepended in code (`personas.ts`) because the CLI's built-in identity section wins self-introductions otherwise.
- Proper nouns capitalized in prose only; identifiers (tool names, dirs, frontmatter name/handoffs, slugs, `--peers` values, `agent_name` payloads) stay lowercase.
- Blackboard stays naive-baseline JSONL (the peers themselves voted NO-GO on a temporal-KG replacement in live testing — reasons matching the ai-research-engineer persona: replayability, boring-on-purpose).
