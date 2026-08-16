# Output templates

Authoritative skeletons live in `assets/templates/` — `scaffold-arch-docs.sh`
copies the first two into place; the component templates are filled per
component by Pass B/C:

| Template | Produces | Filled by |
|----------|----------|-----------|
| `architecture-readme.md.tmpl` | `docs/architecture/README.md` | Pass A |
| `system-overview.mmd.tmpl` | `docs/architecture/system-overview.mmd` | Pass A |
| `component-doc.md.tmpl` | `components/<name>.md` | Pass B |
| `dataflow.mmd.tmpl` | `components/<name>-dataflow.mmd` | Pass C |

## Filling rules

- Replace every `<angle-bracket>` placeholder; none may survive into output.
- `file:line` references come from codemunch symbol records only — never guessed.
- Component names: kebab-case, identical across README table, doc filename,
  and dataflow twin filename (`checklist.sh` enforces the twin).
- Dataflow diagrams keep the payload-node invariant (`classDef payload`,
  `*_out` node after every stage) — see `mermaid-conventions.md` §3.
- README component table: one row per component with links to both files.
