import { app } from 'electron';
import { spawn } from 'child_process';
import { join } from 'path';
import * as fs from 'fs';
import { getAppDataPath, isDev } from './shared/utils.js';
import {
  appendCrashEvent,
  getRuntimeStatePath,
  markCleanShutdown
} from './shared/crash-journal.js';
import { logger } from './shared/logger.js';

const GUARD_DIR = join(getAppDataPath(), 'watchdog');
const WATCHDOG_STATE_FILE = join(GUARD_DIR, 'watchdog-state.json');
const WATCHDOG_LOG_FILE = join(getAppDataPath(), 'logs', 'watchdog.log');
const GUARD_SCRIPT = join(process.resourcesPath, 'process-guardian.ps1');

let guardianMonitorTimer: ReturnType<typeof setInterval> | null = null;
let stoppingGuardianMonitor = false;

function ensureGuardDir(): void {
  if (!fs.existsSync(GUARD_DIR)) fs.mkdirSync(GUARD_DIR, { recursive: true });
}

function appendGuardianLog(message: string, details: Record<string, unknown> = {}): void {
  try {
    ensureGuardDir();
    const entry = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      message,
      ...details
    };
    fs.appendFileSync(
      WATCHDOG_LOG_FILE,
      JSON.stringify(entry) + '\n',
      'utf8'
    );
  } catch {}
}

function getWatchdogState(): { pid?: number; lastHeartbeatAt?: string } | null {
  try {
    if (!fs.existsSync(WATCHDOG_STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(WATCHDOG_STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isGuardianHealthy(maxHeartbeatAgeMs = 15000): boolean {
  const state = getWatchdogState();
  if (!state?.pid || !state.lastHeartbeatAt) return false;
  if (!isProcessAlive(state.pid)) return false;

  const heartbeatMs = Date.parse(state.lastHeartbeatAt);
  if (!Number.isFinite(heartbeatMs)) return false;

  return Date.now() - heartbeatMs <= maxHeartbeatAgeMs;
}

function launchGuardian(): void {
  if (!app.isPackaged || process.platform !== 'win32') return;
  ensureGuardDir();

  if (!fs.existsSync(GUARD_SCRIPT)) {
    appendGuardianLog('Guardian script not found', { script: GUARD_SCRIPT });
    appendCrashEvent('watchdog-script-missing', { script: GUARD_SCRIPT });
    return;
  }

  try {
    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-STA',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      GUARD_SCRIPT,
      '-ParentPid',
      String(process.pid),
      '-ExePath',
      process.execPath,
      '-StatePath',
      getRuntimeStatePath(),
      '-WatchdogStatePath',
      WATCHDOG_STATE_FILE,
      '-LogPath',
      WATCHDOG_LOG_FILE
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    child.unref();
    appendGuardianLog('Independent watchdog launch requested', {
      mainPid: process.pid,
      exePath: process.execPath,
      script: GUARD_SCRIPT
    });
    appendCrashEvent('independent-watchdog-launch-requested', {
      exePath: process.execPath
    });
  } catch (error) {
    logger.error('Failed to launch independent watchdog:', error);
    appendGuardianLog('Independent watchdog launch failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    appendCrashEvent('independent-watchdog-launch-failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function armProcessGuardian(): void {
  if (process.platform !== 'win32' || isDev() || !app.isPackaged) return;
  launchGuardian();
}

export function startProcessGuardianMonitor(): void {
  if (process.platform !== 'win32' || isDev() || !app.isPackaged) return;
  if (guardianMonitorTimer) return;

  stoppingGuardianMonitor = false;
  guardianMonitorTimer = setInterval(() => {
    if (stoppingGuardianMonitor || (app as any).isQuitting) return;

    if (!isGuardianHealthy()) {
      appendGuardianLog('Independent watchdog missing or stale; relaunching');
      appendCrashEvent('independent-watchdog-unhealthy');
      launchGuardian();
    }
  }, 5000);
}

export function stopProcessGuardianMonitor(): void {
  stoppingGuardianMonitor = true;
  if (guardianMonitorTimer) {
    clearInterval(guardianMonitorTimer);
    guardianMonitorTimer = null;
  }
}

export { markCleanShutdown };
