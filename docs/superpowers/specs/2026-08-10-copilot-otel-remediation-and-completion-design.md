# Copilot OTel Remediation and Completion Design

**Date:** 2026-08-10  
**Status:** Approved for implementation planning  
**Scope:** Local hook/OTel tap, sanitized operational data, native OTel, MCP
propagation, correlation, UI, and append-only acceptance evidence

## Goals

1. Remove the security blocker from the operational telemetry path without
   rewriting sealed incident evidence.
2. Make the hook, bridge, Collector, UI, and MCP telemetry path strictly local
   and independent of the enterprise proxy.
3. Complete the native OTel lane with comprehensive local capture, while
   keeping the native transcript as the conversation-fidelity source.
4. Correlate native OTel, native transcript, hook, MCP, and evidence records
   with explicit accounting for every record.
5. Finish the forensic API/UI and prove the result through append-only,
   sanitized verification runs.

## Non-goals

- Implementing or changing the user's external px/reverse-proxy setup.
- Rewriting, deleting, or sanitizing the original incident transcript,
  verification JSON, correction records, or sealed runbook in place.
- Sending full-content telemetry to an external backend.
- Treating Aspire as durable evidence; it remains a diagnostic view.

## Model assignments

- **Design and security contract:** Claude Opus 5, xhigh.
- **Native OTel, redaction, and TypeScript core:** GPT-5.3 Codex, xhigh.
- **MCP propagation and cross-process correlation:** GPT-5.3 Codex, high.
- **Collector, WSL, local-runtime integration, and evidence orchestration:**
  GPT-5.6 Sol, high.
- **API and forensic UI:** GPT-5.6 Luna, high.
- **Independent read-only security/evidence audit:** Claude Sonnet 5, high.

## Preservation and sanitization boundary

The original incident artifacts remain immutable and restricted:

- the Copilot transcript containing the historical exposure;
- the failed verification record and its correction records;
- the append-only incident runbook;
- existing hashes and provenance references.

The implementation adds a Sanitized Operational Mirror (SOM) for all data
served or created during normal operation:

- hook ledger and replay spool;
- native transcript projection;
- native OTel normalized records;
- Collector durable exports;
- bridge API responses;
- UI payloads and screenshots;
- new run manifests and runbook projections.

One versioned redaction module is used at every SOM boundary. It detects proxy
credentials and common secrets, redacts content before persistence or export,
and preserves only non-secret disposition data:

- disposition (`redacted`, `rendered`, `unavailable`, or `invalid`);
- source and record identifiers;
- byte count;
- policy version;
- optional content hash only when permitted by policy;
- reason and source offset where applicable.

The SOM records `derived_from` and the source hash of an immutable artifact
without copying sensitive content. A restricted operator can compare lineage
without exposing the original value.

## Local runtime architecture

The telemetry tap is local-only:

```text
Copilot hooks
    -> loopback bridge
    -> local Collector
    -> sanitized durable files
    -> local API/UI and optional Aspire view
```

The MCP path remains local:

```text
outer agent
    -> local copilot-mcp
    -> inner Copilot process
    -> native transcript + native OTel
    -> bridge correlation/API/UI
```

Bridge, Collector, UI, and MCP listeners bind to loopback or the private WSL
network only. Their child environments explicitly remove proxy variables and
set `NO_PROXY` for localhost, loopback, and private telemetry addresses.

External Copilot, package, and Docker traffic may use the user's px-managed
reverse proxy, but that external path is not a dependency of the local tap.
The repository does not read credential files, registry values, Git config,
npm config, or shell profiles at runtime.

## Staged data flow

### Phase 0: sanitize and localize

1. Add the shared redaction and encoded-secret detection boundary.
2. Start the bridge, Collector, and UI with proxy variables absent.
3. Verify local bind addresses and no-proxy telemetry requests.
4. Create a new run ID and sanitized operational mirror.
5. Preserve the historical failed run as-is.

The blocker closes only after a new run proves zero raw, base64, URL-encoded,
username, password, authenticated-URI, command-line, environment, file,
Collector, API, UI, screenshot, or runbook canary matches.

### Phase 1: native OTel lane

Copilot's exclusive native exporter is configured as OTLP HTTP for the local
Collector. Full message-content capture is enabled only for this local,
sanitized path and is never forwarded outside the local evidence boundary.

The bridge ingests native OTel traces, metrics, and logs into normalized
records retaining:

- trace, span, and parent identifiers;
- timing and status;
- model and provider metadata;
- usage and cost fields;
- tool and request identifiers;
- content disposition and redaction metadata;
- resource and instrumentation scope.

The native transcript remains authoritative for chronological conversation
fidelity. Native OTel remains authoritative for execution, usage, timing, and
trace identity.

### Phase 2: source coverage and correlation

Canonical source records are created for native OTel, native transcript, hook,
MCP, and evidence inputs. Correlation uses this order:

1. exact trace/span/tool/turn/request identifiers;
2. exact session and agent identifiers;
3. bounded FIFO and timestamp heuristics;
4. explicit unmatched disposition.

Every record receives exactly one accounting disposition:

- rendered;
- represented;
- redacted;
- unavailable;
- unmatched;
- heuristic;
- deduplicated;
- invalid;
- late/out-of-order.

Duplicate records retain their source identity and point to a canonical record.
Late records reopen projections and are visible as late events rather than
silently changing historical output.

### Phase 3: MCP boundary

The MCP client injects `traceparent`, `tracestate`, and optional baggage into
JSON-RPC `params._meta`. The MCP server extracts them as a remote parent.
Transport context and inner Copilot context remain distinct but linked.

The implementation enriches authoritative Copilot spans when possible and
does not emit a second authoritative span for the same Copilot operation.
Outer peer sessions, MCP calls, inner sessions, and subagents are navigable
through stable IDs.

### Phase 4: API, UI, and evidence

The bridge exposes:

- paginated conversation projections;
- native OTel source records;
- hook and transcript source records;
- correlation explanations;
- coverage totals and gaps;
- trace/span/tool/MCP identifiers;
- redaction and duplicate dispositions;
- run manifests, hashes, and local diagnostic links.

The existing three-pane UI is extended rather than replaced:

- session sidebar and live conversation pane;
- trace/evidence inspector;
- MCP and subagent lineage;
- gap, redaction, invalid, and late-event cards;
- restricted raw-source access only through explicit local operator action.

Every verification run receives a unique append-only identifier, manifest,
hashes, terminal reason, and sanitized human-readable runbook projection.

## Error handling

- Redaction failure, parser ambiguity, invalid W3C context, native-file
  corruption, Collector rejection, or coverage imbalance creates an explicit
  failure record and prevents a pass seal.
- Hook telemetry remains fail-open for Copilot control. If the bridge is
  unavailable, the hook spools a sanitized envelope and returns its normal
  non-blocking result.
- Security and evidence failures are not swallowed. They invalidate the run
  and stop acceptance.
- Native and OTel readers are incremental and bounded. Malformed records are
  retained as invalid dispositions with offsets and hashes.
- No API or UI endpoint reads raw source files directly. Only sanitized
  projections are exposed to normal operation.

## Validation gates

### Unit and package gates

- Redaction and raw/base64/URL-encoded secret detection.
- Native OTel JSONL/OTLP normalization.
- Transcript chunk reassembly.
- Exact and heuristic correlation.
- W3C MCP propagation and extraction.
- Dedupe and late-event accounting.
- API schema, pagination, and ETag behavior.
- UI rendering of every disposition.
- `pnpm check` for `copilot-otel-bridge` and `copilot-mcp`.

### Local-runtime gate

- Start bridge, Collector, and UI with proxy variables absent.
- Prove listeners are loopback/private-WSL only.
- Prove telemetry requests do not use the configured proxy.
- Run hook smoke and a real Copilot session through the live UI.

### Native OTel gate

- Enable the local OTLP exporter and content capture.
- Run a real session.
- Verify traces, metrics, and logs arrive in the local sanitized path.
- Verify native OTel and transcript identifiers correlate.
- Verify no sensitive attributes or content leave the SOM.

### MCP gate

- Exercise outer agent -> `copilot-mcp` -> inner Copilot.
- Verify `_meta` propagation and parent/child linkage.
- Verify inner conversation and subagent rendering.
- Verify no duplicate authoritative spans.

### Evidence gate

- Use a unique run ID for every attempt.
- Record pass, failure, and abort outcomes.
- Hash manifests and artifacts.
- Scan all captured surfaces for a synthetic canary in raw, encoded, and
  command/config variants.
- Require zero matches before sealing a pass.
- Keep the original incident evidence immutable and restricted.

## Completion criteria

The implementation is complete when:

1. The local no-proxy checkpoint passes with zero canary matches.
2. The blocker is closed by recorded evidence, not by relabeling the historical
   failed run.
3. Native OTel traces, metrics, and logs are ingested and correlated.
4. MCP propagation and peer-session lineage are visible.
5. The API/UI exposes conversation, trace, source, coverage, and redaction
   evidence.
6. Restart, spool replay, late-event, and deliberate-failure runs are sealed.
7. Both packages pass their existing checks.
8. An independent security/evidence review finds no release-blocking issue.
