using System.Diagnostics;
using Telemetry.ServiceDefaults.Redaction;

namespace Telemetry.ServiceDefaults.GenAi;

/// <summary>
/// Manual GenAI spans for the parts Microsoft Agent Framework does not cover,
/// and for non-MAF agents.
///
/// If you are on MAF, most of this happens for you once ENABLE_INSTRUMENTATION
/// is set — MAF emits gen_ai.* spans natively. Use this class for:
///   - session/turn framing above the agent invocation
///   - tools you dispatch yourself
///   - provider-hosted MCP tools, which MAF cannot see (see StartUnobservedTool)
///
/// Every attribute name comes from <see cref="Sem.GenAi"/> so a convention
/// rename is a one-file change. Every span carries the convention pin label.
/// </summary>
public sealed class AgentTracing(TelemetryOptions options, IContentRedactor redactor)
{
    private static readonly ActivitySource Source = new(Instrumentation.ActivitySourceName);

    /// <summary>
    /// Session-level frame. Not a GenAI convention span — it is ours, and it
    /// is what makes session replay possible in the tracing product. One per
    /// user-visible conversation, spanning many turns.
    /// </summary>
    public Activity? StartSession(string sessionId)
    {
        var activity = Source.StartActivity("agent.session", ActivityKind.Server);
        activity?.SetTag(Sem.Internal.SessionId, sessionId);
        activity?.SetTag(Sem.Internal.ConventionPinLabel, options.Conventions.GenAiLabel);
        return activity;
    }

    public Activity? StartTurn(string sessionId, int turnIndex)
    {
        var activity = Source.StartActivity("agent.turn", ActivityKind.Internal);
        activity?.SetTag(Sem.Internal.SessionId, sessionId);
        activity?.SetTag(Sem.Internal.TurnIndex, turnIndex);
        return activity;
    }

    public Activity? StartInvokeAgent(string agentName, string? agentId = null, string? conversationId = null)
    {
        var activity = Source.StartActivity(
            $"{Sem.GenAi.OpInvokeAgent} {agentName}", ActivityKind.Client);

        if (activity is null) return null;

        activity.SetTag(Sem.GenAi.OperationName, Sem.GenAi.OpInvokeAgent);
        activity.SetTag(Sem.GenAi.AgentName, agentName);
        if (agentId is not null) activity.SetTag(Sem.GenAi.AgentId, agentId);
        if (conversationId is not null) activity.SetTag(Sem.GenAi.ConversationId, conversationId);
        activity.SetTag(Sem.Internal.ConventionPinLabel, options.Conventions.GenAiLabel);

        return activity;
    }

    public Activity? StartChat(string system, string requestModel)
    {
        var activity = Source.StartActivity(
            $"{Sem.GenAi.OpChat} {requestModel}", ActivityKind.Client);

        if (activity is null) return null;

        activity.SetTag(Sem.GenAi.OperationName, Sem.GenAi.OpChat);
        activity.SetTag(Sem.GenAi.SystemName, system);
        activity.SetTag(Sem.GenAi.RequestModel, requestModel);
        activity.SetTag(Sem.Internal.ConventionPinLabel, options.Conventions.GenAiLabel);

        return activity;
    }

    /// <summary>
    /// Token counts and finish reasons are structural, not content — they are
    /// recorded at every capture level, including None. They are also what the
    /// usage-metering work needs, so never gate them behind content capture.
    /// </summary>
    public void RecordCompletion(
        Activity? activity,
        string? responseModel,
        string? responseId,
        int inputTokens,
        int outputTokens,
        IEnumerable<string>? finishReasons = null)
    {
        if (activity is null) return;

        if (responseModel is not null) activity.SetTag(Sem.GenAi.ResponseModel, responseModel);
        if (responseId is not null) activity.SetTag(Sem.GenAi.ResponseId, responseId);
        activity.SetTag(Sem.GenAi.UsageInputTokens, inputTokens);
        activity.SetTag(Sem.GenAi.UsageOutputTokens, outputTokens);
        if (finishReasons is not null)
            activity.SetTag(Sem.GenAi.ResponseFinishReasons, finishReasons.ToArray());
    }

    /// <summary>
    /// Prompt/completion content. Gated by capture mode — this is the one
    /// place verbatim text can enter a span.
    /// </summary>
    public void RecordContent(Activity? activity, string role, string content)
    {
        if (activity is null) return;

        switch (options.Capture)
        {
            case ContentCapture.None:
                // Length only. Enough to spot a runaway prompt without holding it.
                activity.SetTag($"acme.gen_ai.{role}.length", content.Length);
                return;

            case ContentCapture.Redacted:
                var result = redactor.Redact(content);
                activity.SetTag($"acme.gen_ai.{role}.content", result.Text);
                activity.SetTag(Sem.Internal.RedactionApplied, true);
                activity.SetTag(Sem.Internal.RedactionHitCount, result.HitCount);
                return;

            case ContentCapture.Full:
                activity.SetTag($"acme.gen_ai.{role}.content", content);
                activity.SetTag(Sem.Internal.RedactionApplied, false);
                return;
        }
    }

    // ------------------------------------------------------------------ tools

    /// <summary>
    /// A tool your process dispatches. Full fidelity: real timing, real errors.
    /// </summary>
    public Activity? StartExecuteTool(string toolName, string? toolCallId = null, string toolType = "function")
    {
        var activity = Source.StartActivity(
            $"{Sem.GenAi.OpExecuteTool} {toolName}", ActivityKind.Internal);

        if (activity is null) return null;

        activity.SetTag(Sem.GenAi.OperationName, Sem.GenAi.OpExecuteTool);
        activity.SetTag(Sem.GenAi.ToolName, toolName);
        activity.SetTag(Sem.GenAi.ToolType, toolType);
        if (toolCallId is not null) activity.SetTag(Sem.GenAi.ToolCallId, toolCallId);
        activity.SetTag(Sem.Internal.ToolCallUnobserved, false);

        return activity;
    }

    /// <summary>
    /// A provider-hosted MCP tool call that we could NOT instrument.
    ///
    /// When you configure a tool through FoundryChatClient.get_mcp_tool(...),
    /// OpenAIChatClient.get_mcp_tool(...) or a Foundry hosted-agent toolbox,
    /// the tools/call message is issued by the provider's runtime, not by this
    /// process. There is no outbound request for us to inject traceparent into
    /// and no inbound response carrying a child span. The execution is real but
    /// invisible.
    ///
    /// Rather than leave a silent hole, emit a span marked
    /// acme.tool.unobserved=true, reconstructed from the model response. Its
    /// duration is NOT the tool's duration — it is a zero-width marker at the
    /// point the result appeared. Alert on the ratio of unobserved to observed
    /// tool calls; a rising ratio means trace coverage is eroding.
    ///
    /// Fix, when you need real numbers: self-host the MCP server and reach it
    /// with MCPStreamableHTTPTool from this process, which restores injection.
    /// </summary>
    public void RecordUnobservedTool(
        string toolName,
        string? toolCallId,
        bool succeeded,
        string? errorType = null)
    {
        using var activity = Source.StartActivity(
            $"{Sem.GenAi.OpExecuteTool} {toolName}", ActivityKind.Internal);

        if (activity is null) return;

        activity.SetTag(Sem.GenAi.OperationName, Sem.GenAi.OpExecuteTool);
        activity.SetTag(Sem.GenAi.ToolName, toolName);
        activity.SetTag(Sem.GenAi.ToolType, "mcp");
        if (toolCallId is not null) activity.SetTag(Sem.GenAi.ToolCallId, toolCallId);

        activity.SetTag(Sem.Internal.ToolCallUnobserved, true);
        activity.SetTag("acme.tool.unobserved_reason", "provider_hosted_mcp");

        if (!succeeded)
        {
            activity.SetStatus(ActivityStatusCode.Error);
            if (errorType is not null) activity.SetTag("error.type", errorType);
        }
    }

    /// <summary>
    /// Tool arguments, gated. At None we record the argument key names only —
    /// enough to see which parameters were exercised without their values.
    /// </summary>
    public void RecordToolArguments(Activity? activity, IReadOnlyDictionary<string, object?> args)
    {
        if (activity is null) return;

        switch (options.Capture)
        {
            case ContentCapture.None:
                activity.SetTag("acme.gen_ai.tool.argument_names", args.Keys.ToArray());
                return;

            case ContentCapture.Redacted:
                foreach (var (k, v) in args)
                {
                    var text = v?.ToString() ?? string.Empty;
                    activity.SetTag($"acme.gen_ai.tool.argument.{k}", redactor.Redact(text).Text);
                }
                return;

            case ContentCapture.Full:
                foreach (var (k, v) in args)
                    activity.SetTag($"acme.gen_ai.tool.argument.{k}", v?.ToString());
                return;
        }
    }
}
