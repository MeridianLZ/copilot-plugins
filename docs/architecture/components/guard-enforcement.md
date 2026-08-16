# Component: guard-enforcement

**Responsibility:** Single portable compliance rule engine that inspects an agent tool-call payload before it executes and denies anything violating the repo's fintech domain rules (PCI-DSS, SOX ITGC, SOC 2, GLBA). It reads the payload as JSON on stdin (or `--file`/`--content` for pre-commit/CI), normalizes the ecosystem-specific argument shape, runs content rules then command rules, and emits the first violation as a verdict in the caller's dialect. It fails closed: without `jq` it exits 3 rather than silently passing.

**Boundary:** in — payload normalization, the rule corpus (Luhn PAN, SSN, inline secrets, float money, `Database.Migrate()`, Service Bus keys, browser token storage, `dangerouslySetInnerHTML`, `react-beautiful-dnd`, `VITE_*` secrets, kubectl/helm mutation, `dotnet ef database update`, destructive SQL, ledger UPDATE/DELETE, `rm -rf`, force push, credential-file reads, curl/wget exfiltration), and the four output dialects. out — hook *registration* (owned by fintech-plugins `hooks/hooks.json`), the copy/fan-out of the guard into `targets/` (owned by build-pipeline), formatting, and audit logging.

## Constituent files

| File | Role |
|------|------|
| `shared/guards/guard-core.sh` | Canonical rule engine; 137 lines; dialects `claude`/`codex`/`copilot`/`plain`. |
| `plugins/fintech-backend/scripts/guard-backend-write.sh` | Per-plugin PreToolUse[Write\|Edit\|MultiEdit] guard; inlined subset (PAN, SSN, secret, Service Bus, float money, `Database.Migrate()`). |
| `plugins/fintech-frontend/scripts/guard-frontend-write.sh` | Per-plugin write guard; frontend subset (PAN, SSN, browser storage, `dangerouslySetInnerHTML`, `react-beautiful-dnd`, `VITE_*` secrets). |
| `plugins/fintech-backend/scripts/block-destructive.sh` | PreToolUse[Bash] command guard: `rm -rf`, force push, `git reset --hard`, kubectl/helm, `dotnet ef database update`, destructive SQL, ledger mutation. |
| `plugins/fintech-backend/scripts/block-secrets-exfil.sh` | PreToolUse[Bash] guard: k8s secret reads, credential files, prod `appsettings`, env dumps, curl/wget uploads. |
| `plugins/fintech-backend/scripts/guard-core.sh`, `plugins/fintech-frontend/scripts/guard-core.sh` | Vendored 123-line copies of the core shipped inside each plugin. |
| `targets/copilot/.github/hooks/scripts/guard-core.ps1` | Windows/PowerShell reimplementation (65 lines), Luhn included; exit 2 denies. |
| `targets/copilot/.github/hooks/scripts/guard-core.sh`, `targets/copilot/scripts/guard-core.sh`, `targets/cursor/.cursor/hooks/guard-core.sh`, `targets/codex/plugins/*/scripts/guard-core.sh` | Build-generated copies of the canonical guard. |

## Lynchpin symbols

| Symbol | Location | Why load-bearing |
|--------|----------|------------------|
| arg parser (`--dialect`/`--file`/`--content`) | `shared/guards/guard-core.sh:16` | Selects the verdict dialect and the input mode; everything downstream branches on it. |
| stdin normalizer (`jq -c` over `.tool_input // .toolArgs`) | `shared/guards/guard-core.sh:31` | Collapses Claude/Codex/Copilot payload shapes — including Copilot's JSON-*encoded string* `toolArgs` — into `{content,file,cmd}`. |
| fail-closed `exit 3` | `shared/guards/guard-core.sh:42` | No `jq` ⇒ enforcement cannot run ⇒ deny path, never a silent pass. |
| `deny()` | `shared/guards/guard-core.sh:50` | Single choke point: sets `REASON`, calls `emit_deny`; first match wins and terminates the process. |
| `emit_deny()` | `shared/guards/guard-core.sh:52` | The dialect switch: claude JSON+exit 0 (`:54`), codex JSON+exit 2 (`:59`), copilot JSON+exit 2 (`:64`), plain `BLOCKED:`+exit 1 (`:70`). |
| Luhn PAN loop | `shared/guards/guard-core.sh:78` | Candidate extraction (`:78`) plus the mod-10 checksum (`:84`–`:88`) — the only rule that computes rather than pattern-matches, so tokenized fixtures pass. |
| content rule block | `shared/guards/guard-core.sh:77` | Guarded by `[ -n "$CONTENT" ]`; SSN `:93`, float money `:95`, `Database.Migrate()` `:97`, Service Bus key `:99`, inline secret `:101`, browser storage `:103`, `dangerouslySetInnerHTML` `:105`, `react-beautiful-dnd` `:107`, `VITE_*` secret `:109`. |
| command rule block | `shared/guards/guard-core.sh:114` | kubectl `:115`, helm `:117`, `dotnet ef database update` `:119`, destructive SQL `:121`, ledger append-only `:123`, `rm -rf` `:125`, force push `:127`, credential reads `:129`, k8s secret payloads `:131`, curl/wget exfil `:133`. |
| terminal `exit 0` | `shared/guards/guard-core.sh:137` | Allow-by-default only after every rule has run. |
| `deny()` (Claude dialect only) | `plugins/fintech-backend/scripts/guard-backend-write.sh:8` | Per-plugin guards hardcode the Claude `permissionDecision:"deny"` JSON — no dialect switch. |
| `deny()` (Claude dialect only) | `plugins/fintech-frontend/scripts/guard-frontend-write.sh:9` | Same, for the frontend rule subset. |
| `deny()` | `plugins/fintech-backend/scripts/block-destructive.sh:7` | Bash-command deny path for cluster/DB/git destruction. |
| `deny()` | `plugins/fintech-backend/scripts/block-secrets-exfil.sh:7` | Bash-command deny path for secret reads and outbound uploads. |
| `Deny()` | `targets/copilot/.github/hooks/scripts/guard-core.ps1:7` | Windows verdict emitter; exit 2 (Copilot treats non-zero as fail-closed deny). |
| `Test-Luhn()` | `targets/copilot/.github/hooks/scripts/guard-core.ps1:24` | PowerShell mod-10 parity with the bash Luhn loop — must stay in sync. |
| parse-failure `Deny` | `targets/copilot/.github/hooks/scripts/guard-core.ps1:12` | PS fail-closed: unparseable payload denies. |
| allow verdict | `targets/copilot/.github/hooks/scripts/guard-core.ps1:64` | Windows path emits an explicit `permissionDecision:"allow"`; the bash path emits nothing on allow. |

## Dependencies

- **Inbound (who uses this):** `fintech-plugins` (`plugins/*/hooks/hooks.json` PreToolUse entries invoke `guard-*-write.sh`, `block-destructive.sh`, `block-secrets-exfil.sh`); `build-pipeline` (`build/build.sh:29`, `:39`, `:59`, `:60` copy the canonical guard into every target); `targets/copilot/.github/hooks/fintech-compliance.json`; `targets/cursor/.cursor/hooks.json`; `targets/copilot/scripts/pre-commit` and CI (`--dialect plain`).
- **Outbound (what this uses):** `jq` (mandatory — absence is exit 3), `grep -E`, bash arithmetic; PowerShell 7 `ConvertFrom-Json`/`[regex]` on the Windows path. No repo-internal code.

## Data flow

See [guard-enforcement-dataflow.mmd](guard-enforcement-dataflow.mmd). Output payload summary:
Either nothing plus exit 0 (allow), or a single first-match deny verdict rendered per dialect — claude `{hookSpecificOutput:{permissionDecision:"deny",permissionDecisionReason}}` exit 0; codex `{permissionDecision:"deny",block:true,…}` exit 2; copilot `{permissionDecision:"deny",…}` exit 2; plain `BLOCKED: <reason>` on stderr exit 1; missing `jq` exit 3.
