// Global type declarations for renderer process (merged from src/renderer/global.d.ts)

import type { QueueItem, HistoryItem, Settings, SchedulerStatus, JobProgress, DryRunResult, HistoryFilter } from '../main/engine/types.js';

interface ElectronAPI {
  queue: {
    getAll: () => Promise<QueueItem[]>;
    getById: (id: string) => Promise<QueueItem | undefined>;
    add: (params: any) => Promise<QueueItem>;
    update: (id: string, patch: any) => Promise<QueueItem | undefined>;
    delete: (id: string) => Promise<boolean>;
    runNow: (id: string) => Promise<{ success: boolean }>;
    testRun: (id: string) => Promise<DryRunResult>;
    pause: (id: string) => Promise<void>;
    resume: (id: string) => Promise<void>;
    reorder: (ids: string[]) => Promise<{ success: boolean }>;
    export: () => Promise<string>;
    import: (json: string, merge: boolean) => Promise<number>;
    copyImage: (sourcePath: string) => Promise<string>;
    recoverStuck: () => Promise<{ success: boolean }>;
    onChanged: (callback: (queue: QueueItem[]) => void) => () => void;
  };
  history: {
    getAll: (filter?: HistoryFilter) => Promise<HistoryItem[]>;
    getById: (id: string) => Promise<HistoryItem | undefined>;
    getByJobId: (jobId: string) => Promise<HistoryItem[]>;
    getLog: (jobId: string) => Promise<any>;
    getScreenshots: (jobId: string) => Promise<string[]>;
    clear: () => Promise<{ success: boolean }>;
    export: () => Promise<string>;
    onChanged: (callback: (history: HistoryItem[]) => void) => () => void;
  };
  settings: {
    get: () => Promise<Settings>;
    set: (patch: Partial<Settings>) => Promise<Settings>;
    reset: () => Promise<Settings>;
    updateChrome: (chrome: any) => Promise<Settings>;
    updateScheduler: (scheduler: any) => Promise<Settings>;
    updateEngine: (engine: any) => Promise<Settings>;
    updateApp: (app: any) => Promise<Settings>;
    export: () => Promise<string>;
    import: (json: string) => Promise<Settings>;
  };
  scheduler: {
    start: (intervalMs?: number) => Promise<{ success: boolean }>;
    stop: () => Promise<{ success: boolean }>;
    status: () => Promise<SchedulerStatus>;
    setInterval: (intervalMs: number) => Promise<{ success: boolean }>;
    onTick: (callback: (status: SchedulerStatus) => void) => () => void;
  };
  engine: {
    checkChrome: () => Promise<{ success: boolean; healthy: boolean; port?: number; pid?: number; error?: string }>;
    restartChrome: () => Promise<{ success: boolean; port?: number; pid?: number; error?: string }>;
    disconnectChrome: () => Promise<{ success: boolean }>;
    getCurrentJob: () => Promise<any>;
    isRunning: () => Promise<boolean>;
    onProgress: (callback: (progress: JobProgress) => void) => () => void;
  };
  app: {
    getVersion: () => Promise<string>;
    showWindow: () => Promise<void>;
    hideWindow: () => Promise<void>;
    quit: () => Promise<void>;
  };
  dialog: {
    openFile: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
    saveFile: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
    messageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
    readImagePreview: (filePath: string) => Promise<string>;
  };
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};