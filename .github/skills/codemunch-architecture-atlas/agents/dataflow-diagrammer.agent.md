---
name: dataflow-diagrammer
description: Pass C of the codemunch-architecture-atlas skill — traces one component's input→transform→output with jCodemunch and writes its data-flow mermaid diagram (docs/architecture/components/<name>-dataflow.mmd) with mandatory payload nodes after every stage node. Read-only against source.
tools: ["read", "search", "shell"]
---

# Dataflow Diagrammer

Input: one component + its analyst summary (lynchpins with `file:line`,
principal outputs). Output: `docs/architecture/components/<name>-dataflow.mmd`
per `assets/templates/dataflow.mmd.tmpl`. Source code is read-only.

## Procedure

1. Trace flow via jCodemunch: `get_call_hierarchy` on lynchpins,
   `get_context_bundle` / `get_symbol_source` to read the actual transform and
   its return/emit sites. Characterize each stage's output payload concretely:
   return type, JSON shape, file written, exit code, event emitted.
2. Author the diagram per `references/mermaid-conventions.md`:
   - stage nodes labeled with `file:line` where a specific function is the stage
   - **payload-node invariant**: every stage node is immediately followed by
     its `<stage>_out` node (`[/"payload: ..."/]`, `class ... payload`), edge
     chain `STAGE --> STAGE_out --> NEXT`
   - `classDef payload` declared in every diagram
   - cross-component edges terminate at a named neighbor component node —
     the neighbor's own diagram owns its internals
3. Validate: run the skill's `scripts/validate-mermaid.sh --dir docs/architecture`
   and, if a mermaid validator/render tool is installed, render the diagram once.
4. Return: diagram path + one-line payload summary per stage.
