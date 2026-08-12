[CmdletBinding()]
param(
    [string]$Path
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$otelDir = Join-Path $projectRoot '.copilot\telemetry'
New-Item -ItemType Directory -Force -Path $otelDir | Out-Null
if ([string]::IsNullOrWhiteSpace($Path)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $Path = Join-Path $otelDir "native-otel-$stamp.jsonl"
}
$env:COPILOT_OTEL_ENABLED = 'true'
$env:COPILOT_OTEL_EXPORTER_TYPE = 'file'
$env:COPILOT_OTEL_FILE_EXPORTER_PATH = (Resolve-Path -LiteralPath (Split-Path -Parent $Path) -ErrorAction Stop).Path + [IO.Path]::DirectorySeparatorChar + (Split-Path -Leaf $Path)
$env:COPILOT_OTEL_SOURCE_NAME = 'copilot'
$env:OTEL_SERVICE_NAME = 'copilot'
$env:OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'true'
Write-Host "Copilot native OTel JSONL -> $env:COPILOT_OTEL_FILE_EXPORTER_PATH"
