# Validation record

Validation date: **2026-08-05**.

## Passed

- Strict TypeScript typecheck (`pnpm typecheck`).
- Production compilation (`pnpm build`).
- Node test runner: **18 passed, 0 failed** (includes conversation projector + markdown export).
- All 14 documented Copilot event names normalize.
- camelCase and PascalCase/VS Code-compatible payload normalization.
- W3C `traceparent` validation and rejection of invalid/all-zero IDs.
- Hash, off, and full content-mode behavior.
- Structural tool identity retention while content is protected.
- Session, turn, tool, subagent, and point-span construction.
- Deterministic nested conversation projection for UI/export.
- Hook generator additive/idempotency behavior.
- Hook generator `--content-mode` / `--post-timeout-ms` (no hardcoded hash split-brain).
- Existing unrelated hook and top-level fields preserved.
- Exactly one bridge handler per selected event after repeated application.
- Smoke coverage includes successful tool path plus structured tool-failure and recoverable-error events in chronological order.
- Docker runtime image copies `ui/` for `/` and `/ui`.
- Conversation UI: sidebar sort/filter, nested timeline, code-block toolbar, MD/JSON/PDF export.
- Bash syntax validation.
- JSON and YAML parse validation.

## Not executable in the assembly environment

- The npm registry was unreachable, so dependencies could not be downloaded.
- Docker was unavailable, so `docker compose config` and a live collector run could not be executed.
- PowerShell was unavailable, so `.ps1` files were reviewed but not parsed by `pwsh`.

The TypeScript/test run used temporary local interface/runtime stubs for OpenTelemetry packages. Those stubs, `node_modules`, and compiled `dist` output are excluded from the delivered source. The real acceptance gate is:

```bash
corepack enable
pnpm install
pnpm check
docker compose config
docker compose up --build
./scripts/smoke-test.sh
```

On Windows, replace the last command with:

```powershell
.\scripts\smoke-test.ps1
```
