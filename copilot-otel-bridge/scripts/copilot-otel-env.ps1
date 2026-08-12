[CmdletBinding()]
param(
    [string]$Endpoint = 'http://127.0.0.1:27432'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot '.copilot\telemetry') | Out-Null
$env:COPILOT_OTEL_ENABLED = 'true'
$env:COPILOT_OTEL_EXPORTER_TYPE = 'otlp-http'
$env:OTEL_EXPORTER_OTLP_ENDPOINT = $Endpoint
$env:OTEL_EXPORTER_OTLP_PROTOCOL = 'http/protobuf'
$env:COPILOT_OTEL_SOURCE_NAME = 'copilot'
$env:OTEL_SERVICE_NAME = 'copilot'
$env:OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'true'
Write-Host "Copilot native OTel -> $Endpoint (http/protobuf)"
