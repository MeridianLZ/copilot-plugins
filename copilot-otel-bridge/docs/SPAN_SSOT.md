# Span SSOT — three-tier taxonomy (enforced precedence)

Single source of truth for every span and attribute this bridge emits, projects, or renders — and for the native/GenAI signals it deliberately does **not** re-emit. The machine SSOT is [`src/span-taxonomy.ts`](../src/span-taxonomy.ts); the catalog block below is generated from it (`renderCatalogMarkdown()`) and guarded by `test/span-taxonomy.test.ts`. Regenerate after editing the module:

```bash
npx tsx -e "import('./src/span-taxonomy.js').then(m=>console.log(m.renderCatalogMarkdown()))"
```

## 1. Precedence rule (the enforcement algorithm)

Tiers, highest precedence first:

1. **GenAI-first** — OTel GenAI semantic conventions (`gen_ai.*`, `error.*`; operations `chat`, `invoke_agent`, `execute_tool`, `execute_hook`). When a signal has a semconv home, it goes there and ONLY there.
2. **Native Copilot, non-duped** — `github.copilot.*` (minus `hook.*`), `copilot_chat.*`, and native `events.jsonl` signals. A tier-2 attribute that duplicates a tier-1 attribute is **dropped** — unless it carries strictly more information, in which case it is kept with a dupe-note (see catalog).
3. **Custom hook spans** — `github.copilot.hook.*` residual: lifecycle/correlation metadata and signals with no semconv or native home.

Enforced in code: all three projectors (`span-assembler`, `trace-projector`, `conversation-projector`/`native-session`) take names and attribute mappings exclusively from `span-taxonomy.ts`. Every exported span carries `github.copilot.hook.span.tier`; every conversation node carries `span_name` + `span_tier`, and the UI renders both on the component (chip: green t1 / blue t2 / grey t3).

## 2. Generated catalog

<!-- taxonomy:begin -->
| Span name | Tier | gen_ai.operation.name | Source | Note |
|---|---|---|---|---|
| `chat {model}` | 2 | `chat` | native OTel lane; replica nodes from events.jsonl user.message/assistant.message (nominal) | native lane owns the real span (tokens, finish_reasons); bridge never re-emits it |
| `invoke_agent {agent}` | 1 | `invoke_agent` | hook lifecycle subagentStart→subagentStop; native subagent.started/completed (nominal) | gen_ai.agent.name/id + kept tier-2 display_name/type |
| `execute_tool {tool}` | 1 | `execute_tool` | hook lifecycle preToolUse→postToolUse|postToolUseFailure; native tool.execution_start/complete (nominal) | gen_ai.tool.name, gen_ai.tool.type=function; native lane adds gen_ai.tool.call.id (hook lane cannot) |
| `execute_hook {event}` | 1 | `execute_hook` | one point span per hook event (14 events) | spec-directed extension: execute_hook not yet a registered semconv operation; payload flattened under github.copilot.hook.payload.* |
| `github.copilot.hook.session` | 3 | — | hook lifecycle sessionStart→sessionEnd | conversation identity lives in gen_ai.conversation.id, not the span name |
| `github.copilot.hook.turn` | 3 | — | hook lifecycle userPromptSubmitted→agentStop | 'chat' name would dupe the native lane — stays tier 3 |
| `native:{event.type}` | 2 | — | native events.jsonl signal with no span in any lane (e.g. session.model_change, session.usage_checkpoint) | replica-node provenance label only; never exported as a span |

| Payload key | Attribute | Tier | Dupe of | Emitted | Note |
|---|---|---|---|---|---|
| `session_id` | `gen_ai.conversation.id` | 1 | — | yes | — |
| `tool_name` | `gen_ai.tool.name` | 1 | — | yes | — |
| `agent_id` | `gen_ai.agent.id` | 1 | — | yes | — |
| `agent_name` | `gen_ai.agent.name` | 1 | — | yes | — |
| `error_type` | `error.type` | 1 | — | yes | — |
| `session_id` | `github.copilot.session.id` | 2 | `gen_ai.conversation.id` | no (dropped) | equal-info dupe — precedence drops it; re-key queries on gen_ai.conversation.id |
| `agent_type` | `github.copilot.agent.type` | 2 | — | yes | Copilot agent classification (builtin/custom/plugin) — no gen_ai equivalent |
| `agent_display_name` | `github.copilot.agent.display_name` | 2 | `gen_ai.agent.name` | yes | kept: human display variant carries more info than the slug in gen_ai.agent.name |
| `cwd` | `github.copilot.cwd` | 2 | — | yes | — |
| `source` | `github.copilot.session.source` | 2 | — | yes | — |
| `reason` | `github.copilot.session.end_reason` | 2 | — | yes | — |
| `transcript_path` | `github.copilot.transcript.path` | 2 | — | yes | — |
| `stop_reason` | `github.copilot.stop.reason` | 2 | — | yes | — |
| `error_context` | `github.copilot.error.context` | 2 | — | yes | — |
| `trigger` | `github.copilot.compaction.trigger` | 2 | — | yes | — |
| `notification_type` | `github.copilot.notification.type` | 2 | — | yes | — |
| `recoverable` | `github.copilot.error.recoverable` | 2 | — | yes | — |
| `stop_hook_active` | `github.copilot.stop_hook_active` | 2 | — | yes | — |

| Payload key(s) | Content attribute (opt-in, contentMode=full only) | Shape |
|---|---|---|
| `prompt` / `initial_prompt` / `initialPrompt` | `gen_ai.input.messages` | semconv message array, role `user` |
| `response` / `last_assistant_message` / `lastAssistantMessage` | `gen_ai.output.messages` | semconv message array, role `assistant` |
| `custom_instructions` / `additional_context` / `additionalContext` | `gen_ai.system_instructions` | serialized value |
| `tool_input` / `tool_args` / `toolArgs` | `gen_ai.tool.call.arguments` | serialized value |
| `tool_result` / `toolResult` | `gen_ai.tool.call.result` | serialized value |
<!-- taxonomy:end -->

## 3. Tier 1 detail — GenAI semconv (sources: VS Code monitoring-agents doc + semconv-genai spec, checked 2026-08-16)

Copilot's documented GenAI span tree (`invoke_agent` → `chat {model}` → `execute_tool {tool}`, plus `execute_hook`):

- Core: `gen_ai.operation.name` (Required), `gen_ai.provider.name`, `gen_ai.conversation.id`, `gen_ai.agent.name/id`, `gen_ai.request.model/max_tokens/temperature/top_p`, `gen_ai.response.model/id/finish_reasons`, `gen_ai.usage.input_tokens/output_tokens/cache_read.input_tokens/cache_creation.input_tokens/reasoning.output_tokens`, `gen_ai.tool.name/type/call.id`, `error.type`, `server.address`.
- Content (Opt-In, sensitive): `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `gen_ai.tool.definitions`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`. **The bridge emits its content subset only when `COPILOT_TRACE_CONTENT_MODE=full`** (payloads are already redacted+truncated at ingest); the native lane needs `COPILOT_OTEL_CAPTURE_CONTENT=true`.
- Metrics (native lane only): `gen_ai.client.operation.duration`, `gen_ai.client.token.usage`. Event: `gen_ai.client.inference.operation.details`.
- `execute_hook` is documented by GitHub for Copilot but not yet a registered semconv operation — spec-directed extension, tier 1 by user spec. Copilot's own execute_hook attrs: `github.copilot.hook.decision` (pass/block/non_blocking_error), `copilot_chat.hook_type`, `copilot_chat.hook_result_kind`.

## 4. Tier 2 detail — native Copilot, non-duped

**Native OTel lane** (`COPILOT_OTEL_ENABLED=true`, `scripts/copilot-otel-env.sh`): span names observed live (`docs/MCP_RUNBOOK.md`): `invoke_agent`, `chat grok-4.5`, `execute_tool <tool>`. Native-only extras kept (non-duped): `github.copilot.agent.type`, `github.copilot.git.*` (branch/commit/remote), `github.copilot.tool.parameters.edit_type`, `github.copilot.tool.parameters.mcp_server_name_hash`, `gen_ai.tool.call.id` (native-only — hook payloads have no tool_call id).

**Dupe-but-richer, kept with note**: `copilot_chat.time_to_first_token` dupes `gen_ai.response.time_to_first_chunk` but is dual-emitted by the extension with ms precision — treat `gen_ai.*` as canonical, `copilot_chat.*` as legacy dual-emit. Namespace rule (per VS Code doc): `gen_ai.*` = standard, `github.copilot.*` = canonical Copilot, `copilot_chat.*` = legacy (dual-emitted indefinitely).

**`copilot_chat.*` events** (native, no bridge equivalent): `session.start`, `tool.call`, `agent.turn`, `edit.feedback`, `user.feedback`. **Metrics**: `copilot_chat.tool.call.count`, `agent.invocation.duration`, `session.count`, `edit.acceptance.count`, `lines_of_code.count`, `user.feedback.count`.

**Native session-state stream** (`$COPILOT_HOME/session-state/<id>/events.jsonl`, envelope `{type,data,id,timestamp,parentId,agentId?}`) — the conversation-replica substrate, 14 event types:
`session.start`, `session.model_change`, `session.usage_checkpoint`, `user.message`, `assistant.turn_start`, `assistant.turn_end`, `assistant.message`, `subagent.started`, `subagent.completed`, `tool.execution_start`, `tool.execution_complete`, `permission.requested`, `permission.completed`, `session.shutdown`.

**Nominal vs verified**: replica nodes built from this stream carry the taxonomy span name the signal *belongs to* (`chat {model}`, `execute_tool {tool}`, …), marked nominal — the bridge did not observe the native exporter emit that span. Only hook-lane spans are verified emissions of this process.

## 5. Tier 3 detail — custom hook spans

- Duration spans: `github.copilot.hook.session` (sessionStart→sessionEnd), `github.copilot.hook.turn` (userPromptSubmitted→agentStop). Tool/subagent lifecycle spans are tier-1-named (`execute_tool {tool}`, `invoke_agent {agent}`) but remain hook-lane FIFO reconstructions (`github.copilot.hook.correlation.limit` documents the fidelity ceiling).
- Point spans: `execute_hook {event}` for all 14 hook events, payload flattened under `github.copilot.hook.payload.*` (depth 3, 96 attrs).
- Lifecycle/correlation attrs (unchanged, authoritative in [`attribute-link-contract.md`](attribute-link-contract.md)): `github.copilot.hook.event.name/.event.id/.source/.payload_format/.schema_version/.observed_at_unix_ms`, `.lifecycle.kind/.correlation_key/.start_event/.end_event/.recovered_end/.recovered_reason`, `.relationship.heuristic`, `.correlation.limit`, `github.copilot.link.reason`, resource `github.copilot.telemetry.lane=hook-bridge`. New: `github.copilot.hook.span.tier` (1|2|3) on every emitted span.

### Rename table (breaking; dashboards re-key on unchanged attrs)

| Old span name | New span name |
|---|---|
| `github.copilot.hook.tool` | `execute_tool {tool_name}` |
| `github.copilot.hook.subagent` | `invoke_agent {agent_name}` |
| `github.copilot.hook.<event>` (14 point spans) | `execute_hook <event>` |
| `github.copilot.hook.session` / `.turn` | unchanged |

Dropped attribute: `github.copilot.session.id` → use `gen_ai.conversation.id`. `github.copilot.hook.event.name` and `.lifecycle.kind` are unchanged re-key anchors.

## 6. Replica-fidelity mapping (span/node → UI component → badge)

Every rendered chat element displays its originating span name + tier chip (`ui/index.html` `spanChip()`); markdown export prints `span: \`<name>\` (tier N)` per node; JSON export carries `span_name`/`span_tier` (`ConversationDocument` schema 1.2.0).

| Signal | UI component | Span chip |
|---|---|---|
| `user.message` / `userPromptSubmitted` | user bubble | `chat {model}` t2 (native) / `execute_hook userPromptSubmitted` t1 (hooks-only) |
| `assistant.message` | assistant bubble (+model chip, reasoning fold) | `chat {model}` t2 |
| `tool.execution_start/complete` / preToolUse..postToolUse | tool card | `execute_tool {tool}` t1 |
| `subagent.started/completed` / subagentStart..Stop | subagent block (+child-session link) | `invoke_agent {agent}` t1 |
| `permission.requested/completed` / permissionRequest | permission row | `execute_hook permissionRequest` t1 |
| turn shell | turn section | `github.copilot.hook.turn` t3 |
| session shell / sessionStart/End | session shell, dividers | `github.copilot.hook.session` t3 / `execute_hook session*` t1 |
| `session.model_change`, `session.usage_checkpoint` | divider / usage footer | `native:<event.type>` t2 (no span in any lane) |
| preCompact / notification / errorOccurred / postToolUseFailure (governance overlay) | divider / notice / error block | `execute_hook <event>` t1 |
| waterfall rows | span waterfall | label = span name, tooltip = tier |

## 7. Capture-env matrix (what you need for a FULL identical replica)

| Signal | Requires |
|---|---|
| Verbatim conversation (prose, reasoning, models, usage, toolCallId) | native `events.jsonl` readable (`COPILOT_HOME`; container mounts it ro at `/copilot-home`) — no env toggle, always written by Copilot CLI |
| Native GenAI spans/metrics (tokens, finish_reasons, TTFT) | `COPILOT_OTEL_ENABLED=true` + `OTEL_EXPORTER_OTLP_ENDPOINT` (`scripts/copilot-otel-env.sh`), or `COPILOT_OTEL_EXPORTER_TYPE=file` + `COPILOT_OTEL_FILE_EXPORTER_PATH` (`scripts/copilot-otel-file.sh`) |
| Native span content (prompts/results on spans) | `COPILOT_OTEL_CAPTURE_CONTENT=true` (+ `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` — both default false in `copilot-otel-env.sh`; `COPILOT_OTEL_MAX_ATTRIBUTE_SIZE_CHARS` truncates) |
| Hook governance overlay (permissions, compaction, errors, denials) | hooks installed (`pnpm hooks:apply`), bridge running |
| Bridge content attrs (`gen_ai.input.messages` etc. on hook spans) | `COPILOT_TRACE_CONTENT_MODE=full` (default `hash`; explicit opt-in — carries prompt/tool bodies, secret-pattern redaction still applies) |
| Span chips in UI/exports | nothing — always on (schema 1.2.0) |

Which lane answers which question stays in [`attribute-link-contract.md`](attribute-link-contract.md) §lane table.

## 8. Relationship to other docs

- Supersedes **only**: [`hook-map.md`](hook-map.md) § point-span naming, and [`attribute-link-contract.md`](attribute-link-contract.md) § "Standard GenAI attributes used by the bridge" — each carries a pointer here.
- Link rules, parent-selection, content-mode semantics, dedupe: authoritative in `attribute-link-contract.md`. Hook event inventory: `hook-map.md`. Native-vs-Claude comparison: `claude-code-comparison.md`. Live-fire evidence: `MCP_RUNBOOK.md`.
