---
description: Audit pending EF Core migrations for lock risk, data loss, and expand-contract violations; emit the change-control SQL artifact
argument-hint: [project path, defaults to the detected Infrastructure project]
---

Target: $ARGUMENTS (if empty, auto-detect the `*.Infrastructure` project)

Delegate to **efcore-data-specialist**:
1. List migrations not yet present in `contracts/migrations/`
2. Classify each operation (additive / destructive / rewriting), estimate lock behavior against production table sizes, flag expand-contract violations per `efcore-migration-safety`
3. Generate `dotnet ef migrations script --idempotent` into `contracts/migrations/<date>-<name>.sql` **and** the paired rollback script — no rollback, no merge
4. Emit the SOX header checklist. Ask me for the actual change-ticket ID before writing the header; do not invent or placeholder it.
