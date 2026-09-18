import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import { extname } from 'path';
import { setupQueueIpc } from './queue.js';
import { setupHistoryIpc } from './history.js';
import { setupSettingsIpc } from './settings.js';
import { setupSchedulerIpc } from './scheduler.js';
import { setupEngineIpc } from './engine.js';
import { QueueManager } from '../data/queue-manager.js';
import { HistoryManager } from '../data/history-manager.js';
import { SettingsManager } from '../data/settings-manager.js';
import { Scheduler } from '../engine/scheduler.js';
import { Runner } from '../engine/runner.js';
import { ChromeManager } from '../engine/chrome-manager.js';
import { logger } from '../engine/index.js';

export interface IpcDeps {
  queueManager: QueueManager;
  historyManager: HistoryManager;
  settingsManager: SettingsManager;
  scheduler: Scheduler;
  runner: Runner;
  chromeManager: ChromeManager;
  mainWindow: () => BrowserWindow | null;
}

export function setupIpcHandlers(deps: IpcDeps): void {
  const { mainWindow } = deps;

  // Setup all IPC handlers
  setupQueueIpc(deps);
  setupHistoryIpc(deps);
  setupSettingsIpc(deps);
  setupSchedulerIpc(deps);
  setupEngineIpc(deps);

  // App-level handlers
  ipcMain.handle('app:getVersion', () => {
    return process.env.npm_package_version || '1.0.0';
  });

  ipcMain.handle('app:showWindow', () => {
    const win = mainWindow();
    if (win) {
      win.show();
      win.focus();
    }
  });

  ipcMain.handle('app:hideWindow', () => {
    const win = mainWindow();
    if (win) {
      win.hide();
    }
  });

  ipcMain.handle('app:quit', () => {
    const win = mainWindow();
    if (win) {
      win.webContents.send('app:quitting');
    }
  });

  // Dialog helpers
  ipcMain.handle('dialog:openFile', async (_, options: Electron.OpenDialogOptions) => {
    const win = mainWindow();
    if (!win) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(win, options);
  });

  ipcMain.handle('dialog:saveFile', async (_, options: Electron.SaveDialogOptions) => {
    const win = mainWindow();
    if (!win) return { canceled: true };
    return dialog.showSaveDialog(win, options);
  });

  ipcMain.handle('dialog:messageBox', async (_, options: Electron.MessageBoxOptions) => {
    const win = mainWindow();
    if (!win) return { response: 0 };
    return dialog.showMessageBox(win, options);
  });

  ipcMain.handle('dialog:readImagePreview', async (_, filePath: string) => {
    if (!filePath) throw new Error('Image path is empty');

    const allowed = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
    const extension = extname(filePath).toLowerCase();
    if (!allowed.has(extension)) {
      throw new Error('Unsupported image format');
    }

    const data = fs.readFileSync(filePath);
    const mime = extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : extension === '.webp'
        ? 'image/webp'
        : extension === '.gif'
          ? 'image/gif'
          : 'image/png';

    return `data:${mime};base64,${data.toString('base64')}`;
  });

  logger.info('IPC handlers registered');
}