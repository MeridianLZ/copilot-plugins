using System.Diagnostics;
using Azure.Messaging.ServiceBus;
using OpenTelemetry;
using OpenTelemetry.Context.Propagation;

namespace Telemetry.ServiceDefaults.Messaging;

/// <summary>
/// Producer/consumer correlation for Azure Service Bus.
///
/// Why links and not parent-child:
/// a message can sit in a queue for hours, be delivered to a competing
/// consumer, be dead-lettered and replayed, or arrive in a batch of 200 from
/// 200 different producers. Parent-child implies the parent is still running
/// and that there is exactly one. Neither holds. A link says "this work was
/// caused by that work" without either claim, which is what actually happened.
///
/// The one case where parent-child IS right: a synchronous request/reply over
/// Service Bus where the producer blocks on the reply. Use
/// <see cref="StartConsumerActivityAsChild"/> there.
/// </summary>
public static class ServiceBusTracing
{
    private static readonly TextMapPropagator Propagator = Propagators.DefaultTextMapPropagator;

    // ---------------------------------------------------------------- producer

    public static Activity? StartProducerActivity(
        ActivitySource source,
        string destination,
        string? conversationId = null)
    {
        var activity = source.StartActivity(
            $"publish {destination}", ActivityKind.Producer);

        if (activity is null) return null;

        activity.SetTag(Sem.Messaging.System, "servicebus");
        activity.SetTag(Sem.Messaging.OperationName, "publish");
        activity.SetTag(Sem.Messaging.OperationType, "send");
        activity.SetTag(Sem.Messaging.DestinationName, destination);
        if (conversationId is not null)
            activity.SetTag(Sem.Messaging.ConversationId, conversationId);

        return activity;
    }

    /// <summary>
    /// Stamp trace context onto the message. We write BOTH the W3C traceparent
    /// property and the legacy Diagnostic-Id the Azure SDK has historically
    /// used, because a consumer may be running either style and there is no
    /// way to know which from the producer side. Cost is ~90 bytes.
    /// </summary>
    public static void InjectContext(ServiceBusMessage message, Activity? activity = null)
    {
        var ctx = activity?.Context ?? Activity.Current?.Context ?? default;
        if (ctx == default) return;

        Propagator.Inject(
            new PropagationContext(ctx, Baggage.Current),
            message.ApplicationProperties,
            static (props, key, value) => props[key] = value);

        // Legacy Azure SDK carrier. Format is the W3C traceparent value.
        message.ApplicationProperties[Sem.Messaging.LegacyDiagnosticIdProperty] =
            $"00-{ctx.TraceId}-{ctx.SpanId}-{(ctx.TraceFlags == ActivityTraceFlags.Recorded ? "01" : "00")}";
    }

    // ---------------------------------------------------------------- consumer

    /// <summary>
    /// The default. Creates a root-ish span linked to the producer, not
    /// parented by it. Correct for queues, topics, retries, and dead-letter
    /// replays.
    /// </summary>
    public static Activity? StartConsumerActivity(
        ActivitySource source,
        ServiceBusReceivedMessage message,
        string destination,
        string? subscription = null)
    {
        var parent = ExtractContext(message);

        var links = parent.ActivityContext == default
            ? Array.Empty<ActivityLink>()
            : new[] { new ActivityLink(parent.ActivityContext) };

        var activity = source.StartActivity(
            name: $"process {destination}",
            kind: ActivityKind.Consumer,
            parentContext: default,          // deliberately NOT parent.ActivityContext
            links: links);

        Decorate(activity, message, destination, subscription);
        return activity;
    }

    /// <summary>
    /// Only for synchronous request/reply where the producer is still blocked.
    /// Produces a conventional parent-child trace.
    /// </summary>
    public static Activity? StartConsumerActivityAsChild(
        ActivitySource source,
        ServiceBusReceivedMessage message,
        string destination,
        string? subscription = null)
    {
        var parent = ExtractContext(message);

        var activity = source.StartActivity(
            name: $"process {destination}",
            kind: ActivityKind.Consumer,
            parentContext: parent.ActivityContext);

        Decorate(activity, message, destination, subscription);
        return activity;
    }

    /// <summary>
    /// One span for a received batch, linked to every distinct producer in it.
    /// Do not create one span per message here — fan out inside, so the batch
    /// receive cost is attributed once.
    /// </summary>
    public static Activity? StartBatchConsumerActivity(
        ActivitySource source,
        IReadOnlyList<ServiceBusReceivedMessage> messages,
        string destination)
    {
        var links = messages
            .Select(ExtractContext)
            .Where(p => p.ActivityContext != default)
            .Select(p => new ActivityLink(p.ActivityContext))
            .ToArray();

        var activity = source.StartActivity(
            name: $"process {destination}",
            kind: ActivityKind.Consumer,
            parentContext: default,
            links: links);

        activity?.SetTag(Sem.Messaging.System, "servicebus");
        activity?.SetTag(Sem.Messaging.OperationName, "process");
        activity?.SetTag(Sem.Messaging.OperationType, "receive");
        activity?.SetTag(Sem.Messaging.DestinationName, destination);
        activity?.SetTag(Sem.Messaging.BatchMessageCount, messages.Count);

        return activity;
    }

    private static PropagationContext ExtractContext(ServiceBusReceivedMessage message)
    {
        var extracted = Propagator.Extract(
            default,
            message.ApplicationProperties,
            static (props, key) =>
                props.TryGetValue(key, out var v) && v is string s ? [s] : Array.Empty<string>());

        if (extracted.ActivityContext != default) return extracted;

        // Fall back to the legacy carrier if the producer predates W3C props.
        if (message.ApplicationProperties.TryGetValue(
                Sem.Messaging.LegacyDiagnosticIdProperty, out var raw)
            && raw is string diagnosticId
            && ActivityContext.TryParse(diagnosticId, null, out var legacy))
        {
            return new PropagationContext(legacy, Baggage.Current);
        }

        return default;
    }

    private static void Decorate(
        Activity? activity,
        ServiceBusReceivedMessage message,
        string destination,
        string? subscription)
    {
        if (activity is null) return;

        activity.SetTag(Sem.Messaging.System, "servicebus");
        activity.SetTag(Sem.Messaging.OperationName, "process");
        activity.SetTag(Sem.Messaging.OperationType, "process");
        activity.SetTag(Sem.Messaging.DestinationName, destination);
        activity.SetTag(Sem.Messaging.MessageId, message.MessageId);
        activity.SetTag(Sem.Messaging.SbDeliveryCount, message.DeliveryCount);

        if (subscription is not null)
            activity.SetTag(Sem.Messaging.DestinationSubscription, subscription);
        if (message.CorrelationId is not null)
            activity.SetTag(Sem.Messaging.ConversationId, message.CorrelationId);

        // Queue residency. Not in the spec, but it is the number you will
        // actually want when someone asks why a workflow took nine minutes.
        if (message.EnqueuedTime != default)
        {
            var residency = DateTimeOffset.UtcNow - message.EnqueuedTime;
            activity.SetTag("acme.messaging.queue_residency_ms", (long)residency.TotalMilliseconds);
            activity.SetTag(Sem.Messaging.SbEnqueuedTime, message.EnqueuedTime.ToString("O"));
        }
    }
}
