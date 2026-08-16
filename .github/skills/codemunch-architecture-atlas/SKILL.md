---
name: codemunch-architecture-atlas
description: Use when asked for an architectural breakdown, system map, component inventory, data-flow diagrams, "how does this codebase work", or to generate/refresh docs/architecture. Maps a project with jCodemunch MCP (token-efficient indexed code search), defines its architectural components, and produces a detailed docs/architecture folder — system-level mermaid overview, per-component subdocs with file:line lynchpin functions, and per-component data-flow mermaid diagrams where every component node is followed by a payload node describing its output. Works in Copilot CLI, Claude Code, and any Agent Skills host.
---

# Codemunch Architecture Atlas

Produce a complete, verifiable architectural breakdown of the current repo in `docs/architecture/`, driven by jCodemunch (`mcp__codemunch__*` / `mcp__codemunch-adagio__*` / `mcp__codemunch-backup__*`) instead of brute file reading.

**Read `references/codemunch-recipes.md` before Pass A.** For tool-routing discipline, the [[using-codemunch]] skill (if installed) is authoritative.

## Prerequisites & probes (do these first)

1. **Codemunch available?** Look for `mcp__codemunch*` tools (load via tool search if deferred). If absent entirely: fall back to native search tools but keep the same output contract — the deliverable spec below does not change.
2. **Repo indexed?** `resolve_repo {path:"."}` → if not indexed, `index_folder {path:"."}`.
3. **Mermaid skills/tools probe.** Search installed skills and tools for anything mermaid-related (e.g. a Mermaid validator MCP tool, `render_diagram`, a mermaid skill). Use whatever is found for validation/rendering; only hand-validate as last resort. See `references/mermaid-conventions.md` §4–5.
4. **Scaffold.** Run `scripts/scaffold-arch-docs.sh --repo-root .` to create the `docs/architecture/` skeleton from `assets/templates/`.

## Output contract (non-negotiable deliverables)

```
docs/architecture/
├── README.md                      # index: component table + links + methodology note
├── system-overview.mmd            # whole-system mermaid (subgraph per component)
└── components/
    ├── <component>.md             # per-component breakdown, file:line lynchpins
    └── <component>-dataflow.mmd   # data-flow mermaid WITH payload nodes
```

Every component doc has a dataflow twin. Every component node in a dataflow diagram is immediately followed downstream by a **payload node** describing that component's output payload (shape, format, destination). `scripts/checklist.sh` enforces both invariants — run it before claiming done.

## Pass A — System map

1. `plan_turn {repo, query:"architectural breakdown of this project", model:"<your model id>"}` — obey confidence routing.
2. Gather: `get_repo_outline`, `get_file_tree`, `get_dependency_graph`, `get_architecture_metrics`, `get_coupling_metrics` (+ `get_layer_violations`, `get_dependency_cycles` when supported).
3. **Define components**: cohesive directories/modules with a clear responsibility and boundary. 3–10 for most repos. Name them kebab-case; these names become file names.
4. Write `docs/architecture/README.md` (component table: name, responsibility, key paths, links) and `system-overview.mmd` from `assets/templates/system-overview.mmd.tmpl` — one subgraph per component, edges = real dependencies from the dependency graph, not guesses.

## Pass B — Component deep dives (iterate every component)

For each component (fan out subagents one-per-component when the host supports it — see `agents/component-analyst.agent.md`):

1. `get_file_outline` on the component's files; `get_symbol_importance` / `get_hotspots` scoped to the component to rank symbols.
2. Identify **lynchpin functions/classes** — the symbols the component would not work without. Record exact `path/to/file.ext:LINE` from the symbol records (never guess line numbers; re-check with `get_symbol_source` if unsure).
3. Write `components/<component>.md` from `assets/templates/component-doc.md.tmpl`:
   - Responsibility (2–3 sentences), boundary (what's in/out)
   - Constituent files table (path, role)
   - Lynchpin table (symbol, `file:line`, why it's load-bearing)
   - Inbound/outbound dependencies (from `find_importers` / dependency graph)

## Pass C — Data-flow diagrams (iterate every component)

For each component, trace input → transform → output using `get_call_hierarchy`, `get_signal_chains` (if available), and `get_symbol_source` on the lynchpins. Then write `components/<component>-dataflow.mmd` from `assets/templates/dataflow.mmd.tmpl`:

- Nodes = processing stages (label with `file:line` where a specific function is the stage).
- **Payload-node rule**: after every component/stage node, add its `_out` payload node (`[/"..."/]` shape, `class ... payload`) stating the concrete output payload — return type, JSON shape, file written, exit code, event emitted. Edges run `STAGE --> STAGE_out --> NEXT_STAGE`.
- Full convention + worked example: `references/mermaid-conventions.md` §3.
- Where a flow crosses components, reference the neighbor component by name and stop — the neighbor's own diagram owns its internals.

## Validation (before reporting done)

1. `scripts/validate-mermaid.sh --dir docs/architecture` — syntax check of every `.mmd` and fenced mermaid block (uses installed validator when present; structural lint fallback; never installs heavy tooling).
2. `scripts/checklist.sh --dir docs/architecture` — twin + payload-node invariants.
3. If a mermaid validator/render MCP tool exists, render each diagram once to confirm it parses.
4. Report: component count, files written, validation output, residual gaps (e.g. dynamic dispatch codemunch couldn't trace).

## References

- `references/codemunch-recipes.md` — tool recipes per pass (read before Pass A)
- `references/mermaid-conventions.md` — diagram types, syntax gotchas, payload-node convention (read before writing any `.mmd`)
- `references/copilot-cli-integration.md` — host-specific notes (Copilot CLI discovery, allowed-tools, fallbacks)
- `references/output-templates.md` — exact doc skeletons (mirrors `assets/templates/`)
- `agents/` — specialized subagent profiles: `architecture-cartographer` (Pass A), `component-analyst` (Pass B, fan-out), `dataflow-diagrammer` (Pass C)
