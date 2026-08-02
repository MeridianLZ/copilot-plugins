#!/usr/bin/env bash
set -euo pipefail

bridge_url="${COPILOT_TRACE_BRIDGE_URL:-http://127.0.0.1:14329/hooks}"
flush_url="${COPILOT_TRACE_FLUSH_URL:-http://127.0.0.1:14329/flush}"
session_id="smoke-session-$(date +%s)"
traceparent="00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

post() {
  local event="$1"
  local body="$2"
  curl --fail --silent --show-error \
    -H 'content-type: application/json' \
    -H "traceparent: ${traceparent}" \
    -H "x-copilot-hook-event: ${event}" \
    --data-binary "${body}" \
    "${bridge_url}/${event}" >/dev/null
}

post sessionStart "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000000000,\"cwd\":\"/smoke/repo\",\"source\":\"new\",\"initialPrompt\":\"Run smoke test\"}"
post userPromptSubmitted "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000001000,\"cwd\":\"/smoke/repo\",\"prompt\":\"Run smoke test\"}"
post userPromptTransformed "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000001500,\"cwd\":\"/smoke/repo\",\"prompt\":\"Run smoke test\",\"transformedPrompt\":\"[runtime context] Run smoke test\"}"
post preToolUse "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000002000,\"cwd\":\"/smoke/repo\",\"toolName\":\"bash\",\"toolArgs\":{\"command\":\"printf smoke\"}}"
post permissionRequest "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000002100,\"cwd\":\"/smoke/repo\",\"toolName\":\"bash\",\"toolArgs\":{\"command\":\"printf smoke\"}}"
post postToolUse "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000003000,\"cwd\":\"/smoke/repo\",\"toolName\":\"bash\",\"toolArgs\":{\"command\":\"printf smoke\"},\"toolResult\":{\"resultType\":\"success\",\"textResultForLlm\":\"smoke\"}}"
post subagentStart "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000004000,\"cwd\":\"/smoke/repo\",\"agentName\":\"reviewer\",\"agentDisplayName\":\"Reviewer\"}"
post subagentStop "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000005000,\"cwd\":\"/smoke/repo\",\"agentName\":\"reviewer\",\"agentId\":\"agent-smoke\",\"response\":\"Review passed\"}"
post preCompact "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000006000,\"cwd\":\"/smoke/repo\",\"trigger\":\"auto\"}"
post notification "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000006500,\"cwd\":\"/smoke/repo\",\"notificationType\":\"agent_completion\",\"message\":\"Done\"}"
post agentStop "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000007000,\"cwd\":\"/smoke/repo\",\"stopReason\":\"complete\",\"stop_hook_active\":false}"
post sessionEnd "{\"sessionId\":\"${session_id}\",\"timestamp\":1800000008000,\"cwd\":\"/smoke/repo\",\"reason\":\"complete\"}"

curl --fail --silent --show-error -X POST "${flush_url}" >/dev/null
printf 'Smoke trace submitted. session_id=%s\n' "${session_id}"
printf 'Inspect: docker compose logs --since=2m otel-collector\n'
