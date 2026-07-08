#!/usr/bin/env pwsh
param([string]$Event = 'postToolUse')
$ErrorActionPreference = 'SilentlyContinue'
$raw = [Console]::In.ReadToEnd()
$dir = if ($env:COPILOT_FINTECH_AUDIT_DIR) { $env:COPILOT_FINTECH_AUDIT_DIR } else { Join-Path $HOME '.copilot-fintech-audit' }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
try { $p = $raw | ConvertFrom-Json } catch { exit 0 }
$argsRaw = if ($p.toolArgs) { ($p.toolArgs | ConvertTo-Json -Compress -Depth 6) } else { '' }
$digest = if ($argsRaw) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($argsRaw)) } else { '' }
$rec = [ordered]@{
  ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  user = $env:USERNAME; event = $Event; tool = $p.toolName; cwd = $p.cwd
  args_digest = ($digest -replace '^(.{0,64}).*$','$1')
}
$file = Join-Path $dir ((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd') + '.jsonl')
($rec | ConvertTo-Json -Compress) | Out-File -FilePath $file -Append -Encoding utf8
exit 0
