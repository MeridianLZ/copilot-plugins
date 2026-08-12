namespace Telemetry.ServiceDefaults;

/// <summary>
/// Controls how much of a GenAI interaction is recorded.
/// This is the single most important switch in the library: it is the
/// difference between the regulated deployment and the session-tracing product.
/// </summary>
public enum ContentCapture
{
    /// <summary>
    /// Structural only. Span shapes, timings, token counts, tool names,
    /// finish reasons. No prompts, no completions, no tool arguments,
    /// no tool results. This is the regulated default.
    /// </summary>
    None = 0,

    /// <summary>
    /// Structural plus redacted content: prompts and completions pass through
    /// <see cref="Redaction.IContentRedactor"/> before being attached.
    /// Tool arguments are recorded as key names with values elided.
    /// </summary>
    Redacted = 1,

    /// <summary>
    /// Verbatim prompts, completions, tool arguments and tool results.
    /// Required for session replay in the tracing product. Never enable
    /// against a backend that is not scoped to hold that data.
    /// </summary>
    Full = 2,
}

/// <summary>
/// Which convention revision to emit. The GenAI conventions moved out of the
/// main semantic-conventions repo at v1.42.0 (2026-06-12) into
/// open-telemetry/semantic-conventions-genai, which has no tagged release and
/// evolves on main. We therefore pin to a commit, not a version, and record
/// which pin produced a given span so downstream consumers can adapt.
/// </summary>
public sealed class ConventionPin
{
    /// <summary>Commit SHA of semantic-conventions-genai this build targets.</summary>
    public required string GenAiCommit { get; init; }

    /// <summary>Human-readable label, e.g. "genai@2026-07-03".</summary>
    public required string GenAiLabel { get; init; }

    /// <summary>Stable semconv release for db/messaging/http, e.g. "1.43.0".</summary>
    public required string CoreVersion { get; init; }
}

public sealed class TelemetryOptions
{
    /// <summary>Logical service name -> resource attribute service.name.</summary>
    public required string ServiceName { get; set; }

    public string? ServiceVersion { get; set; }

    /// <summary>deployment.environment.name — drives per-env sampling policy.</summary>
    public string Environment { get; set; } = "development";

    /// <summary>
    /// OTLP endpoint. Point this at the self-hosted Collector, never directly
    /// at a vendor. Phase 1: http://otel-collector:4317.
    /// </summary>
    public string OtlpEndpoint { get; set; } = "http://localhost:4317";

    public OtlpProtocol Protocol { get; set; } = OtlpProtocol.Grpc;

    public ContentCapture Capture { get; set; } = ContentCapture.None;

    public ConventionPin Conventions { get; set; } = new()
    {
        GenAiCommit = "PIN_ME",           // set at build time from your vendored copy
        GenAiLabel = "genai@unpinned",
        CoreVersion = "1.43.0",
    };

    /// <summary>
    /// Emit to console as well. Development only.
    /// </summary>
    public bool ConsoleExporter { get; set; }

    /// <summary>
    /// Additional ActivitySource names to subscribe to beyond the built-in set.
    /// </summary>
    public IList<string> AdditionalSources { get; } = new List<string>();

    /// <summary>
    /// Additional Meter names.
    /// </summary>
    public IList<string> AdditionalMeters { get; } = new List<string>();

    /// <summary>
    /// Head sampling ratio. Leave at 1.0 and do the real work in the Collector's
    /// tail_sampling processor — head sampling cannot know whether a trace
    /// errored or was slow, which is exactly what you want to keep.
    /// </summary>
    public double HeadSampleRatio { get; set; } = 1.0;

    /// <summary>
    /// Baggage keys permitted to cross a trust boundary. Baggage is parsed
    /// eagerly on every request; an unbounded allowlist is an availability
    /// risk (cf. the Aspire 13.2.4 baggage DoS). Empty = strip all inbound.
    /// </summary>
    public ISet<string> InboundBaggageAllowlist { get; } =
        new HashSet<string>(StringComparer.Ordinal);
}

public enum OtlpProtocol
{
    Grpc,
    HttpProtobuf,
}
