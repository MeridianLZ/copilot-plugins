using System.Diagnostics;
using Microsoft.DurableTask;

namespace Telemetry.ServiceDefaults.Durable;

/// <summary>
/// Replay-safe span creation for Durable Functions orchestrators.
///
/// READ THIS FIRST: if your function app uses the Durable Task Scheduler
/// backend, you do not need this class. DTS auto-instruments orchestrations,
/// activities, sub-orchestrations and timers, and propagates context across all
/// of them. You register the "Microsoft.DurableTask" ActivitySource (already in
/// TelemetryExtensions.OwnedSources) and you are done.
///
/// This class exists for the classic Azure Storage / MSSQL / Netherite
/// backends, where you get nothing automatically.
///
/// The problem it solves: Durable orchestrators are event-sourced. When an
/// activity completes, the orchestrator function is re-executed from the top,
/// replaying every prior decision from history. Naive ActivitySource usage
/// therefore emits a duplicate span on every replay — an orchestration with 12
/// activities produces 78 spans instead of 12, all with wrong timings.
///
/// The fix is to check IsReplaying before creating anything. During replay the
/// orchestrator is reconstructing known state, not doing work, so there is
/// nothing to record.
/// </summary>
public static class DurableTracing
{
    private static readonly ActivitySource Source = new(Instrumentation.ActivitySourceName);

    /// <summary>
    /// Wraps an orchestrator step. Returns null (and creates nothing) while
    /// replaying, so `using var _ = ...` is safe and cheap on replay passes.
    /// </summary>
    public static Activity? StartOrchestrationStep(
        TaskOrchestrationContext context,
        string stepName)
    {
        if (context.IsReplaying) return null;

        var activity = Source.StartActivity($"orchestration.{stepName}", ActivityKind.Internal);
        activity?.SetTag("durable.instance_id", context.InstanceId);
        activity?.SetTag("durable.step", stepName);

        // Orchestrator wall-clock must come from the context, never from
        // DateTime.UtcNow — the latter is nondeterministic across replays and
        // will corrupt the orchestration, not just the telemetry.
        activity?.SetTag("durable.current_utc", context.CurrentUtcDateTime.ToString("O"));

        return activity;
    }

    /// <summary>
    /// Orchestration-level root span. Create once, on the first non-replay
    /// pass. For long-running orchestrations (hours to days) this span will
    /// outlive normal export batching — consider emitting discrete step spans
    /// linked to a stable trace id instead of holding one span open, if your
    /// backend penalises very long spans.
    /// </summary>
    public static Activity? StartOrchestration(
        TaskOrchestrationContext context,
        string orchestrationName)
    {
        if (context.IsReplaying) return null;

        var activity = Source.StartActivity(
            $"{Sem.GenAi.OpInvokeWorkflow} {orchestrationName}", ActivityKind.Server);

        activity?.SetTag("durable.instance_id", context.InstanceId);
        activity?.SetTag("durable.orchestration_name", orchestrationName);
        return activity;
    }

    /// <summary>
    /// Activity functions are ordinary function executions — no replay concern.
    /// Instrument them normally.
    /// </summary>
    public static Activity? StartActivityFunction(string activityName, string instanceId)
    {
        var activity = Source.StartActivity($"activity.{activityName}", ActivityKind.Internal);
        activity?.SetTag("durable.instance_id", instanceId);
        activity?.SetTag("durable.activity_name", activityName);
        return activity;
    }

    /// <summary>
    /// Records a timer wait without holding a span open across it. A durable
    /// timer can span days; an open span across that is useless to every
    /// backend. Emit a zero-width marker at each end instead.
    /// </summary>
    public static void RecordTimer(
        TaskOrchestrationContext context,
        DateTime fireAt,
        string reason)
    {
        if (context.IsReplaying) return;

        using var activity = Source.StartActivity("orchestration.timer", ActivityKind.Internal);
        activity?.SetTag("durable.instance_id", context.InstanceId);
        activity?.SetTag("durable.timer.fire_at", fireAt.ToString("O"));
        activity?.SetTag("durable.timer.reason", reason);
        activity?.SetTag("durable.timer.wait_seconds",
            (fireAt - context.CurrentUtcDateTime).TotalSeconds);
    }
}
