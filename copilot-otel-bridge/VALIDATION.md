# Validation record

Validation date: **2026-08-01**.

## Passed

- Strict TypeScript typecheck with global TypeScript 5.8.3.
- Production compilation.
- Node test runner: **12 passed, 0 failed**.
- All 14 documented Copilot event names normalize.
- camelCase and PascalCase/VS Code-compatible payload normalization.
- W3C `traceparent` validation and rejection of invalid/all-zero IDs.
- Hash, off, and full content-mode behavior.
- Structural tool identity retention while content is protected.
- Session, turn, tool, subagent, and point-span construction.
- Hook generator additive/idempotency behavior.
- Existing unrelated hook and top-level fields preserved.
- Exactly one bridge handler per selected event after repeated application.
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
