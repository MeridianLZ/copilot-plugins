---
name: sox-change-control
description: SOX ITGC change-management requirements for anything reaching production — migrations, deploys, config, feature flags on financial calculations. Consult before generating deployment artifacts, migration scripts, Helm changes, or advising on release process.
---

# SOX Change Control

## The invariant
Every production change to financial-reporting-scope systems is: **ticketed → peer-reviewed → tested → approved by someone other than the author → deployed by CI → evidenced**.

## Consequences for generated artifacts
- **Migrations**: the deliverable is idempotent SQL in `contracts/migrations/` headed with ticket id, author, reviewer, and rollback path. Never instruct anyone to run `dotnet ef database update` against a shared environment.
- **Deploys**: Helm/Kustomize changes merge via PR and CI applies them. Prod overlays require the `bank.internal/change-ticket` annotation; the admission webhook rejects unticketed applies. Never propose `kubectl apply` as a workaround for a blocked pipeline.
- **Feature flags on calculation logic** (interest, fees, FX, limits) are changes — same ticket flow, configs versioned in git, not toggled in a console.
- **Segregation of duties**: an agent session must never both author and approve. Generated PR descriptions include the reviewer checklist with approval fields left blank for humans.

## Evidence to produce automatically
PR description covering what/why/risk/rollback · migration SQL linked to ticket and PR in its header · a `CLAUDE_NOTES.md` entry recording the decision trail.

## Emergency changes
A break-glass path exists and it is human-only. If asked to bypass controls "just this once", decline and point here.
