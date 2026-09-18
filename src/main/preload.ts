import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Types for the exposed API
interface QueueItem {
  id: string;
  idempotencyKey: string;
  params: any;
  scheduledAt: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  lastRunAt?: string;
}

interface HistoryItem {
  id: string;
  queueItemId: string;
  idempotencyKey: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  sourceParams?: any;
  sourceScheduledAt?: string;
  sourceRecurrence?: any;
  error?: string;
  auctionUrl?: string;
  stages: any[];
  isDryRun: boolean;
}

interface JobProgress {
  jobId: string;
  stage: string;
  progress: number;
  message: string;
  timestamp: string;
}

interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  lastTickAt?: string;
  nextTickAt?: string;
  jobsProcessed: number;
  jobsSucceeded: number;
  jobsFailed: number;
  isProcessing: boolean;
}

interface Settings {
  chrome: any;
  scheduler: any;
  engine: any;
  app: any;
}

interface DryRunResult {
  success: boolean;
  auctionUrl?: string;
  error?: string;
  stages: any[];
}

// Expose the API to renderer
contextBridge.exposeInMainWorld('api', {
  // Queue
  queue: {
    getAll: () => ipcRenderer.invoke('queue:getAll'),
    getById: (id: string) => ipcRenderer.invoke('queue:getById', id),
    add: (params: any) => ipcRenderer.invoke('queue:add', params),
    update: (id: string, patch: any) => ipcRenderer.invoke('queue:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('queue:delete', id),
    runNow: (id: string) => ipcRenderer.invoke('queue:runNow', id),
    testRun: (id: string) => ipcRenderer.invoke('queue:testRun', id),
    pause: (id: string) => ipcRenderer.invoke('queue:pause', id),
    resume: (id: string) => ipcRenderer.invoke('queue:resume', id),
    reorder: (ids: string[]) => ipcRenderer.invoke('queue:reorder', ids),
    export: () => ipcRenderer.invoke('queue:export'),
    import: (json: string, merge: boolean) => ipcRenderer.invoke('queue:import', json, merge),
    copyImage: (sourcePath: string) => ipcRenderer.invoke('queue:copyImage', sourcePath),
    recoverStuck: () => ipcRenderer.invoke('queue:recoverStuck'),
    onChanged: (callback: (queue: QueueItem[]) => void) => {
      const handler = (_event: IpcRendererEvent, queue: QueueItem[]) => callback(queue);
      ipcRenderer.on('queue:changed', handler);
      return () => ipcRenderer.off('queue:changed', handler);
    }
  },

  // History
  history: {
    getAll: (filter?: any) => ipcRenderer.invoke('history:getAll', filter),
    getById: (id: string) => ipcRenderer.invoke('history:getById', id),
    getByJobId: (jobId: string) => ipcRenderer.invoke('history:getByJobId', jobId),
    getLog: (jobId: string) => ipcRenderer.invoke('history:getLog', jobId),
    getScreenshots: (jobId: string) => ipcRenderer.invoke('history:getScreenshots', jobId),
    clear: () => ipcRenderer.invoke('history:clear'),
    export: () => ipcRenderer.invoke('history:export'),
    onChanged: (callback: (history: HistoryItem[]) => void) => {
      const handler = (_event: IpcRendererEvent, history: HistoryItem[]) => callback(history);
      ipcRenderer.on('history:changed', handler);
      return () => ipcRenderer.off('history:changed', handler);
    }
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:set', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
    updateChrome: (chrome: any) => ipcRenderer.invoke('settings:updateChrome', chrome),
    updateScheduler: (scheduler: any) => ipcRenderer.invoke('settings:updateScheduler', scheduler),
    updateEngine: (engine: any) => ipcRenderer.invoke('settings:updateEngine', engine),
    updateApp: (app: any) => ipcRenderer.invoke('settings:updateApp', app),
    export: () => ipcRenderer.invoke('settings:export'),
    import: (json: string) => ipcRenderer.invoke('settings:import', json)
  },

  // Scheduler
  scheduler: {
    start: (intervalMs?: number) => ipcRenderer.invoke('scheduler:start', intervalMs),
    stop: () => ipcRenderer.invoke('scheduler:stop'),
    status: () => ipcRenderer.invoke('scheduler:status'),
    setInterval: (intervalMs: number) => ipcRenderer.invoke('scheduler:setInterval', intervalMs),
    onTick: (callback: (status: SchedulerStatus) => void) => {
      const handler = (_event: IpcRendererEvent, status: SchedulerStatus) => callback(status);
      ipcRenderer.on('scheduler:tick', handler);
      return () => ipcRenderer.off('scheduler:tick', handler);
    }
  },

  // Engine
  engine: {
    checkChrome: () => ipcRenderer.invoke('engine:checkChrome'),
    restartChrome: () => ipcRenderer.invoke('engine:restartChrome'),
    disconnectChrome: () => ipcRenderer.invoke('engine:disconnectChrome'),
    getCurrentJob: () => ipcRenderer.invoke('engine:getCurrentJob'),
    isRunning: () => ipcRenderer.invoke('engine:isRunning'),
    onProgress: (callback: (progress: JobProgress) => void) => {
      const handler = (_event: IpcRendererEvent, progress: JobProgress) => callback(progress);
      ipcRenderer.on('job:progress', handler);
      return () => ipcRenderer.off('job:progress', handler);
    }
  },

  // Watchdog
  watchdog: {
    getStatus: () => ipcRenderer.invoke('watchdog:getStatus'),
    checkNow: () => ipcRenderer.invoke('watchdog:checkNow'),
    restartService: (id: string) => ipcRenderer.invoke('watchdog:restartService', id),
    reportRendererError: (message: string) => ipcRenderer.invoke('watchdog:rendererError', message)
  },

  // App
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    showWindow: () => ipcRenderer.invoke('app:showWindow'),
    hideWindow: () => ipcRenderer.invoke('app:hideWindow'),
    quit: () => ipcRenderer.invoke('app:quit')
  },

  // Dialog
  dialog: {
    openFile: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('dialog:saveFile', options),
    messageBox: (options: Electron.MessageBoxOptions) => ipcRenderer.invoke('dialog:messageBox', options),
    readImagePreview: (filePath: string) => ipcRenderer.invoke('dialog:readImagePreview', filePath)
  }
});