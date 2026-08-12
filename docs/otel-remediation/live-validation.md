# Live Validation — 2026-08-12

**Runtime:** local loopback bridge, current feature build  
**Bridge:** `http://127.0.0.1:14329`  
**Session:** `160e8401-94b0-45c8-b668-505eaddcec5f`  
**Copilot command:** `copilot -p 'Return exactly: OTEL_LIVE_SMOKE_OK'`  
**Native capture:** `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`

## Fresh Copilot capture

Native file exporter produced 371,107 bytes containing:

- 2 native trace spans;
- 9 native metric records;
- native prompt/assistant transcript events;
- native model and usage attributes.

Bridge ingestion verified native trace and metric details through:

- [Native OTel session API](http://127.0.0.1:14329/api/sessions/160e8401-94b0-45c8-b668-505eaddcec5f/native-otel)
- [Source summary API](http://127.0.0.1:14329/api/sessions/160e8401-94b0-45c8-b668-505eaddcec5f/sources?limit=1000)
- [Field accounting API](http://127.0.0.1:14329/api/sessions/160e8401-94b0-45c8-b668-505eaddcec5f/telemetry-fields)
- [Conversation API](http://127.0.0.1:14329/api/sessions/160e8401-94b0-45c8-b668-505eaddcec5f/conversation?limit=1000)

## All-lane smoke result

The Copilot one-shot emitted no native log record. A sanitized local log-lane
record was appended to the same local native JSONL file to exercise the
supported log parser and UI lane without inventing Copilot behavior.

Observed native source signals after ingestion:

```text
log, metric, trace
```

Final API counts:

| Measure | Result |
|---|---:|
| Native OTel records | 12 |
| Native transcript events | 20 |
| Hook events | 5 |
| MCP records | 0 |
| Projected evidence spans | 7 |
| Coverage records | 44 |
| Accounted fields | 2,235 / 2,235 |
| Field accounting complete | `true` |
| Conversation status | `ok` |
| UI status | `200` |

MCP stdio was then exercised organically with a real subprocess and a
`tools/call session_create` request carrying valid `traceparent` and
`tracestate` in `params._meta`. The first attempt surfaced a missing bundled
platform package; setting `COPILOT_MCP_CLI_PATH` to the installed system
Copilot executable produced a successful session:

```text
MCP session: 669e9b23-43b5-4d57-bb07-e482d090465c
transport: stdio
request id: 2
result: session_create succeeded
```

The MCP process was stopped after the response because stdio remains a
long-lived server process. The bridge session above predates this independent
MCP subprocess, so its `mcp` coverage count remains `0`; the transport
propagation path itself is covered by the organic subprocess response and the
dedicated per-message AsyncLocalStorage tests.

Coverage dispositions:

```json
{"rendered":10,"represented":4,"redacted":0,"unavailable":0,"unmatched":8,"heuristic":13,"deduplicated":0,"invalid":0,"late_out_of_order":9}
```

The unmatched, heuristic, and late dispositions are visible accounting
outcomes, not silent loss. They identify records that lack exact cross-lane
identity or arrived outside the bounded ordering window.

## Verification commands

```powershell
Push-Location copilot-otel-bridge
pnpm check
Pop-Location

Push-Location copilot-mcp
pnpm check
Pop-Location

Invoke-RestMethod http://127.0.0.1:14329/health
Invoke-WebRequest http://127.0.0.1:14329/ui
```

Fresh package gates:

- `copilot-otel-bridge`: 101/101 tests, typecheck, build.
- `copilot-mcp`: 23/23 tests, typecheck, build.

## Remaining live limitation

This run did not include a Copilot subagent or permission denial, and the
Copilot one-shot emitted no native log record. The native log parser was
exercised with a sanitized local log-lane record, while MCP stdio was exercised
in a separate real subprocess. Missing organic events are explicitly recorded
rather than claimed as observed.
