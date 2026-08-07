[CmdletBinding()]
param(
    [string]$BridgeUrl = 'http://127.0.0.1:14329/hooks',
    [string]$FlushUrl = 'http://127.0.0.1:14329/flush'
)

$ErrorActionPreference = 'Stop'
$sessionId = "smoke-session-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$headers = @{ traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' }

function Send-HookEvent {
    param(
        [Parameter(Mandatory)][string]$Event,
        [Parameter(Mandatory)][hashtable]$Body
    )
    $eventHeaders = @{} + $headers
    $eventHeaders['x-copilot-hook-event'] = $Event
    Invoke-RestMethod -Method Post -Uri "$BridgeUrl/$Event" -Headers $eventHeaders -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 20 -Compress) | Out-Null
}

Send-HookEvent sessionStart @{ sessionId = $sessionId; timestamp = 1800000000000; cwd = 'C:\smoke\repo'; source = 'new'; initialPrompt = 'Run smoke test' }
Send-HookEvent userPromptSubmitted @{ sessionId = $sessionId; timestamp = 1800000001000; cwd = 'C:\smoke\repo'; prompt = 'Run smoke test' }
Send-HookEvent userPromptTransformed @{ sessionId = $sessionId; timestamp = 1800000001500; cwd = 'C:\smoke\repo'; prompt = 'Run smoke test'; transformedPrompt = '[runtime context] Run smoke test' }
Send-HookEvent preToolUse @{ sessionId = $sessionId; timestamp = 1800000002000; cwd = 'C:\smoke\repo'; toolName = 'powershell'; toolArgs = @{ command = 'Write-Output smoke' } }
Send-HookEvent permissionRequest @{ sessionId = $sessionId; timestamp = 1800000002100; cwd = 'C:\smoke\repo'; toolName = 'powershell'; toolArgs = @{ command = 'Write-Output smoke' } }
Send-HookEvent postToolUse @{ sessionId = $sessionId; timestamp = 1800000003000; cwd = 'C:\smoke\repo'; toolName = 'powershell'; toolArgs = @{ command = 'Write-Output smoke' }; toolResult = @{ resultType = 'success'; textResultForLlm = 'smoke' } }
Send-HookEvent preToolUse @{ sessionId = $sessionId; timestamp = 1800000003500; cwd = 'C:\smoke\repo'; toolName = 'powershell'; toolArgs = @{ command = 'Write-Error failure' } }
Send-HookEvent postToolUseFailure @{ sessionId = $sessionId; timestamp = 1800000003600; cwd = 'C:\smoke\repo'; toolName = 'powershell'; toolArgs = @{ command = 'Write-Error failure' }; error = @{ name = 'CommandFailed'; message = 'command exited with status 1'; code = 'EXIT_1' } }
Send-HookEvent errorOccurred @{ sessionId = $sessionId; timestamp = 1800000003700; cwd = 'C:\smoke\repo'; error = @{ name = 'RecoverableSmokeError'; message = 'synthetic recoverable error'; code = 'SMOKE_ERROR' }; recoverable = $true }
Send-HookEvent subagentStart @{ sessionId = $sessionId; timestamp = 1800000004000; cwd = 'C:\smoke\repo'; agentName = 'reviewer'; agentDisplayName = 'Reviewer' }
Send-HookEvent subagentStop @{ sessionId = $sessionId; timestamp = 1800000005000; cwd = 'C:\smoke\repo'; agentName = 'reviewer'; agentId = 'agent-smoke'; response = 'Review passed' }
Send-HookEvent preCompact @{ sessionId = $sessionId; timestamp = 1800000006000; cwd = 'C:\smoke\repo'; trigger = 'auto' }
Send-HookEvent notification @{ sessionId = $sessionId; timestamp = 1800000006500; cwd = 'C:\smoke\repo'; notificationType = 'agent_completion'; message = 'Done' }
Send-HookEvent agentStop @{ sessionId = $sessionId; timestamp = 1800000007000; cwd = 'C:\smoke\repo'; stopReason = 'complete'; stop_hook_active = $false }
Send-HookEvent sessionEnd @{ sessionId = $sessionId; timestamp = 1800000008000; cwd = 'C:\smoke\repo'; reason = 'complete' }

Invoke-RestMethod -Method Post -Uri $FlushUrl | Out-Null
Write-Host "Smoke trace submitted. session_id=$sessionId"
Write-Host 'Inspect: docker compose logs --since=2m otel-collector'
