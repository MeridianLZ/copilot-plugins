# OTel Span, Source, and Conversation Map

This diagram maps the merged Copilot OTel implementation. It distinguishes:

- **Hook-lane spans** emitted by `SpanAssembler`.
- **Native GenAI OTel records** emitted by Copilot, received by the local Collector,
  persisted as sanitized JSONL, and normalized by `NativeOtelCache`.
- **Native transcript events** used for verbatim conversation reconstruction.
- **MCP propagation** and peer-session linkage.
- **Conversation and UI analogs** for each source.

```mermaid
flowchart LR
  subgraph INPUT["Input lanes"]
    H["Copilot hooks<br/>14 lifecycle events"]
    NT["Native transcript<br/>session-state/events.jsonl"]
    NO["Copilot native OTel<br/>OTLP HTTP"]
    MCP["MCP peer boundary<br/>traceparent / tracestate"]
  end

  subgraph INGEST["Local ingestion"]
    HE["Hook envelope normalization<br/>redaction + hash/off/full policy"]
    HA["SpanAssembler"]
    COL["OTel Collector<br/>OTLP traces / metrics / logs"]
    NOC["NativeOtelCache<br/>bounded incremental JSONL reader"]
    NC["NativeSessionCache<br/>bounded incremental transcript reader"]
    MC["MCP telemetry context<br/>extract / inject"]
  end

  subgraph SPANS["Emitted or normalized telemetry"]
    SS["github.copilot.hook.session<br/>sessionStart to sessionEnd"]
    ST["github.copilot.hook.turn<br/>userPromptSubmitted to agentStop"]
    SH["github.copilot.hook.tool<br/>preToolUse to postToolUse"]
    SA["github.copilot.hook.subagent<br/>subagentStart to subagentStop"]
    SP["github.copilot.hook.&lt;event&gt;<br/>point span for every hook event"]
    GI["Native GenAI records<br/>trace / span / parent / attributes"]
    MI["MCP peer records<br/>outer request and inner session"]
  end

  subgraph CORR["Correlation"]
    C["Source records + correlation ledger<br/>exact IDs first, FIFO fallback, explicit gaps"]
    L["Span links<br/>native_traceparent<br/>FIFO tool/agent<br/>sole open tool<br/>last completed turn"]
  end

  subgraph CONV["Conversation projection"]
    TURN["Turn shell"]
    USER["User prompt bubble"]
    ASST["Assistant message bubble"]
    REASON["Reasoning disclosure<br/>text or encrypted marker"]
    PERM["Permission row"]
    TOOL["Tool card<br/>request / result / error"]
    AGENT["Nested subagent conversation"]
    USAGE["Usage footer<br/>model / AIU / tokens"]
    GAP["Explicit gap node<br/>unavailable / unmatched / invalid / late"]
  end

  subgraph UI["Forensic UI"]
    SIDEBAR["Session sidebar"]
    WATER["Span waterfall"]
    FEED["Conversation timeline"]
    INSPECT["Trace inspector<br/>trace/span/parent/model/timing"]
    COVER["Source coverage table<br/>disposition / match / reason / related IDs"]
    LINEAGE["MCP and subagent lineage"]
    CARDS["Disposition cards<br/>redacted / unavailable / invalid / unmatched / heuristic / deduplicated / late"]
  end

  H --> HE --> HA
  HA --> SS
  HA --> ST
  HA --> SH
  HA --> SA
  HA --> SP
  NT --> NC --> C
  NO --> COL --> NOC --> GI
  MCP --> MC --> MI
  SS --> C
  ST --> C
  SH --> C
  SA --> C
  SP --> C
  GI --> C
  MI --> C
  HA -. parent contexts and links .-> L
  MC -. W3C context .-> L
  L --> C

  ST --> TURN
  H -. userPromptSubmitted .-> USER
  NT -. user message .-> USER
  NT -. assistant.message chunks .-> ASST
  NT -. reasoning events .-> REASON
  H -. permissionRequest .-> PERM
  H -. preToolUse/postToolUse .-> TOOL
  NT -. toolCallId joins .-> TOOL
  NT -. agentId/toolCallId .-> AGENT
  GI -. model + usage .-> USAGE
  C -. non-rendered records .-> GAP
  SS --> WATER
  ST --> WATER
  SH --> WATER
  SA --> WATER
  SP --> WATER
  USER --> FEED
  ASST --> FEED
  REASON --> FEED
  PERM --> FEED
  TOOL --> FEED
  AGENT --> FEED
  USAGE --> FEED
  GAP --> FEED
  C --> INSPECT
  C --> COVER
  MI --> LINEAGE
  SA --> LINEAGE
  C --> CARDS
  SS --> SIDEBAR

  classDef input fill:#18202b,stroke:#8b949e,color:#e6edf3;
  classDef ingest fill:#1d2e4a,stroke:#58a6ff,color:#e6edf3;
  classDef span fill:#173b2d,stroke:#3fb950,color:#e6edf3;
  classDef corr fill:#38235a,stroke:#bc8cff,color:#e6edf3;
  classDef conv fill:#3d2e10,stroke:#d29922,color:#e6edf3;
  classDef ui fill:#24292f,stroke:#f0883e,color:#e6edf3;

  class H,NT,NO,MCP input;
  class HE,HA,COL,NOC,NC,MC ingest;
  class SS,ST,SH,SA,SP,GI,MI span;
  class C,L corr;
  class TURN,USER,ASST,REASON,PERM,TOOL,AGENT,USAGE,GAP conv;
  class SIDEBAR,WATER,FEED,INSPECT,COVER,LINEAGE,CARDS ui;
```

## Important current-state boundary

The native transcript is the authoritative source for verbatim assistant prose and
conversation ordering. Native GenAI OTel is authoritative for trace identity,
model, timing, usage, and execution metadata. Hook spans are governance overlays:
they provide lifecycle and policy events, but cannot reconstruct assistant prose
that the hook payload does not contain.

Any source without an exact or bounded heuristic correlation must remain visible as
an explicit coverage disposition. It must not be silently folded into a rendered
conversation node.
