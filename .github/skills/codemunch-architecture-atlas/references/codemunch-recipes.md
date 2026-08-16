# jCodemunch Recipes — Architecture Mapping

Task-shaped recipes for mapping a repo's architecture with `mcp__codemunch__*`.
Authoritative tool rules live in [[using-codemunch]]; this file only sequences them.

**Core rule (from [[using-codemunch]]):** on an indexed repo, never Grep/Read/Glob to *find or understand*
code. `Read` only to open a file you are about to Edit.

**Server rule:** `mcp__codemunch__*` (hosted) is primary — semantic search works there.
`mcp__codemunch-backup__*` (stdio, superset) only on hosted failure or when you need a backup-only tool
(`get_repo_map`, `digest`, `find_hot_paths`, …). `semantic=true` silently degrades to BM25 on backup.
Never `download-model`/`embed_repo` on the local backup (largo disk rule).

---

## 1. Session opening

```json
{"tool":"resolve_repo","args":{"path":"."}}
{"tool":"list_repos","args":{}}                        // if resolve fails
{"tool":"index_folder","args":{"path":"/abs/path/repo"}} // if absent
{"tool":"plan_turn","args":{"repo":"myrepo","query":"map system architecture: components, boundaries, data flow","model":"claude-opus-4-8"}}
{"tool":"suggest_queries","args":{"repo":"myrepo"}}
```

Obey `plan_turn` confidence: **high** → straight to recommended symbols (≤2 extra reads);
**medium** → explore recommended files (≤5 extra); **low** → the thing likely does not exist, report the gap.
Pass your real running model id to `model=`; it only narrows the exposed tool tier.

## 2. System pass — derive components

```json
{"tool":"get_repo_outline","args":{"repo":"myrepo"}}
{"tool":"get_file_tree","args":{"repo":"myrepo","path_prefix":"src"}}
{"tool":"get_dependency_graph","args":{"repo":"myrepo"}}
{"tool":"get_architecture_metrics","args":{"repo":"myrepo"}}
{"tool":"get_coupling_metrics","args":{"repo":"myrepo"}}
{"tool":"get_layer_violations","args":{"repo":"myrepo"}}
{"tool":"get_dependency_cycles","args":{"repo":"myrepo"}}
```

Deriving **components** (cohesive dirs/modules) from these outputs:

1. Seed candidates from `get_file_tree` directories that `get_repo_outline` shows carrying real symbol mass
   (ignore dirs that are only `__init__`/config/test fixtures).
2. Merge/split seeds using `get_coupling_metrics`: high internal cohesion + low efferent coupling → one component.
   A dir whose files each depend on a different cluster is *not* a component — split it along the edges.
3. `get_dependency_graph` gives the edges between components. Direction of the majority of edges = layering.
4. `get_layer_violations` marks edges that break the intended layering → annotate as red edges on the atlas.
5. `get_dependency_cycles` marks SCCs → those files are effectively one component whether you like it or not.
6. `get_architecture_metrics` supplies instability/abstractness per module — use to label a component
   "stable core" vs "volatile edge".

Output of this pass: component list, each with member paths, inbound/outbound components, violations, cycles.

## 3. Component pass — lynchpins with file:line

Per component:

```json
{"tool":"get_file_outline","args":{"repo":"myrepo","file_path":"src/ingest/pipeline.py"}}
{"tool":"get_symbol_importance","args":{"repo":"myrepo","file_pattern":"src/ingest/**","limit":15}}
{"tool":"get_hotspots","args":{"repo":"myrepo","path_prefix":"src/ingest"}}
{"tool":"get_call_hierarchy","args":{"repo":"myrepo","symbol_id":"src/ingest/pipeline.py::run#function","direction":"callees","depth":3}}
{"tool":"get_signal_chains","args":{"repo":"myrepo"}}
{"tool":"find_importers","args":{"repo":"myrepo","file_paths":["src/ingest/pipeline.py"]}}
{"tool":"find_references","args":{"repo":"myrepo","identifiers":["run","Pipeline"]}}
{"tool":"get_symbol_source","args":{"repo":"myrepo","symbol_ids":["src/ingest/pipeline.py::run#function","src/ingest/pipeline.py::Pipeline#class"]}}
```

**Lynchpin heuristic:** a symbol is a lynchpin if it is top-ranked by `get_symbol_importance` (PageRank
centrality) AND appears as an entry node in `get_call_hierarchy(direction="callers")` for several other
components, OR shows up in `get_hotspots` (complexity × churn). Cross-check with `find_importers` count.

**file:line:** every symbol record carries `file_path` plus its line range (`start_line`/`end_line`) — read
those fields off `search_symbols` / `get_file_outline` / `get_symbol_importance` results directly. Do NOT
call `get_file_content` just to count lines. Cite as `src/ingest/pipeline.py:88–141`.

Batch `get_symbol_source` with `symbol_ids[]` — never loop single fetches.

## 4. Data-flow pass — input → transform → output

1. Find the entry symbol (CLI main, HTTP handler, job runner) via `search_symbols` or `plan_turn` recommendations.
2. Walk forward: `get_call_hierarchy {direction:"callees", depth:3-4}` from the entry symbol. Each level is a
   transform stage; stop when you hit I/O, a serializer, or a component boundary.
3. Walk backward from a suspected sink: `get_call_hierarchy {direction:"callers"}` — confirms who feeds it.
4. `get_signal_chains` gives the pre-computed end-to-end chains; use it to sanity-check that the hand-walked
   path is real and to discover chains you did not think to trace.
5. Pull the stage bodies with imports in one call:

```json
{"tool":"get_context_bundle","args":{"repo":"myrepo","symbol_ids":["src/ingest/pipeline.py::run#function","src/ingest/emit.py::write_report#function"],"token_budget":6000,"budget_strategy":"core_first"}}
```

**Characterizing a component's output payload** — from the sink symbol's source, record:
return type annotation / constructed dataclass or TypedDict; literal dict keys assembled before return;
file paths and extensions passed to `open`/`write_text`/`to_csv`; `json.dumps` argument shape; event or
topic names published. Quote the shape as a small schema plus the `file:line` it came from. If the shape is
built across helpers, `get_related_symbols` on the sink surfaces the co-located builders.

## 5. render_diagram

`render_diagram` turns codemunch's own graph data (dependency graph, call hierarchy, tectonic map) into a
diagram without you transcribing node lists — it is faithful to the index and cheap.

```json
{"tool":"render_diagram","args":{"repo":"myrepo","kind":"dependency","path_prefix":"src","format":"mermaid"}}
```

Use `render_diagram` for: raw module dependency graphs, call trees, anything where completeness beats framing.
Hand-write mermaid for: the curated atlas view — grouped components, annotated edges (violation/cycle/data
payload), a chosen level of abstraction, or when you must merge several passes into one picture.
Diagrams must be mermaid/Excalidraw/Eraser/GraphViz — never ASCII.

## 6. Signals & hygiene

- `negative_evidence` + `verdict:"no_implementation_found"` → the thing does not exist. Do **not** re-search
  with synonyms, do **not** assume a nearby file implements it. Record it as a gap in the atlas and move on.
  `related_existing` shows what is nearby, not what exists.
- `_meta.budget_warning` → stop exploring, write the atlas from what you have, and note which components were
  mapped shallowly. `auto_compacted:true` means results were compressed — treat detail as lossy.
- `_meta.confidence` low → do not trust the top hit as the lynchpin; corroborate with `find_importers`.
- `_meta.freshness` / `repo_is_stale:true` → `invalidate_cache` then re-`index_folder` before trusting metrics.
- After any write: `register_edit {file_path, reindex}`; batch all paths for 5+ file edits.
- After context compaction: `get_session_snapshot`. To avoid re-reading: `get_session_context`.
