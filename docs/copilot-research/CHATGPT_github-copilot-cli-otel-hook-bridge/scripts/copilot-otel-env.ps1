[CmdletBinding()]
param(
    [string]$Endpoint = 'http://127.0.0.1:14318'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot '.copilot\telemetry') | Out-Null
$env:COPILOT_OTEL_ENABLED = 'true'
$env:COPILOT_OTEL_EXPORTER_TYPE = 'otlp-http'
$env:OTEL_EXPORTER_OTLP_ENDPOINT = $Endpoint
$env:OTEL_EXPORTER_OTLP_PROTOCOL = 'http/protobuf'
$env:OTEL_SERVICE_NAME = 'github-copilot'
$env:OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'false'
Write-Host "Copilot native OTel -> $Endpoint (http/protobuf)"
