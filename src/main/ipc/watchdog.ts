import { ipcMain } from 'electron';
import { WatchdogManager } from '../engine/watchdog.js';

interface WatchdogIpcDeps {
  watchdog: WatchdogManager;
}

export function setupWatchdogIpc(deps: WatchdogIpcDeps): void {
  const { watchdog } = deps;

  ipcMain.handle('watchdog:getStatus', () => {
    return watchdog.getStatus();
  });

  ipcMain.handle('watchdog:checkNow', async () => {
    return watchdog.checkNow();
  });

  ipcMain.handle('watchdog:restartService', async (_, id: string) => {
    await watchdog.restartService(id);
    return watchdog.getStatus();
  });
}
