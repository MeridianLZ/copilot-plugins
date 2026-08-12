# MCP Peer Runbook - Copilot OTel Bridge

_Perspective: GitHub Copilot CLI harness agent (this session) orchestrating a peer Copilot via `copilot-mcp`, observed through the hook → JSONL → OTel bridge UI._

- **Run date:** 2026-08-06
- **Branch/commits:** `feat/copilot-mcp` @ `59f6eb8` (feat) + `8e797d8` (continuity), pushed to `origin/feat/copilot-mcp`
- **Primary session id:** `d9d26f83-8845-451a-919a-797dbf51f8d5`
- **UI:** http://127.0.0.1:14329/ui
- **Conversation API:** `/api/sessions/d9d26f83-8845-451a-919a-797dbf51f8d5/conversation` and `.md`
- **Outer CLI log:** `%TEMP%\mcp-peer-run-20260806-003319.jsonl`

---

## 1. Intent

Prove end-to-end that:

1. A real Copilot CLI session can call its **MCP peer** (`copilot-mcp`: ping → marco → ask).
2. User-scope hook observers deliver lifecycle events to the bridge.
3. Native GenAI OTel and hook-lane spans both arrive at the collector.
4. The conversation UI/API can render and export the session.

This is a **harness-operator perspective** runbook, not the nested peer's private chain of thought.

---

## 2. Topology under test

```text
[Operator shell]
   |  copilot -p ... --allow-all  (+ COPILOT_OTEL_* env)
   v
[Copilot CLI session d9d26f83-8845-451a-919a-797dbf51f8d5]
   |-- hooks (user-scope ~/.copilot/hooks/copilot-otel-bridge.json)
   |      -> hook-egress.js -> POST http://127.0.0.1:14329/hooks/<event>
   |-- native OTel OTLP/HTTP -> http://127.0.0.1:27432
   |-- MCP stdio peer: copilot-mcp (node dist/transports/stdio.js)
   |      tools: ping, marco, ask, session_list, status
   `-- local tool: powershell

[hook-bridge :14329]
   |-- append-only .copilot/telemetry/hook-events.jsonl
   |-- SpanAssembler -> OTLP traces -> collector :27432
   `-- /ui + /api/sessions + /api/sessions/:id/conversation[.md]

[otel-collector :27431/:27432] debug exporter
```

---

## 3. Preconditions

| Check | Result |
|---|---|
| Bridge health | ok; `events_file` under `copilot-otel-bridge/.copilot/telemetry` |
| Collector | listening `27432` |
| User hooks installed | `~/.copilot/hooks/copilot-otel-bridge.json` (14 events, command transport) |
| MCP peer registered | `~/.copilot/mcp-config.json` → `copilot-mcp` stdio |
| Native OTel env | `. .\scripts\copilot-otel-env.ps1` (OTLP http/protobuf → 27432) |
| Level-up commit | `59f6eb8` conversation UI/export/hardening pushed |

---

## 4. Operator procedure (repro)

```powershell
cd C:\Users\me\dev\fintech-marketplace\copilot-otel-bridge
# ensure bridge on :14329
. .\scripts\copilot-otel-env.ps1
$prompt = @'
You are running a traced MCP peer exercise. Do these steps in order and stop:
1) Call the copilot-mcp ping tool if available.
2) Call the copilot-mcp marco tool if available.
3) Call the copilot-mcp ask tool with prompt: Reply with exactly the four characters: pong
4) Use the powershell tool once: Get-Date -Format o
5) Summarize each tool result in one short bullet list. Do not edit files.
'@
copilot -C (Get-Location) --allow-all --no-ask-user --no-color --output-format json -p $prompt
Invoke-RestMethod -Method Post http://127.0.0.1:14329/flush
Start-Process http://127.0.0.1:14329/ui
```

---

## 5. What the peer path did (from harness observation)

Observed MCP server lifecycle in the outer CLI JSONL:

- `session.mcp_server_status_changed` for `copilot-mcp`: `pending` → `connected` (stdio transport)
- Tool sequence:
  1. `copilot-mcp-ping` → success (`pong: true`, server v0.1.0)
  2. `copilot-mcp-marco` → success (`reply: polo`)
  3. `copilot-mcp-ask` with prompt `Reply with exactly the four characters: pong` → answer `pong` (nested peer session created)
  4. `powershell` `Get-Date -Format o` → `2026-08-06T00:34:53.8676654-06:00`

Final outer assistant summary (verbatim):

```text
Results:
- **ping**: `pong: true` from `copilot-mcp` v0.1.0
- **marco**: `reply: polo`, ok
- **ask**: answer `pong` (session created)
- **Get-Date**: `2026-08-06T00:34:53.8676654-06:00`
```

Exit: `exitCode=0`, `sessionDurationMs≈88526`, `premiumRequests=1`.

---

## 6. Hook-lane evidence (bridge)

`/api/sessions` summary for `d9d26f83-8845-451a-919a-797dbf51f8d5`:

| Field | Value |
|---|---|
| event_count | 34 |
| turn_count | 2 |
| tool_count | 8 |
| status | ok |
| end_reason | complete |
| cwd | `C:\Users\me\dev\fintech-marketplace\copilot-otel-bridge` |

Unique hook events observed:

`sessionStart`, `userPromptSubmitted`, `userPromptTransformed`, `preToolUse`, `permissionRequest`, `postToolUse`, `agentStop`, `sessionEnd`

`preToolUse` tool names (business tools; permission/post pairings inflate raw counts):

`copilot-mcp-ping`, `copilot-mcp-marco`, `copilot-mcp-ask`, `powershell`

Conversation API:

- `GET /api/sessions/.../conversation` → events=34, tools present, exportable tree
- `GET /api/sessions/.../conversation.md` → markdown transcript (~26 KB)

---

## 7. Native OTel evidence (collector)

Collector debug exporter span names in the run window:

- `invoke_agent`
- `chat grok-4.5`
- `execute_tool copilot-mcp-ping`
- `execute_tool copilot-mcp-marco`
- `execute_tool copilot-mcp-ask`
- `execute_tool powershell`
- `github.copilot.hook.session`
- `github.copilot.hook.turn`
- `github.copilot.hook.tool`
- `github.copilot.hook.sessionStart` / `sessionEnd`

Dual-lane proof: native GenAI execution tree **and** custom hook lifecycle lane.

---

## 8. UI exercise checklist

| Surface | Result |
|---|---|
| `GET /ui` | HTTP 200; export controls + code-toolbar present |
| Session list | session selectable (search `d9d26f83` / filter cwd) |
| Conversation pane | chronological nested timeline + collapsible waterfall |
| Code blocks | hover toolbar: copy, line numbers, Aa± |
| Export | Markdown, JSON conversation doc, PDF via print CSS |

Manual path:

1. Open http://127.0.0.1:14329/ui  
2. Confirm health dot green  
3. Sort **Newest**, search `d9d26f83`  
4. Select session → inspect ping/marco/ask/powershell tool cards  
5. Export MD/JSON; optional Print → PDF  

---

## 9. Perspective notes (this agent)

- I did **not** role-play the nested peer model. I launched the **outer** Copilot CLI as the system under observation and read its tool stream + bridge ledger + collector spans.
- `copilot-mcp` wraps another Copilot process; `ask` created an inner session. Hook observers were attached to the **outer** CLI. Inner-turn hook parity is **not** claimed unless the child inherits the same hook install.
- Permission hooks fire beside tool hooks; raw tool event counts look higher than distinct business tools.
- Conversation projector may mark aggregate status `recovered` when hook timestamps race (`userPromptSubmitted` before `sessionStart`). **Raw JSONL ledger remains authoritative.**

---

## 10. Artifacts

| Artifact | Locator |
|---|---|
| Outer CLI JSONL | `%TEMP%\mcp-peer-run-20260806-003319.jsonl` |
| Hook ledger | `copilot-otel-bridge/.copilot/telemetry/hook-events.jsonl` |
| Session MD dump | `copilot-otel-bridge/docs/MCP_PEER_SESSION.md` |
| This runbook | `copilot-otel-bridge/docs/MCP_RUNBOOK.md` |
| Feature commits | `59f6eb8`, continuity `8e797d8` on `origin/feat/copilot-mcp` |

---

## 11. Pass/fail

| Criterion | Verdict |
|---|---|
| MCP peer connected | PASS |
| ping / marco / ask / powershell succeeded | PASS |
| Hook events accepted for session | PASS (34) |
| Native `execute_tool` spans for MCP tools | PASS |
| Hook lifecycle spans exported | PASS |
| UI serves + conversation export works | PASS |
| Nested peer inner-turn hook parity | Partial / N/A (outer hooks only) |

**Overall: PASS** for dual-lane observability of an outer Copilot ↔ MCP-peer exercise.

---

## 12. Follow-ups

1. Propagate hook observers into nested `copilot-mcp` child environments if inner-turn hook parity is required.
2. Harden conversation projector ordering when `userPromptSubmitted` races `sessionStart`.
3. Add `scripts/mcp-peer-smoke.ps1` wrapping this procedure.
4. Keep collector debug exporter local-only; replace before non-loopback deploy.
