# Fintech Engineering — Agent Instructions

Cross-tool baseline (AGENTS.md open standard). Read by Copilot, Codex, Cursor, Gemini CLI, Aider, Zed, and others.
Tool-specific depth: Claude Code → plugin skills · Codex → `.codex/` plugins · Cursor → `.cursor/rules/`.

## Compliance regimes in force
PCI-DSS v4.0 · SOX ITGC · SOC 2 Type II · GLBA/FFIEC. These are obligations, not preferences.

## Hard rules — never violate
1. Never write, log, echo, or commit a PAN, CVV, SSN, or full account number, including in tests. Use tokenized fixtures (`tok_test_visa`, `4111-TEST-MASK`).
2. Money is `decimal` (C#) or `string` + ISO 4217 currency (wire/TS). Float or double near an amount is a defect.
3. The ledger is append-only. Corrections are new reversal entries. Never `UPDATE` or `DELETE` a posted entry.
4. Secrets come from the vault via External Secrets. Never inline connection strings, keys, or client secrets.
5. Migrations ship as reviewed idempotent SQL with a paired rollback. Never `Database.Migrate()` in production startup, never `dotnet ef database update` against a shared environment.
6. Cluster mutations (`kubectl apply/delete`, `helm install/upgrade`) go through CI with a change ticket. Never run them directly.
7. Every endpoint: named authorization policy, validation, idempotency on mutations, an OTel activity.
8. Frontend: no `dangerouslySetInnerHTML`, no tokens in browser storage (the BFF owns the session cookie), no `react-beautiful-dnd` (unmaintained — use `@dnd-kit/react`).
9. WCAG 2.1 AA is a release gate, not polish. Every drag interaction needs a keyboard path.
10. Never make money movement a drag gesture.

## Enforcement
`.github/hooks/fintech-compliance.json` enforces the deterministic subset of the above via a `preToolUse` hook — tool calls that violate these rules are denied before they execute, not merely discouraged. The same guard also runs as a git pre-commit hook and in CI (`.github/workflows/fintech-compliance.yml`) as defense in depth, which additionally covers subagents (upstream issue #2392).

If the guard cannot run (missing `jq`), it exits non-zero and Copilot fails closed — denying the call rather than silently allowing it.

## Installing / verifying this track under Copilot
Hooks live at `.github/hooks/`, agents at `.github/agents/`, skills at `.github/skills/<name>/SKILL.md`, all committed to git so the team inherits them on pull. **Do not repackage as a Copilot plugin** — plugin-defined `preToolUse` hooks do not fire (`github/copilot-cli#2540`), which would silently disable enforcement. Full detail, including user-scope and `gh skill` distribution, precedence, and verification steps: the `fintech-copilot-install` skill and `copilot-track-installer` agent.

Hooks load at CLI startup — restart after editing. Verify enforcement is live by attempting a blocked command (`kubectl delete pod test`) and confirming denial; never assume from file placement alone.

## Stack
Backend: .NET 9+ · vertical slices · EF Core · Azure Service Bus · SQL Server · Okta/Auth0 BFF · on-prem Kubernetes · OpenTelemetry · xUnit + Testcontainers.
Frontend: React 19 · TypeScript strict · pnpm · Redux Toolkit + RTK Query · `@dnd-kit/react` next-gen · Vitest + Testing Library + MSW · Playwright.
