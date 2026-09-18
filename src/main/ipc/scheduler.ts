import { ipcMain } from 'electron';
import { Scheduler } from '../engine/scheduler.js';

interface SchedulerIpcDeps {
  scheduler: Scheduler;
}

export function setupSchedulerIpc(deps: SchedulerIpcDeps): void {
  const { scheduler } = deps;

  ipcMain.handle('scheduler:start', (_, intervalMs?: number) => {
    scheduler.start(intervalMs);
    return { success: true };
  });

  ipcMain.handle('scheduler:stop', () => {
    scheduler.stop();
    return { success: true };
  });

  ipcMain.handle('scheduler:status', () => {
    return scheduler.getStatus();
  });

  ipcMain.handle('scheduler:setInterval', (_, intervalMs: number) => {
    scheduler.setIntervalMs(intervalMs);
    return { success: true };
  });
}