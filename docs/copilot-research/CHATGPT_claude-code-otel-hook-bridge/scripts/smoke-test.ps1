[CmdletBinding()]
param(
    [string]$BridgeUrl = 'http://127.0.0.1:4319/hooks',
    [string]$FlushUrl = 'http://127.0.0.1:4319/flush'
)

$ErrorActionPreference = 'Stop'
$sessionId = "smoke-session-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$promptId = '550e8400-e29b-41d4-a716-446655440000'
$toolOne = 'toolu_smoke_01'
$toolTwo = 'toolu_smoke_02'
$headers = @{ traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' }

function Send-HookEvent {
    param([Parameter(Mandatory)][hashtable]$Body)
    Invoke-RestMethod -Method Post -Uri $BridgeUrl -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 20 -Compress) | Out-Null
}

Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; permission_mode = 'default'
    hook_event_name = 'UserPromptSubmit'; prompt = 'Run a smoke-test tool batch'
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; permission_mode = 'default'
    hook_event_name = 'PreToolUse'; tool_name = 'Bash'; tool_use_id = $toolOne
    tool_input = @{ command = 'Write-Output smoke-one'; description = 'Synthetic smoke tool' }
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; permission_mode = 'default'
    hook_event_name = 'PermissionRequest'; tool_name = 'Bash'
    tool_input = @{ command = 'Write-Output smoke-one' }; permission_suggestions = @()
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; permission_mode = 'default'
    hook_event_name = 'PostToolUse'; tool_name = 'Bash'; tool_use_id = $toolOne; duration_ms = 12
    tool_input = @{ command = 'Write-Output smoke-one' }
    tool_response = @{ stdout = 'smoke-one'; stderr = ''; interrupted = $false }
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; permission_mode = 'default'
    hook_event_name = 'PreToolUse'; tool_name = 'Read'; tool_use_id = $toolTwo
    tool_input = @{ file_path = 'C:\smoke\repo\README.md' }
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; permission_mode = 'default'
    hook_event_name = 'PostToolUse'; tool_name = 'Read'; tool_use_id = $toolTwo; duration_ms = 4
    tool_input = @{ file_path = 'C:\smoke\repo\README.md' }
    tool_response = @{ filePath = 'C:\smoke\repo\README.md'; success = $true }
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; permission_mode = 'default'
    hook_event_name = 'PostToolBatch'
    tool_calls = @(
        @{ tool_name = 'Bash'; tool_use_id = $toolOne; tool_input = @{ command = 'Write-Output smoke-one' }; tool_response = 'smoke-one' },
        @{ tool_name = 'Read'; tool_use_id = $toolTwo; tool_input = @{ file_path = 'C:\smoke\repo\README.md' }; tool_response = 'README content' }
    )
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; hook_event_name = 'MessageDisplay'
    turn_id = 'turn-smoke'; message_id = 'message-smoke'; index = 0; final = $false; delta = 'Smoke'
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; hook_event_name = 'MessageDisplay'
    turn_id = 'turn-smoke'; message_id = 'message-smoke'; index = 1; final = $true; delta = ' test complete.'
}
Send-HookEvent @{
    session_id = $sessionId; prompt_id = $promptId; cwd = 'C:\smoke\repo'; permission_mode = 'default'
    hook_event_name = 'Stop'; stop_hook_active = $false; last_assistant_message = 'Smoke test complete.'
    background_tasks = @(); session_crons = @()
}

Invoke-RestMethod -Method Post -Uri $FlushUrl | Out-Null
Write-Host "Smoke trace submitted. session_id=$sessionId prompt_id=$promptId"
Write-Host 'Inspect: docker compose logs --since=2m otel-collector'
