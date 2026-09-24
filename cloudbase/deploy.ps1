# Deploy the "lingting" cloud functions (api proxy + database init) to WeChat CloudBase.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
param(
    [string]$BackendBaseUrl = "",
    [string]$EnvId = "cloud1-d9g8ggp3eba5ba3c0",
    [switch]$SkipDb
)

$ErrorActionPreference = "Stop"
[System.Environment]::SetEnvironmentVariable("PATH", $null, "Process")

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nodeDir = Join-Path $repoRoot ".tools\node-v22.14.0-win-x64"
$tcb = Join-Path $repoRoot ".tools\cloudbase\node_modules\.bin\tcb.cmd"
$cloudbaseDir = Join-Path $repoRoot "cloudbase"
$configPath = Join-Path $cloudbaseDir "cloudbaserc.json"

if (-not (Test-Path $tcb)) {
    throw "CloudBase CLI not found: $tcb"
}
$env:PATH = "$nodeDir;$env:PATH"

Write-Host "=== 1/4 check login ==="
& $tcb env:list 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Warning "Not logged in to CloudBase yet. Run one of these first, then re-run this script:"
    Write-Host "  Option A (browser / QR code):"
    Write-Host "    cd `"$cloudbaseDir`""
    Write-Host "    powershell -File `"$tcb`" login"
    Write-Host "  Option B (Tencent Cloud API key, for automation):"
    Write-Host "    tcb login --apiKeyId [SecretId] --apiKey [SecretKey]"
    exit 2
}

$config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$config.envId = $EnvId
if ($BackendBaseUrl) {
    foreach ($fn in $config.functions) {
        if ($fn.name -eq "api") {
            $fn.envVariables.BACKEND_BASE_URL = $BackendBaseUrl.TrimEnd("/")
        }
    }
    Write-Host "api BACKEND_BASE_URL = $BackendBaseUrl"
}
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8

Push-Location $cloudbaseDir
try {
    Write-Host ""
    Write-Host "=== 2/4 deploy api ==="
    & $tcb fn deploy api --force
    if ($LASTEXITCODE -ne 0) { throw "deploy api failed" }

    Write-Host ""
    Write-Host "=== 3/4 deploy initdb ==="
    & $tcb fn deploy initdb --force
    if ($LASTEXITCODE -ne 0) { throw "deploy initdb failed" }

    if (-not $SkipDb) {
        Write-Host ""
        Write-Host "=== 4/4 init database ==="
        & $tcb fn invoke initdb -d "{}" --json
        if ($LASTEXITCODE -ne 0) { throw "init database failed" }
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Done. envId = $EnvId"
Write-Host "  api    : miniprogram -> cloud function -> backend (no domain whitelist needed)"
Write-Host "  initdb : collections sessions / transcripts / notes created"
if (-not $BackendBaseUrl) {
    Write-Warning "Set BACKEND_BASE_URL on the api function, otherwise forwarding will fail."
}
