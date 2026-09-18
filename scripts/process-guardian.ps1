param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$ExePath,
  [Parameter(Mandatory=$true)][string]$StatePath
)

while (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) {
  Start-Sleep -Seconds 2
}

$clean = $false
try {
  $data = Get-Content -Raw -Path $StatePath | ConvertFrom-Json
  $clean = [bool]$data.cleanShutdown
} catch {}

if ($clean) {
  Remove-Item -Force -ErrorAction SilentlyContinue $StatePath
  exit 0
}

$alreadyRunning = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $ExePath }
if (-not $alreadyRunning) {
  Start-Process -FilePath $ExePath
}
