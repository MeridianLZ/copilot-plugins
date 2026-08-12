# Research Vector: Copilot CLI Configuration and Precedence

**Collected:** 2026-08-12  
**Confidence:** High for file roles; telemetry env injection through ordinary
user settings is unsupported.

## Findings

`~/.copilot/settings.json` is the user-editable JSONC settings file.
`~/.copilot/config.json` is managed application state. Unknown settings keys are
ignored and warned about.

The configuration directory includes:

```text
settings.json
config.json
mcp-config.json
permissions-config.json
hooks/
session-state/
logs/
session-store.db
```

`COPILOT_HOME` relocates this directory.

Environment variables are process configuration. Enterprise managed settings
can inject environment values or control telemetry policy, but that is not the
same as adding arbitrary environment-variable keys to personal
`settings.json`.

## Implementation consequence

Native OTel launch scripts must set the environment in the shell that starts
Copilot. A local config-file patch cannot reliably turn arbitrary `OTEL_*`
variables into process environment.

## Sources

- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/
