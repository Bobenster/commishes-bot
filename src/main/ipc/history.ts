import { ipcMain } from 'electron';
import { HistoryManager } from '../data/history-manager.js';
import { logger, getJobLog, getErrorScreenshots } from '../engine/index.js';
import { HistoryFilter } from '../engine/types.js';

interface HistoryIpcDeps {
  historyManager: HistoryManager;
}

export function setupHistoryIpc(deps: HistoryIpcDeps): void {
  const { historyManager } = deps;

  ipcMain.handle('history:getAll', (_, filter?: HistoryFilter) => {
    return historyManager.getAll(filter);
  });

  ipcMain.handle('history:getById', (_, id: string) => {
    return historyManager.getById(id);
  });

  ipcMain.handle('history:getByJobId', (_, jobId: string) => {
    return historyManager.getByJobId(jobId);
  });

  ipcMain.handle('history:getLog', (_, jobId: string) => {
    return getJobLog(jobId);
  });

  ipcMain.handle('history:getScreenshots', (_, jobId: string) => {
    return getErrorScreenshots(jobId);
  });

  ipcMain.handle('history:clear', () => {
    historyManager.clear();
    return { success: true };
  });

  ipcMain.handle('history:export', () => {
    return historyManager.exportHistory();
  });
}