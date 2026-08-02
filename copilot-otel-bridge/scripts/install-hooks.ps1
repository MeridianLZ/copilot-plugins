[CmdletBinding()]
param(
    [string]$TargetRoot = (Get-Location).Path,
    [ValidateSet('project', 'user')][string]$Scope = 'project'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    corepack enable
    pnpm install --no-frozen-lockfile
    pnpm build
    pnpm hooks:generate -- --target $TargetRoot --scope $Scope
    Write-Host "Review the generated hook file, then apply it."
    pnpm hooks:apply -- --target $TargetRoot --scope $Scope
    Write-Host "Installed GitHub Copilot telemetry hooks for scope '$Scope'."
    Write-Host 'Run: docker compose up --build'
    Write-Host 'Then dot-source .\scripts\copilot-otel-env.ps1 before starting copilot.'
}
finally {
    Pop-Location
}
