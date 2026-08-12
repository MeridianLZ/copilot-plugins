# CURRENT TASK STATE

_Last updated: 2026-08-12 (development integration checkpoint)._

## Development branch

The committed Copilot OTel/MCP work is consolidated in the `development`
worktree at `C:\Users\lzautke\dev\fintech-marketplace\.worktrees\development`.
It was created from `main`, then merged from `feat/copilot-otel-replica`.

The implementation worktree completed:

- proxy-aware redaction and local no-proxy runtime;
- native OTel traces, metrics, logs, durable Collector files, and API;
- native transcript projection and bounded restart-safe caches;
- source coverage/correlation and explicit gap dispositions;
- MCP W3C carrier propagation and bounded peer linkage;
- paged forensic API contracts and live conversation rendering.

## Historical non-native checkpoint

The 2026-08-08 bootstrap was technically operational but failed its security
gate after a reversible proxy credential representation entered the Copilot
transcript. The evidence run remains permanently failed and must not be
rewritten or relabeled.

The next acceptance run must use a new evidence ID, secret-safe proxy
configuration, fresh processes after rotation, and raw/base64/URL-encoded
canary scans.

## Remaining critical path

1. Complete the clean post-rotation non-native checkpoint.
2. Finish the append-only evidence recorder and verifier.
3. Run full parent-agent -> MCP peer -> native OTel -> UI acceptance.
4. Keep `main` unchanged until the development acceptance gate passes.

## Active invariants

- Preserve the failed evidence run and append corrections only.
- Keep native transcript as the conversation-fidelity lane and native OTel as
  the execution, usage, and timing lane.
- Keep bridge, hooks, Collector, UI, and local MCP traffic on loopback/private
  WSL paths without proxy credentials.
- Keep exactly one live `~/.copilot/hooks/*.json` observer configuration.
