import { join } from 'path';
import * as fs from 'fs';
import { app, crashReporter } from 'electron';
import { getAppDataPath } from './utils.js';

export interface RuntimeState {
  pid: number;
  startedAt: string;
  lastHeartbeatAt: string;
  cleanShutdown: boolean;
  activeJobId?: string;
  activeJobTitle?: string;
  activeStage?: string;
  activeProgress?: number;
  lastEvent?: string;
  lastEventAt?: string;
  exePath?: string;
}

const LOG_DIR = join(getAppDataPath(), 'logs');
const CRASH_DUMPS_DIR = join(getAppDataPath(), 'crash-dumps');
const WATCHDOG_DIR = join(getAppDataPath(), 'watchdog');
const JOURNAL_PATH = join(LOG_DIR, 'crash-journal.jsonl');
const RUNTIME_STATE_PATH = join(WATCHDOG_DIR, 'process-state.json');

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let runtimeState: RuntimeState | null = null;
let diagnosticsStarted = false;

function ensureDirectories(): void {
  for (const dir of [LOG_DIR, CRASH_DUMPS_DIR, WATCHDOG_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export function getCrashJournalPath(): string {
  ensureDirectories();
  return JOURNAL_PATH;
}

export function getRuntimeStatePath(): string {
  ensureDirectories();
  return RUNTIME_STATE_PATH;
}

export function appendCrashEvent(type: string, details: Record<string, unknown> = {}): void {
  try {
    ensureDirectories();
    fs.appendFileSync(
      JOURNAL_PATH,
      JSON.stringify({ timestamp: new Date().toISOString(), type, pid: process.pid, ...details }) + '\n',
      'utf8'
    );
  } catch {}
}

function persistRuntimeState(): void {
  if (!runtimeState) return;
  try {
    ensureDirectories();
    fs.writeFileSync(RUNTIME_STATE_PATH, JSON.stringify(runtimeState, null, 2), 'utf8');
  } catch {}
}

export function readRuntimeState(): RuntimeState | null {
  try {
    if (!fs.existsSync(RUNTIME_STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(RUNTIME_STATE_PATH, 'utf8')) as RuntimeState;
  } catch {
    return null;
  }
}

export function setRuntimeProgress(progress: {
  jobId: string;
  stage: string;
  progress: number;
  message: string;
}): void {
  if (!runtimeState) return;
  runtimeState.activeJobId = progress.jobId;
  runtimeState.activeStage = progress.stage;
  runtimeState.activeProgress = progress.progress;
  runtimeState.lastEvent = progress.message;
  runtimeState.lastEventAt = new Date().toISOString();
  runtimeState.lastHeartbeatAt = new Date().toISOString();
  persistRuntimeState();
  appendCrashEvent('runner-progress', progress);
}

export function markCleanShutdown(reason = 'app.before-quit'): void {
  if (!runtimeState) runtimeState = readRuntimeState();
  if (runtimeState) {
    runtimeState.cleanShutdown = true;
    runtimeState.lastEvent = reason;
    runtimeState.lastEventAt = new Date().toISOString();
    runtimeState.lastHeartbeatAt = new Date().toISOString();
    persistRuntimeState();
  }
  appendCrashEvent('clean-shutdown-requested', { reason });
}

export function startCrashDiagnostics(): void {
  if (diagnosticsStarted) return;
  diagnosticsStarted = true;
  ensureDirectories();

  const previous = readRuntimeState();
  if (previous && previous.pid !== process.pid && !previous.cleanShutdown) {
    appendCrashEvent('previous-run-unclean', {
      previousPid: previous.pid,
      previousStartedAt: previous.startedAt,
      previousLastHeartbeatAt: previous.lastHeartbeatAt,
      previousActiveJobId: previous.activeJobId,
      previousActiveJobTitle: previous.activeJobTitle,
      previousActiveStage: previous.activeStage,
      previousActiveProgress: previous.activeProgress,
      previousLastEvent: previous.lastEvent
    });
  }

  try {
    app.setPath('crashDumps', CRASH_DUMPS_DIR);
    crashReporter.start({
      productName: 'Commishes Control Center',
      companyName: 'Commishes',
      submitURL: 'https://localhost.invalid/electron-crash',
      uploadToServer: false,
      compress: true
    });
    appendCrashEvent('crash-reporter-started', { crashDumpsDir: CRASH_DUMPS_DIR });
  } catch (error) {
    appendCrashEvent('crash-reporter-start-failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const now = new Date().toISOString();
  runtimeState = {
    pid: process.pid,
    startedAt: now,
    lastHeartbeatAt: now,
    cleanShutdown: false,
    exePath: process.execPath,
    lastEvent: 'main-process-started',
    lastEventAt: now
  };
  persistRuntimeState();
  appendCrashEvent('main-process-started', { exePath: process.execPath });

  heartbeatTimer = setInterval(() => {
    if (runtimeState) {
      runtimeState.lastHeartbeatAt = new Date().toISOString();
      persistRuntimeState();
    }
  }, 2000);
}

export function stopCrashDiagnostics(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  appendCrashEvent('crash-diagnostics-stopped');
}
