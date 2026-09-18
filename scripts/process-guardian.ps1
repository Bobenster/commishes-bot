param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$ExePath,
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][string]$WatchdogStatePath,
  [Parameter(Mandatory=$true)][string]$LogPath
)

$ErrorActionPreference = 'SilentlyContinue'
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')

$mutex = New-Object System.Threading.Mutex($false, 'Global\CommishesControlCenterIndependentWatchdog')
try { $mutexAcquired = $mutex.WaitOne(0) } catch { $mutexAcquired = $false }
if (-not $mutexAcquired) { exit 0 }

$watchdogPid = $PID
$currentMainPid = $ParentPid
$restartCount = 0
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$cleanExit = $false

$watchdogDir = Split-Path -Parent $WatchdogStatePath
$logDir = Split-Path -Parent $LogPath
if (-not (Test-Path $watchdogDir)) { New-Item -ItemType Directory -Path $watchdogDir -Force | Out-Null }
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-WatchdogLog([string]$Type, [hashtable]$Details = @{}) {
  try {
    $payload = @{
      timestamp = (Get-Date).ToUniversalTime().ToString('o')
      watchdogPid = $watchdogPid
      mainPid = $currentMainPid
      type = $Type
    }
    foreach ($key in $Details.Keys) { $payload[$key] = $Details[$key] }
    $line = $payload | ConvertTo-Json -Compress
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    Add-Content -LiteralPath (Join-Path $logDir 'crash-journal.jsonl') -Value $line -Encoding UTF8
  } catch {}
}

function Write-WatchdogState([string]$Status, [hashtable]$Extra = @{}) {
  try {
    $payload = @{
      pid = $watchdogPid
      mainPid = $currentMainPid
      startedAt = $startedAt
      lastHeartbeatAt = (Get-Date).ToUniversalTime().ToString('o')
      status = $Status
      restartCount = $restartCount
    }
    foreach ($key in $Extra.Keys) { $payload[$key] = $Extra[$key] }
    $temp = "$WatchdogStatePath.tmp"
    $payload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -Force -LiteralPath $temp -Destination $WatchdogStatePath
  } catch {}
}

function Read-MainState {
  try {
    if (-not (Test-Path $StatePath)) { return $null }
    return Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
  } catch { return $null }
}

function Get-MainProcess {
  try { return Get-Process -Id $currentMainPid -ErrorAction SilentlyContinue } catch { return $null }
}

function Start-MainAfterCrash([string]$Reason, $State) {
  $restartCount++
  Write-WatchdogLog 'main-restart-requested' @{
    reason = $Reason
    previousMainPid = $currentMainPid
    restartCount = $restartCount
    activeJobId = if ($State) { $State.activeJobId } else { $null }
    activeJobTitle = if ($State) { $State.activeJobTitle } else { $null }
    activeStage = if ($State) { $State.activeStage } else { $null }
    activeProgress = if ($State) { $State.activeProgress } else { $null }
    lastEvent = if ($State) { $State.lastEvent } else { $null }
  }

  try {
    $newProcess = Start-Process -FilePath $ExePath -PassThru
    $currentMainPid = $newProcess.Id
    Write-WatchdogLog 'main-restarted' @{ newMainPid = $currentMainPid; reason = $Reason }
    Write-WatchdogState 'main-restarted' @{ reason = $Reason }
  } catch {
    Write-WatchdogLog 'main-restart-failed' @{ reason = $Reason; error = $_.Exception.Message }
    Write-WatchdogState 'restart-failed' @{ reason = $Reason; error = $_.Exception.Message }
  }
}

Write-WatchdogLog 'watchdog-started' @{ exePath = $ExePath; configuredMainPid = $currentMainPid }
Write-WatchdogState 'monitoring'

$notifyIcon = $null
$context = $null
$timer = $null

try {
  $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
  try {
    $appIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($ExePath)
    if ($appIcon) { $notifyIcon.Icon = $appIcon }
  } catch {}

  $notifyIcon.Text = 'Commishes Control Center Watchdog'
  $notifyIcon.Visible = $true

  $menu = New-Object System.Windows.Forms.ContextMenuStrip
  $openItem = $menu.Items.Add('Open Commishes Control Center')
  $openItem.Add_Click({ try { Start-Process -FilePath $ExePath } catch {} })
  $logsItem = $menu.Items.Add('Open Logs')
  $logsItem.Add_Click({ try { Start-Process -FilePath 'explorer.exe' -ArgumentList $logDir } catch {} })
  $statusItem = $menu.Items.Add('Watchdog: Monitoring')
  $statusItem.Enabled = $false

  $notifyIcon.ContextMenuStrip = $menu
  $notifyIcon.Add_DoubleClick({ try { Start-Process -FilePath $ExePath } catch {} })

  $context = New-Object System.Windows.Forms.ApplicationContext
  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 2000

  $timer.Add_Tick({
    try {
      Write-WatchdogState 'monitoring'
      $main = Get-MainProcess

      if ($main) {
        $state = Read-MainState
        if ($state -and $state.lastHeartbeatAt) {
          try {
            $heartbeat = [DateTime]::Parse($state.lastHeartbeatAt).ToUniversalTime()
            $ageSeconds = ((Get-Date).ToUniversalTime() - $heartbeat).TotalSeconds
            if ($ageSeconds -gt 45) {
              Write-WatchdogLog 'main-heartbeat-stale' @{
                ageSeconds = [math]::Round($ageSeconds, 1)
                mainPid = $currentMainPid
                activeJobId = $state.activeJobId
                activeJobTitle = $state.activeJobTitle
                activeStage = $state.activeStage
                activeProgress = $state.activeProgress
                lastEvent = $state.lastEvent
              }
              Start-MainAfterCrash 'Main heartbeat stale for more than 45 seconds' $state
            }
          } catch {}
        }
      } else {
        $state = Read-MainState
        if ($state -and [bool]$state.cleanShutdown) {
          Write-WatchdogLog 'main-closed-cleanly' @{ previousMainPid = $currentMainPid; lastEvent = $state.lastEvent }
          $cleanExit = $true
          $timer.Stop()
          $notifyIcon.Visible = $false
          $context.ExitThread()
          return
        }
        Start-MainAfterCrash 'Main process exited unexpectedly' $state
      }
    } catch {
      Write-WatchdogLog 'watchdog-tick-error' @{ error = $_.Exception.Message }
    }
  })

  $timer.Start()
  [System.Windows.Forms.Application]::Run($context)
} catch {
  Write-WatchdogLog 'tray-init-failed' @{ error = $_.Exception.Message }

  while (-not $cleanExit) {
    Start-Sleep -Seconds 2
    $main = Get-MainProcess
    if ($main) { continue }

    $state = Read-MainState
    if ($state -and [bool]$state.cleanShutdown) { $cleanExit = $true; break }
    Start-MainAfterCrash 'Main process exited unexpectedly (fallback monitor)' $state
  }
} finally {
  if ($timer) { $timer.Stop(); $timer.Dispose() }
  if ($notifyIcon) { $notifyIcon.Visible = $false; $notifyIcon.Dispose() }
  Write-WatchdogState 'stopped'
  try {
    if ($mutexAcquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  } catch {}
}
