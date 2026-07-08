#!/usr/bin/env pwsh
Write-Output "[fintech] PCI-DSS v4.0 - SOX ITGC - SOC 2 Type II - GLBA/FFIEC enforced by preToolUse hook."
Write-Output "[fintech] Blocked: PAN/SSN literals, float money, ledger UPDATE/DELETE, kubectl+helm mutations, Database.Migrate(), secret literals, browser token storage."
exit 0
