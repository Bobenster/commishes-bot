<# 
.SYNOPSIS
    Canonical launcher for the stable Commishes Control Center build.

.DESCRIPTION
    There is one production launch path: this script builds the current source when
    the packaged build is missing/outdated, then starts the same packaged EXE.
    run.bat and npm run launch both call this script.
#>

param(
    [switch]$Build,
    [switch]$Dev
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

$appDir = Join-Path $scriptDir "out\commishes-control-center-win32-x64"
$exePath = Join-Path $appDir "commishes-control-center.exe"
$buildInfoPaths = @(
    (Join-Path $appDir "resources\.build\build-info.json"),
    (Join-Path $appDir "resources\build-info.json")
)

if ($Dev) {
    Write-Host "Starting development mode..." -ForegroundColor Cyan
    npm run dev
    exit $LASTEXITCODE
}

function Get-CurrentGitCommit {
    try {
        return (git rev-parse HEAD 2>$null).Trim()
    } catch {
        return ""
    }
}

function Get-LatestProjectWriteTime {
    $files = @()

    foreach ($folder in @("src", "scripts")) {
        $path = Join-Path $scriptDir $folder
        if (Test-Path $path) {
            $files += Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue
        }
    }

    foreach ($name in @(
        "package.json",
        "package-lock.json",
        "forge.config.ts",
        "vite.main.config.ts",
        "vite.preload.config.ts",
        "vite.renderer.config.ts",
        "run.ps1",
        "run.bat"
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

function Get-PackagedBuildInfo {
    foreach ($path in $buildInfoPaths) {
        if (Test-Path $path) {
            try {
                return Get-Content -Raw $path | ConvertFrom-Json
            } catch {
                # Try the fallback location.
            }
        }
    }

    return $null
}

$needsBuild = $Build -or -not (Test-Path $exePath)

if (-not $needsBuild) {
    $info = Get-PackagedBuildInfo
    $currentCommit = Get-CurrentGitCommit

    if ($null -eq $info) {
        $needsBuild = $true
        Write-Host "Build identity missing." -ForegroundColor Yellow
    } elseif ($currentCommit -and $info.sourceCommit -ne $currentCommit) {
        $needsBuild = $true
        Write-Host "Packaged build is from commit $($info.sourceShort), current source is $($currentCommit.Substring(0,7))." -ForegroundColor Yellow
    } else {
        $latestSource = Get-LatestProjectWriteTime
        $exeTime = (Get-Item $exePath).LastWriteTimeUtc

        if ($latestSource -gt $exeTime) {
            $needsBuild = $true
            Write-Host "Local source is newer than the packaged build." -ForegroundColor Yellow
        }
    }
}

if ($needsBuild) {
    Write-Host "Building the one current production version..." -ForegroundColor Yellow
    npm run build

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed. The stable application was not started."
        exit 1
    }
}

if (-not (Test-Path $exePath)) {
    Write-Error "Executable not found: $exePath"
    exit 1
}

$finalInfo = Get-PackagedBuildInfo
if ($null -ne $finalInfo) {
    Write-Host "Starting build v$($finalInfo.version) / $($finalInfo.sourceShort)..." -ForegroundColor Green
} else {
    Write-Host "Starting packaged application..." -ForegroundColor Green
}

Start-Process -FilePath $exePath -WorkingDirectory $appDir
