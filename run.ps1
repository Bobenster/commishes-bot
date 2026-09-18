<# 
.SYNOPSIS
    Launch Commishes Control Center

.DESCRIPTION
    Starts the packaged application. If not built yet, offers to build it.
#>

param(
    [switch]$Build,
    [switch]$Dev
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$appDir = Join-Path $scriptDir "out\commishes-control-center-win32-x64"
$exePath = Join-Path $appDir "commishes-control-center.exe"

if ($Dev) {
    Write-Host "Starting in development mode..." -ForegroundColor Cyan
    Set-Location $scriptDir
    npm run dev
    exit
}

if ($Build -or -not (Test-Path $exePath)) {
    Write-Host "Building application..." -ForegroundColor Yellow
    Set-Location $scriptDir
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed!"
        exit 1
    }
}

if (-not (Test-Path $exePath)) {
    Write-Error "Executable not found: $exePath"
    Write-Host "Run with -Build to compile first." -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting Commishes Control Center..." -ForegroundColor Green
Start-Process -FilePath $exePath -WorkingDirectory $appDir