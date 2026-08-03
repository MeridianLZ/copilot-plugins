# CURRENT TASK STATE

_Last updated: 2026-08-02 (scope: Copilot OTel bridge workstream)_

## Where things stand

The Copilot CLI OTel hook bridge is **implemented, verified, and committed** (`a2af5c3` on `feat/copilot-otel-bridge`). `copilot-otel-bridge/` at repo root is the working stack (the `docs/copilot-research/CHATGPT_github-copilot-cli-otel-hook-bridge/` original is a frozen, checksummed reference — never edit it). The gate `pnpm check` is green (strict typecheck, 16/16 tests, build). A synthetic smoke session was verified through all four stages: hook egress → bridge JSONL ledger → reconstructed OTel spans → dockerized collector (16 spans received), and the trace-viewer UI at `http://127.0.0.1:14329/ui` was inspected in a browser (Sidebar session list + ChatConversation pane + span waterfall all rendering correctly, hash-mode content chips included).

`~/.copilot` was updated: `hooks/copilot-otel-bridge.json` installs observers for all 14 hook events (command transport → built `dist/src/hook-egress.js`, hash content mode). `~/.copilot/settings.json` was deliberately NOT touched — the native OTel lane activates per-shell via `scripts/copilot-otel-env.{sh,ps1}` (endpoint default `http://127.0.0.1:27432`). `~/.copilot/otel_settings.jsonc` is a reference catalog only (not auto-loaded by Copilot).

Local processes possibly still running from the verification: the bridge (node, port 14329) and the `otel-collector` container (ports 27431/27432).

## Immediate next step

1. **Acceptance run**: launch a real `copilot` session (trusted repo, env script dot-sourced), exercise a tool call, confirm both lanes arrive and the session appears in `/ui`.
2. Decide merge/push of `feat/copilot-otel-bridge`.

## Key decisions this session

- Implementation home = top-level `copilot-otel-bridge/` (checksummed reference stays frozen under `docs/`).
- TypeScript 7.0.2 (the guide's 6.0.0 pin is a phantom — never published).
- Collector host ports 27431/27432 in `.env` (SSoT) because 4317/4318, 14317/14318, and 24317/24318 are all occupied on this machine.
- UI is dependency-free static HTML served by the bridge itself — no separate frontend build.

## Open questions for the user

- Merge/push the branch?
- Keep bridge + collector running as a resident service, or stop until the acceptance run?
