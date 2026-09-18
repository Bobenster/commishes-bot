import { app } from 'electron';
import { spawn } from 'child_process';
import { join } from 'path';
import * as fs from 'fs';
import { getAppDataPath, isDev } from './shared/utils.js';
import { logger } from './shared/logger.js';

const GUARD_DIR = join(getAppDataPath(), 'watchdog');
const STATE_FILE = join(GUARD_DIR, 'process-state.json');
const GUARD_SCRIPT = join(process.resourcesPath, 'process-guardian.ps1');

interface GuardianState {
  pid: number;
  cleanShutdown: boolean;
  startedAt: string;
}

function ensureGuardDir(): void {
  if (!fs.existsSync(GUARD_DIR)) fs.mkdirSync(GUARD_DIR, { recursive: true });
}

function writeState(state: GuardianState): void {
  ensureGuardDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function armProcessGuardian(): void {
  if (process.platform !== 'win32' || isDev() || !app.isPackaged) return;

  const pid = process.pid;
  const exe = process.execPath;
  writeState({ pid, cleanShutdown: false, startedAt: new Date().toISOString() });

  try {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      GUARD_SCRIPT,
      '-ParentPid', String(pid),
      '-ExePath', exe,
      '-StatePath', STATE_FILE
    ], { detached: true, stdio: 'ignore', windowsHide: true });

    child.unref();
    logger.info('Process guardian armed', { pid, script: GUARD_SCRIPT });
  } catch (error) {
    logger.error('Failed to arm process guardian:', error);
  }
}

export function markCleanShutdown(): void {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as GuardianState;
    writeState({ ...state, cleanShutdown: true });
  } catch (error) {
    logger.error('Failed to mark clean shutdown:', error);
  }
}
