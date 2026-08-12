using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace Telemetry.ServiceDefaults;

/// <summary>
/// Single owner of the process's ActivitySource and Meter. Registered as a
/// singleton so the names are impossible to typo at a call site and so
/// disposal is handled once.
/// </summary>
public sealed class Instrumentation : IDisposable
{
    public const string ActivitySourceName = "Acme.Agents";
    public const string MeterName = "Acme.Agents";

    public ActivitySource ActivitySource { get; } = new(ActivitySourceName);
    public Meter Meter { get; }

    /// <summary>
    /// gen_ai.client.token.usage — the metric the usage-metering work needs.
    /// Recorded at every capture level; token counts are structural, not content.
    /// Dimension on gen_ai.request.model and gen_ai.operation.name only —
    /// adding session or user id here will blow up cardinality.
    /// </summary>
    public Histogram<long> TokenUsage { get; }

    /// <summary>gen_ai.client.operation.duration, seconds.</summary>
    public Histogram<double> OperationDuration { get; }

    /// <summary>
    /// Ratio watchdog for the hosted-MCP blind spot. Increment on every tool
    /// call with unobserved=true|false; alert when the true rate climbs.
    /// </summary>
    public Counter<long> ToolCalls { get; }

    public Instrumentation()
    {
        Meter = new Meter(MeterName);

        TokenUsage = Meter.CreateHistogram<long>(
            Sem.GenAi.MetricTokenUsage,
            unit: "{token}",
            description: "Number of input and output tokens used.");

        OperationDuration = Meter.CreateHistogram<double>(
            Sem.GenAi.MetricOperationDuration,
            unit: "s",
            description: "GenAI operation duration.");

        ToolCalls = Meter.CreateCounter<long>(
            "acme.gen_ai.tool.calls",
            unit: "{call}",
            description: "Tool invocations, split by whether we could observe them.");
    }

    public void Dispose()
    {
        ActivitySource.Dispose();
        Meter.Dispose();
    }
}
