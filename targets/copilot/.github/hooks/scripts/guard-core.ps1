#!/usr/bin/env pwsh
# Windows parity for the fintech compliance guard (Copilot CLI preToolUse).
# Exit 2 denies the tool call. Copilot treats any non-zero exit as fail-closed deny.
$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()

function Deny([string]$reason) {
  @{ permissionDecision = 'deny'; permissionDecisionReason = $reason } | ConvertTo-Json -Compress
  exit 2
}

try { $p = $raw | ConvertFrom-Json } catch { Deny "Compliance guard could not parse the tool payload." }

$a = if ($p.toolArgs) { $p.toolArgs } elseif ($p.tool_input) { $p.tool_input } else { $null }
if ($a -is [string]) { try { $a = $a | ConvertFrom-Json } catch { $a = $null } }

$content = ''; $file = 'unknown'; $cmd = ''
if ($a) {
  foreach ($k in 'content','new_string','new_str','text') { if ($a.PSObject.Properties.Name -contains $k -and $a.$k) { $content = [string]$a.$k; break } }
  foreach ($k in 'file_path','path','filePath')            { if ($a.PSObject.Properties.Name -contains $k -and $a.$k) { $file    = [string]$a.$k; break } }
  foreach ($k in 'command','cmd')                          { if ($a.PSObject.Properties.Name -contains $k -and $a.$k) { $cmd     = [string]$a.$k; break } }
}

function Test-Luhn([string]$d) {
  if ($d.Length -lt 13) { return $false }
  $sum = 0; $alt = $false
  for ($i = $d.Length - 1; $i -ge 0; $i--) {
    $n = [int]::Parse($d[$i])
    if ($alt) { $n *= 2; if ($n -gt 9) { $n -= 9 } }
    $sum += $n; $alt = -not $alt
  }
  return ($sum % 10) -eq 0
}

if ($content) {
  foreach ($m in [regex]::Matches($content, '(?<![0-9])[3-6][0-9]{3}(?:[ -]?[0-9]{4}){3,4}(?![0-9])')) {
    $digits = ($m.Value -replace '[^0-9]', '')
    if (Test-Luhn $digits) { Deny "Luhn-valid PAN in $file - PCI-DSS 3.4. Use tokenized fixtures (tok_test_visa, 4111-TEST-MASK)." }
  }
  if ($content -match '(?<![0-9])[0-9]{3}-[0-9]{2}-[0-9]{4}(?![0-9])') { Deny "SSN-formatted value in $file. Use masked fixtures (***-**-6789)." }
  if ($content -match '\b(double|float)\s+[A-Za-z_]*(Amount|Balance|Price|Total|Fee|Interest|Debit|Credit)\b') { Deny "Floating-point money type in $file. Money is decimal with an explicit ISO 4217 currency." }
  if ($content -match '\.Database\.Migrate\(\)') { Deny "Database.Migrate() in application startup (SOX). Ship idempotent migration SQL through change control." }
  if ($content -match 'Endpoint=sb://[^;]+;SharedAccessKeyName=') { Deny "Service Bus connection string with key in $file. Inject via External Secrets." }
  if ($content -match '(?i)(client_secret|clientsecret|api[_-]?key|password|sas[_-]?key|SharedAccessKey)["'']?\s*[:=]\s*["''][A-Za-z0-9+/_.-]{16,}') { Deny "Inline secret literal in $file. Reference a Kubernetes Secret / configuration provider." }
  if ($content -match '(?i)(localStorage|sessionStorage)\.(set|get)Item\([^)]*(token|jwt|auth|session|pan|card|account)') { Deny "Auth/sensitive value in browser storage in $file. The BFF owns the session cookie." }
  if ($content -match 'dangerouslySetInnerHTML') { Deny "dangerouslySetInnerHTML is banned ($file). Sanitize server-side and render as text." }
  if ($content -match 'from\s+["'']react-beautiful-dnd["'']') { Deny "react-beautiful-dnd is unmaintained with no React 19 support ($file). Use @dnd-kit/react next-gen." }
  if ($content -match '(?i)(VITE_[A-Z_]*(SECRET|PRIVATE|PASSWORD)|client_secret)\s*[:=]') { Deny "Secret exposed to the client bundle in $file. VITE_* ships to the browser." }
}

if ($cmd) {
  if ($cmd -match 'kubectl\s+(delete|apply|edit|patch|drain|cordon|scale|exec|cp|rollout\s+restart)') { Deny "Direct cluster mutation blocked. Deploys go through CI with a change-control ticket." }
  if ($cmd -match 'helm\s+(install|upgrade|uninstall|rollback)') { Deny "Helm release mutation blocked outside CI. Use 'helm template' / 'helm lint'." }
  if ($cmd -match 'dotnet\s+ef\s+database\s+update') { Deny "Direct migration apply blocked (SOX). Use: dotnet ef migrations script --idempotent" }
  if ($cmd -match '(?i)(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)') { Deny "Destructive SQL blocked. Schema changes ship as reviewed migration scripts." }
  if ($cmd -match '(?i)UPDATE\s+[a-z_.]*ledger|DELETE\s+FROM\s+[a-z_.]*ledger') { Deny "The ledger is append-only. Corrections are new reversal entries." }
  if ($cmd -match '(^|[;&|\s])rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)') { Deny "Recursive force delete blocked." }
  if ($cmd -match 'git\s+push\s+.*(--force(?!-with-lease)|\s-f(\s|$))') { Deny "Force push blocked - git history is SOX audit evidence." }
  if ($cmd -match '(cat|less|more|head|tail|grep|bat|strings|Get-Content)\s+[^|;]*\.(env|pfx|pem|key|p12|jks)(\s|$)') { Deny "Reading credential or key files is blocked." }
  if ($cmd -match 'kubectl\s+get\s+secrets?(\s|$).*(-o|--output)') { Deny "Reading Kubernetes secret payloads is blocked." }
  if ($cmd -match '(curl|wget|Invoke-WebRequest)\s+.*(-d\s|--data|--upload-file|-T\s|-Method\s+Post)') { Deny "Outbound data upload from the shell is blocked (exfiltration guard)." }
}

@{ permissionDecision = 'allow' } | ConvertTo-Json -Compress
exit 0
