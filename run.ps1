<# 
.SYNOPSIS
    Launch Commishes Control Center

.DESCRIPTION
    Launches the packaged application. Automatically rebuilds it when source/config
    files are newer than the packaged EXE. Use -Build to force a rebuild or -Dev
    to run the Vite/Electron development environment.
#>

param(
    [switch]$Build,
    [switch]$Dev
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

$appDir = Join-Path $scriptDir "out\commishes-control-center-win32-x64"
$exePath = Join-Path $appDir "commishes-control-center.exe"

if ($Dev) {
    Write-Host "Starting in development mode..." -ForegroundColor Cyan
    npm run dev
    exit $LASTEXITCODE
}

function Get-LatestProjectWriteTime {
    $files = @()

    if (Test-Path (Join-Path $scriptDir "src")) {
        $files += Get-ChildItem (Join-Path $scriptDir "src") -Recurse -File -ErrorAction SilentlyContinue
    }

    foreach ($name in @(
        "package.json",
        "package-lock.json",
        "forge.config.ts",
        "vite.main.config.ts",
        "vite.preload.config.ts",
        "vite.renderer.config.ts",
        "run.ps1",
        "scripts\process-guardian.ps1"
    )) {
        $path = Join-Path $scriptDir $name
        if (Test-Path $path) {
            $files += Get-Item $path
        }
    }

    if ($files.Count -eq 0) {
        return [datetime]::MinValue
    }

    return ($files | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
}

$needsBuild = $Build -or -not (Test-Path $exePath)

if (-not $needsBuild) {
    $latestSource = Get-LatestProjectWriteTime
    $exeTime = (Get-Item $exePath).LastWriteTimeUtc
    $needsBuild = $latestSource -gt $exeTime
}

if ($needsBuild) {
    Write-Host "Packaged build is missing or out of date. Building..." -ForegroundColor Yellow
    npm run build

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed. The packaged application was not started."
        exit 1
    }
}

if (-not (Test-Path $exePath)) {
    Write-Error "Executable not found: $exePath"
    exit 1
}

Write-Host "Starting packaged application..." -ForegroundColor Green
Start-Process -FilePath $exePath -WorkingDirectory $appDir
