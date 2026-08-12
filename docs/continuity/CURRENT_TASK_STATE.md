# CURRENT TASK STATE

## 2026-08-12 14:55 MDT — remediation implementation slice complete

**Branch:** `feat/copilot-otel-replica`, commits through `265f6ed`.

**Implemented and verified this session (both packages green: otel-bridge
91/91 tests, copilot-mcp 23/23 tests, typecheck + build pass both):**

1. All 14 hook events now overlay in native-first conversation projection
   (`8d3463d`→`25ece0e`) — was previously an allow-list of only 4 events.
   Grouped under one collapsible `governance` node per turn/session host so
   the readable transcript stays uncluttered; every event individually
   selectable/chronological. New `governance` `ConversationNodeKind`.
2. Native OTel evidence (signal, parent_span_id, model, usage, attributes,
   resource, instrumentation_scope, validity, content_disposition, source
   lineage) now survives `buildNativeOtelRecords()` → `correlateSources()`
   → coverage instead of being reduced to identity fields only (`43ad8e3`).
   New `SourceRecord.evidence` field.
3. New `GET /api/sessions/:id/sources/:sourceId` detail route returns full
   sanitized evidence; paginated `/sources` and `/coverage` summary rows
   stay lightweight (`has_evidence` flag only, no embedded blob) so
   pagination doesn't balloon (`43ad8e3`).
4. UI: coverage table rows with evidence are now clickable/keyboard-
   selectable and lazy-fetch the detail route into a new "Evidence detail"
   inspector section (`bbe7ccc`).
5. MCP stdio W3C trace-context propagation (`9e8fb8d`): proved
   `serveStdio()`'s bring-your-own-transport option lets a thin
   `ContextPropagatingStdioTransport` wrapper intercept each inbound
   JSON-RPC message, extract `params._meta` (same shape HTTP/WS already
   use), and scope it per-message via `AsyncLocalStorage` before the
   pinned stdio server instance processes it. Closes the stdio gap that
   HTTP/WS already had solved.
6. Native/hook terminal status reconciliation (`265f6ed`): new
   `reconcileTerminalStatus()` in `terminal-status.ts` replaces
   `root.status ?? sessionSpan?.status ?? 'open'` (which silently stayed
   stuck at native 'open' forever whenever the transcript never got
   `session.shutdown`, even if hooks closed cleanly). Now: explicit error
   wins > recovered > ok > open; disagreement surfaces as
   `ConversationDocument.status_conflict` + `status_evidence`, never hidden.

**Remaining plan tasks NOT done this session** (see
`docs/superpowers/plans/2026-08-12-complete-copilot-telemetry-replication-remediation.md`
Tasks 2, 5, 9, 11, 12 for full scope):

- Dedicated `ConversationIdentity`/`conversation-identity.ts` canonical-ID
  module (Task 2) — identity threading so far is ad hoc (via the new
  `evidence` field), not a first-class shared identity contract with
  exact-match-key precedence tests.
- Shared hook span contract unifying `SpanAssembler` emission and
  `trace-projector.ts` projection (Task 5) — still two separate
  implementations of status/attribute/link/exception rules.
- Full generic multi-section forensic inspector (raw/normalized toggle,
  attribute namespace search, link click-through, field-accounting
  counter) — only the native-OTel "Evidence detail" panel exists (Task 9
  partial).
- Machine-checked 100%-field-accounting test walking every fixture JSON
  path (Task 11).
- Fresh live all-lane Copilot capture + `docs/otel-remediation/live-
  validation.md` deployment evidence (Task 12).

**Next action:** pick up Task 2 (canonical identity) or Task 11 (field
accounting test) next — both are bounded, testable, and build on the
evidence/reconciliation work already merged.
