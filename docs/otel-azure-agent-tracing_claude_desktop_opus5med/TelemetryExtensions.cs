using System.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Context.Propagation;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Telemetry.ServiceDefaults.Redaction;

namespace Telemetry.ServiceDefaults;

public static class TelemetryExtensions
{
    /// <summary>
    /// Every ActivitySource this library owns. Anything not listed here will
    /// not be sampled — deliberate, so an accidental transitive dependency
    /// cannot start emitting into your traces.
    /// </summary>
    internal static readonly string[] OwnedSources =
    [
        Instrumentation.ActivitySourceName,
        "Microsoft.DurableTask",                       // Durable Task Scheduler auto-instrumentation
        "Azure.*",                                     // Azure SDK client activities
        "Experimental.Microsoft.Agents.AI",            // Microsoft Agent Framework
        "Experimental.Microsoft.Agents.AI.Agent",
        "Experimental.Microsoft.Agents.AI.ChatClient",
        "Experimental.Microsoft.Extensions.AI",
        "Microsoft.SemanticKernel*",
        "OpenAI.*",
    ];

    internal static readonly string[] OwnedMeters =
    [
        Instrumentation.MeterName,
        "Microsoft.AspNetCore.Hosting",
        "Microsoft.AspNetCore.Server.Kestrel",
        "System.Net.Http",
        "System.Runtime",
    ];

    public static IHostApplicationBuilder AddServiceTelemetry(
        this IHostApplicationBuilder builder,
        Action<TelemetryOptions>? configure = null)
    {
        var options = new TelemetryOptions
        {
            ServiceName = builder.Environment.ApplicationName,
            Environment = builder.Environment.EnvironmentName,
        };
        builder.Configuration.GetSection("Telemetry").Bind(options);
        configure?.Invoke(options);

        GuardCaptureMode(options, builder.Environment);

        builder.Services.AddSingleton(options);
        builder.Services.AddSingleton<IContentRedactor, RegexContentRedactor>();
        builder.Services.AddSingleton<Instrumentation>();

        // W3C only. Do not add the legacy B3 propagator unless a specific
        // upstream demands it — every extra propagator is another parse on
        // every inbound request.
        Sdk.SetDefaultTextMapPropagator(new CompositeTextMapPropagator(
        [
            new TraceContextPropagator(),
            new BaggagePropagator(),
        ]));

        var resource = ResourceBuilder.CreateDefault()
            .AddService(
                serviceName: options.ServiceName,
                serviceVersion: options.ServiceVersion,
                serviceInstanceId: System.Environment.MachineName)
            .AddAttributes(
            [
                new("deployment.environment.name", options.Environment),
                new(Sem.Internal.ConventionPinLabel, options.Conventions.GenAiLabel),
                new(Sem.Internal.ContentCaptureMode, options.Capture.ToString().ToLowerInvariant()),
                // App Service supplies these; on other hosts they are simply absent.
                new("azure.app_service.site_name", Env("WEBSITE_SITE_NAME")),
                new("azure.app_service.slot_name", Env("WEBSITE_SLOT_NAME")),
                new("azure.app_service.instance_id", Env("WEBSITE_INSTANCE_ID")),
                new("cloud.region", Env("REGION_NAME")),
            ]);

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
            logging.SetResourceBuilder(resource);
        });

        builder.Services.AddOpenTelemetry()
            .WithTracing(tracing =>
            {
                tracing.SetResourceBuilder(resource);

                // Head sampling stays at 1.0 by default. The decision that
                // matters — keep errors, keep slow, sample the boring 5% —
                // requires seeing the whole trace, which only the Collector's
                // tail_sampling processor can do.
                tracing.SetSampler(options.HeadSampleRatio >= 1.0
                    ? new ParentBasedSampler(new AlwaysOnSampler())
                    : new ParentBasedSampler(new TraceIdRatioBasedSampler(options.HeadSampleRatio)));

                tracing.AddAspNetCoreInstrumentation(o =>
                {
                    o.RecordException = true;
                    o.Filter = ctx => !IsNoise(ctx.Request.Path);
                });

                tracing.AddHttpClientInstrumentation(o => o.RecordException = true);

                // SqlClient instrumentation is still beta upstream. Pin it
                // explicitly; do not rely on a distro vendoring it in, or you
                // get double registration when you later add one.
                tracing.AddSqlClientInstrumentation(o =>
                {
                    o.RecordException = true;
                    // db.query.text is STABLE, but see docs/data-stores.md:
                    // enabling statement text on SQL Server carries a real cost
                    // and is a PII surface. Off unless capture allows it.
                    o.SetDbStatementForText = options.Capture != ContentCapture.None;
                    o.EnableConnectionLevelAttributes = true;
                });

                tracing.AddEntityFrameworkCoreInstrumentation(o =>
                {
                    o.SetDbStatementForText = options.Capture != ContentCapture.None;
                });

                foreach (var s in OwnedSources) tracing.AddSource(s);
                foreach (var s in options.AdditionalSources) tracing.AddSource(s);

                // Redaction runs as a processor so it applies uniformly to
                // spans from instrumentation we do not control (Azure SDK,
                // Agent Framework) as well as our own.
                tracing.AddProcessor(sp =>
                    new ContentGuardProcessor(
                        options,
                        sp.GetRequiredService<IContentRedactor>()));

                ConfigureExporters(tracing, options);
            })
            .WithMetrics(metrics =>
            {
                metrics.SetResourceBuilder(resource);
                metrics.AddAspNetCoreInstrumentation();
                metrics.AddHttpClientInstrumentation();
                metrics.AddRuntimeInstrumentation();

                foreach (var m in OwnedMeters) metrics.AddMeter(m);
                foreach (var m in options.AdditionalMeters) metrics.AddMeter(m);

                // Delta temporality is not optional if Azure Monitor is ever
                // downstream — its metric experiences require delta plus
                // exponential histograms. Setting it here means the Collector
                // does not need cumulativetodelta for this service.
                metrics.AddOtlpExporter((exp, reader) =>
                {
                    ApplyEndpoint(exp, options);
                    reader.TemporalityPreference = MetricReaderTemporalityPreference.Delta;
                });

                if (options.ConsoleExporter) metrics.AddConsoleExporter();
            });

        return builder;
    }

    private static void ConfigureExporters(TracerProviderBuilder tracing, TelemetryOptions options)
    {
        tracing.AddOtlpExporter(exp =>
        {
            ApplyEndpoint(exp, options);
            // Default schedule is 5s. Integration tests that assert on trace
            // arrival should either shorten this or call ForceFlush() — the
            // exporter retries silently with backoff and does not flush the
            // instant a downed backend returns.
            exp.BatchExportProcessorOptions = new()
            {
                ScheduledDelayMilliseconds = 5_000,
                MaxQueueSize = 4_096,
                MaxExportBatchSize = 1_024,
            };
        });

        if (options.ConsoleExporter) tracing.AddConsoleExporter();
    }

    private static void ApplyEndpoint(
        OpenTelemetry.Exporter.OtlpExporterOptions exp, TelemetryOptions options)
    {
        exp.Endpoint = new Uri(options.OtlpEndpoint);
        exp.Protocol = options.Protocol == OtlpProtocol.Grpc
            ? OpenTelemetry.Exporter.OtlpExportProtocol.Grpc
            : OpenTelemetry.Exporter.OtlpExportProtocol.HttpProtobuf;
    }

    /// <summary>
    /// Full capture writes prompts, completions and tool results into spans.
    /// That is correct for the session-tracing product and wrong for a
    /// regulated deployment. Fail loudly rather than leak quietly.
    /// </summary>
    private static void GuardCaptureMode(TelemetryOptions options, IHostEnvironment env)
    {
        if (options.Capture != ContentCapture.Full) return;

        var acknowledged = System.Environment.GetEnvironmentVariable(
            "ACME_ACKNOWLEDGE_FULL_CONTENT_CAPTURE") == "true";

        if (!acknowledged)
        {
            throw new InvalidOperationException(
                "ContentCapture.Full records verbatim prompts, completions and tool " +
                "results into spans. Set ACME_ACKNOWLEDGE_FULL_CONTENT_CAPTURE=true to " +
                "confirm the destination backend is scoped to hold that data.");
        }
    }

    private static bool IsNoise(PathString path) =>
        path.StartsWithSegments("/health")
        || path.StartsWithSegments("/ready")
        || path.StartsWithSegments("/alive")
        || path.StartsWithSegments("/metrics");

    private static string Env(string key) =>
        System.Environment.GetEnvironmentVariable(key) ?? string.Empty;
}
