import { ipcMain } from 'electron';
import { ChromeManager } from '../engine/chrome-manager.js';
import { Runner } from '../engine/runner.js';

interface EngineIpcDeps {
  chromeManager: ChromeManager;
  runner: Runner;
}

export function setupEngineIpc(deps: EngineIpcDeps): void {
  const { chromeManager, runner } = deps;

  ipcMain.handle('engine:checkChrome', async () => {
    try {
      const session = await chromeManager.ensureBotChrome();
      const healthy = await chromeManager.healthCheck(session);
      return { success: true, healthy, port: session.port, pid: session.pid };
    } catch (error) {
      return { 
        success: false, 
        healthy: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  ipcMain.handle('engine:restartChrome', async () => {
    if (runner.isRunning()) {
      return {
        success: false,
        error: 'Chrome cannot be restarted while a job is running.'
      };
    }

    try {
      const session = await chromeManager.restart();
      return { success: true, port: session.port, pid: session.pid };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  ipcMain.handle('engine:disconnectChrome', async () => {
    if (runner.isRunning()) {
      return {
        success: false,
        error: 'Chrome cannot be disconnected while a job is running.'
      };
    }

    await chromeManager.disconnect();
    return { success: true };
  });

  ipcMain.handle('engine:getCurrentJob', () => {
    return runner.getCurrentJob();
  });

  ipcMain.handle('engine:isRunning', () => {
    return runner.isRunning();
  });
}