$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$whisperDir = Join-Path $repoRoot "whisper_backend"
$funasrDir = Join-Path $repoRoot "funasr_backend"
$nodeDir = Join-Path $repoRoot ".tools\node-v22.14.0-win-x64"
$pnpmCmd = Join-Path $nodeDir "pnpm.cmd"
$python = Join-Path $backendDir ".venv\Scripts\python.exe"
$logDir = Join-Path $repoRoot "data\logs"

if (-not (Test-Path $python)) {
    throw "Backend Python environment not found: $python"
}
if (-not (Test-Path $pnpmCmd)) {
    throw "pnpm not found: $pnpmCmd"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-PortListening([int]$Port) {
    $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

function Start-HiddenProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )
    $stdout = Join-Path $logDir "$Name.out.log"
    $stderr = Join-Path $logDir "$Name.err.log"
    Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr | Out-Null
    Write-Host "started $Name"
}

function Wait-Url {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 90
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 800
        }
    }
    return $false
}

if (-not (Test-PortListening 8001)) {
    $env:HF_ENDPOINT = "https://hf-mirror.com"
    $env:HF_HUB_DISABLE_XET = "1"
    $env:HF_HUB_DISABLE_TELEMETRY = "1"
    $env:WHISPER_MODEL = "base"
    $env:WHISPER_DEVICE = "cpu"
    $env:WHISPER_COMPUTE_TYPE = "int8"
    Start-HiddenProcess `
        -Name "whisper" `
        -FilePath $python `
        -Arguments @("-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8001") `
        -WorkingDirectory $whisperDir
}

if (-not (Test-PortListening 8002)) {
    $funasrPython = Join-Path $funasrDir ".venv\Scripts\python.exe"
    if (Test-Path $funasrPython) {
        $env:MODELSCOPE_CACHE = Join-Path $funasrDir ".modelscope"
        $env:FUNASR_MODEL = "paraformer-zh-streaming"
        $env:FUNASR_MODEL_REVISION = "v2.0.4"
        Start-HiddenProcess `
            -Name "funasr" `
            -FilePath $funasrPython `
            -Arguments @("-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8002") `
            -WorkingDirectory $funasrDir
    }
}

if (-not (Test-PortListening 8000)) {
    Start-HiddenProcess `
        -Name "backend" `
        -FilePath $python `
        -Arguments @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $backendDir
}

if (-not (Test-PortListening 3000)) {
    $env:PATH = "$nodeDir;$env:PATH"
    $env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
    $env:NEXT_PUBLIC_WHISPER_API_URL = "http://127.0.0.1:8001"
    $env:NEXT_PUBLIC_FUNASR_API_URL = "http://127.0.0.1:8002"
    Start-HiddenProcess `
        -Name "frontend" `
        -FilePath "cmd.exe" `
        -Arguments @("/d", "/c", "`"$pnpmCmd`" dev --hostname 127.0.0.1") `
        -WorkingDirectory $frontendDir
}

$ready = $true
if (-not (Wait-Url "http://127.0.0.1:8001/health")) {
    Write-Warning "Whisper service did not become ready. See data\logs\whisper.err.log"
    $ready = $false
}
if (-not (Wait-Url "http://127.0.0.1:8002/health" 120)) {
    Write-Warning "FunASR service did not become ready. See data\logs\funasr.err.log"
}
if (-not (Wait-Url "http://127.0.0.1:8000/api/health")) {
    Write-Warning "Backend did not become ready. See data\logs\backend.err.log"
    $ready = $false
}
if (-not (Wait-Url "http://127.0.0.1:3000")) {
    Write-Warning "Frontend did not become ready. See data\logs\frontend.err.log"
    $ready = $false
}

Write-Host ""
Write-Host "Local software: http://127.0.0.1:3000"
Write-Host "Backend API:    http://127.0.0.1:8000/docs"
Write-Host "Whisper API:    http://127.0.0.1:8001/health"
Write-Host "Logs:           $logDir"

if (-not $ready) {
    exit 1
}
