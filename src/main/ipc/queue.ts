import { ipcMain } from 'electron';
import { QueueManager } from '../data/queue-manager.js';
import { Runner } from '../engine/runner.js';
import { ChromeManager } from '../engine/chrome-manager.js';
import { AuctionParams, QueueItem, logger } from '../engine/index.js';

interface QueueIpcDeps {
  queueManager: QueueManager;
  runner: Runner;
  chromeManager: ChromeManager;
}

export function setupQueueIpc(deps: QueueIpcDeps): void {
  const { queueManager, runner, chromeManager } = deps;

  ipcMain.handle('queue:getAll', () => {
    return queueManager.getAll();
  });

  ipcMain.handle('queue:getById', (_, id: string) => {
    return queueManager.getById(id);
  });

  ipcMain.handle('queue:add', (_, params: Omit<QueueItem, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'retryCount' | 'maxRetries' | 'idempotencyKey'>) => {
    logger.info('queue:add received', { hasParams: !!params?.params, hasScheduledAt: !!params?.scheduledAt, keys: Object.keys(params || {}) });
    try {
      const result = queueManager.add(params);
      logger.info('queue:add success', { id: result.id, hasParams: !!result.params });
      return result;
    } catch (error) {
      logger.error('queue:add failed', error);
      throw error;
    }
  });

  ipcMain.handle('queue:update', (_, id: string, patch: Partial<QueueItem>) => {
    return queueManager.update(id, patch);
  });

  ipcMain.handle('queue:delete', (_, id: string) => {
    return queueManager.delete(id);
  });

  ipcMain.handle('queue:runNow', async (_, id: string) => {
    const job = queueManager.getById(id);
    if (!job) throw new Error('Job not found');
    
    logger.info('queue:runNow', { jobId: id, hasParams: !!job.params, paramsKeys: job.params ? Object.keys(job.params) : 'none' });
    
    // Run in background
    runner.runManual(job, true).catch(err => {
      logger.error('Manual run failed:', err);
    });
    
    return { success: true };
  });

  ipcMain.handle('queue:testRun', async (_, id: string) => {
    const job = queueManager.getById(id);
    if (!job) throw new Error('Job not found');
    
    logger.info('queue:testRun', { jobId: id, hasParams: !!job.params, paramsKeys: job.params ? Object.keys(job.params) : 'none' });
    
    const result = await runner.runManual(job, true);
    return result;
  });

  ipcMain.handle('queue:pause', (_, id: string) => {
    return queueManager.markPaused(id);
  });

  ipcMain.handle('queue:resume', (_, id: string) => {
    return queueManager.markWaiting(id);
  });

  ipcMain.handle('queue:reorder', (_, ids: string[]) => {
    queueManager.reorder(ids);
    return { success: true };
  });

  ipcMain.handle('queue:export', () => {
    return queueManager.exportQueue();
  });

  ipcMain.handle('queue:import', (_, json: string, merge: boolean) => {
    return queueManager.importQueue(json, merge);
  });

  ipcMain.handle('queue:copyImage', async (_, sourcePath: string) => {
    return queueManager.copyImage(sourcePath);
  });

  ipcMain.handle('queue:recoverStuck', () => {
    queueManager.recoverStuckJobs();
    return { success: true };
  });
}