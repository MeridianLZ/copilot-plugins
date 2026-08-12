namespace Telemetry.ServiceDefaults;

/// <summary>
/// Attribute name constants, grouped by stability. Never inline these strings
/// at call sites: when a Development-status name changes upstream, you want one
/// file to edit and one place to add a dual-emit shim.
/// </summary>
public static class Sem
{
    /// <summary>
    /// STABLE as of semconv 1.43.0. Safe to build dashboards and alerts on.
    /// </summary>
    public static class Db
    {
        public const string SystemName = "db.system.name";
        public const string Namespace = "db.namespace";
        public const string CollectionName = "db.collection.name";
        public const string OperationName = "db.operation.name";
        public const string QueryText = "db.query.text";        // was db.statement
        public const string QuerySummary = "db.query.summary";
        public const string ResponseStatusCode = "db.response.status_code";
        public const string OperationDuration = "db.client.operation.duration";
    }

    /// <summary>
    /// DEVELOPMENT status. Cosmos extends and overrides the stable DB
    /// conventions but is itself not stable.
    /// </summary>
    public static class Cosmos
    {
        public const string RequestCharge = "azure.cosmosdb.client.operation.request_charge";
        public const string ActiveInstanceCount = "azure.cosmosdb.client.active_instance.count";
        public const string ContactedRegions = "azure.cosmosdb.operation.contacted_regions";
        public const string ConsistencyLevel = "azure.cosmosdb.consistency.level";
    }

    /// <summary>
    /// DEVELOPMENT status. Azure Service Bus / Event Hubs extend and override
    /// the general messaging conventions, which are themselves not yet stable.
    /// Gate migration with OTEL_SEMCONV_STABILITY_OPT_IN=messaging/dup.
    /// </summary>
    public static class Messaging
    {
        public const string System = "messaging.system";
        public const string OperationName = "messaging.operation.name";
        public const string OperationType = "messaging.operation.type";
        public const string DestinationName = "messaging.destination.name";
        public const string DestinationSubscription = "messaging.destination.subscription.name";
        public const string MessageId = "messaging.message.id";
        public const string ConversationId = "messaging.message.conversation_id";
        public const string BatchMessageCount = "messaging.batch.message_count";

        // Azure Service Bus specific
        public const string SbDeliveryCount = "messaging.servicebus.message.delivery_count";
        public const string SbEnqueuedTime = "messaging.servicebus.message.enqueued_time";
        public const string SbDispositionStatus = "messaging.servicebus.disposition_status";

        /// <summary>
        /// The application property the Azure SDK uses to carry trace context.
        /// This is NOT an HTTP header and NOT W3C-named — it predates the
        /// standard propagator path. We write both this and traceparent so
        /// either consumer style links correctly.
        /// </summary>
        public const string LegacyDiagnosticIdProperty = "Diagnostic-Id";

        public const string TraceParentProperty = "traceparent";
        public const string TraceStateProperty = "tracestate";
    }

    /// <summary>
    /// DEVELOPMENT status, and relocated: as of semconv v1.42.0 (2026-06-12)
    /// these live in open-telemetry/semantic-conventions-genai, which has no
    /// tagged release. Expect renames. Everything here is emitted alongside
    /// <see cref="Internal.ConventionPinLabel"/> so consumers can tell which
    /// revision produced a span.
    /// </summary>
    public static class GenAi
    {
        public const string OperationName = "gen_ai.operation.name";
        public const string SystemName = "gen_ai.system";
        public const string RequestModel = "gen_ai.request.model";
        public const string RequestMaxTokens = "gen_ai.request.max_tokens";
        public const string RequestTemperature = "gen_ai.request.temperature";
        public const string ResponseModel = "gen_ai.response.model";
        public const string ResponseId = "gen_ai.response.id";
        public const string ResponseFinishReasons = "gen_ai.response.finish_reasons";
        public const string UsageInputTokens = "gen_ai.usage.input_tokens";
        public const string UsageOutputTokens = "gen_ai.usage.output_tokens";

        public const string AgentId = "gen_ai.agent.id";
        public const string AgentName = "gen_ai.agent.name";
        public const string ConversationId = "gen_ai.conversation.id";

        public const string ToolName = "gen_ai.tool.name";
        public const string ToolCallId = "gen_ai.tool.call.id";
        public const string ToolType = "gen_ai.tool.type";

        // Operation name values
        public const string OpChat = "chat";
        public const string OpInvokeAgent = "invoke_agent";
        public const string OpExecuteTool = "execute_tool";
        public const string OpInvokeWorkflow = "invoke_workflow";

        // Metrics (streaming metrics landed in main-repo v1.41.0 before the split)
        public const string MetricOperationDuration = "gen_ai.client.operation.duration";
        public const string MetricTimeToFirstChunk = "gen_ai.client.operation.time_to_first_chunk";
        public const string MetricTimePerOutputChunk = "gen_ai.client.operation.time_per_output_chunk";
        public const string MetricTokenUsage = "gen_ai.client.token.usage";
    }

    /// <summary>
    /// Attributes we define ourselves. Prefixed to guarantee no collision with
    /// a future upstream name. These are the ones the session-tracing product
    /// depends on and the ones that answer "which pin emitted this".
    /// </summary>
    public static class Internal
    {
        public const string ConventionPinLabel = "acme.semconv.genai.pin";
        public const string ContentCaptureMode = "acme.capture.mode";
        public const string RedactionApplied = "acme.redaction.applied";
        public const string RedactionHitCount = "acme.redaction.hits";

        /// <summary>
        /// Set true on a synthetic span standing in for a provider-hosted MCP
        /// tool call we could not instrument. See docs/hosted-mcp-gap.md.
        /// </summary>
        public const string ToolCallUnobserved = "acme.tool.unobserved";

        public const string SessionId = "acme.session.id";
        public const string TurnIndex = "acme.session.turn";
    }
}
