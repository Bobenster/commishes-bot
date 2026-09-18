<# 
.SYNOPSIS
    Create portable zip package

.DESCRIPTION
    Creates a distributable zip archive of the built application.
#>

param(
    [string]$OutputDir = "dist"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$appDir = Join-Path $scriptDir "out\commishes-control-center-win32-x64"
$outputDir = Join-Path $scriptDir $OutputDir

if (-not (Test-Path $appDir)) {
    Write-Error "Build not found. Run 'npm run build' first."
    exit 1
}

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$version = "1.0.0"
$zipName = "Commishes-Control-Center-v$version-win32-x64-portable.zip"
$zipPath = Join-Path $outputDir $zipName

Write-Host "Creating portable package: $zipName" -ForegroundColor Cyan

# Remove existing zip
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Create zip (excluding node_modules if any)
Compress-Archive -Path "$appDir\*" -DestinationPath $zipPath -Force

$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Package created: $zipPath ($size MB)" -ForegroundColor Green