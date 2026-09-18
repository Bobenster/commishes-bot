/// <reference path="./electron-augmentation.d.ts" />

import { app, BrowserWindow, ipcMain, dialog, nativeTheme, Notification } from 'electron';
import { join } from 'path';
import { isDev } from './shared/utils.js';
import { setupIpcHandlers } from './ipc/index.js';
import { createTray } from './tray.js';
import { Scheduler } from './engine/scheduler.js';
import { QueueManager } from './data/queue-manager.js';
import { HistoryManager } from './data/history-manager.js';
import { SettingsManager } from './data/settings-manager.js';
import { ChromeManager } from './engine/chrome-manager.js';
import { Runner } from './engine/runner.js';
import { WatchdogManager } from './engine/watchdog.js';
import { logger } from './shared/logger.js';
import {
  appendCrashEvent,
  setRuntimeProgress,
  startCrashDiagnostics,
  stopCrashDiagnostics
} from './shared/crash-journal.js';
import { setupAutoLaunch, setupNotifications, setupGlobalShortcuts, setupWindowEvents } from './app-features.js';
import {
  armProcessGuardian,
  markCleanShutdown,
  startProcessGuardianMonitor,
  stopProcessGuardianMonitor
} from './process-guardian.js';

let mainWindow: BrowserWindow | null = null;
let scheduler: Scheduler;
let queueManager: QueueManager;
let historyManager: HistoryManager;
let settingsManager: SettingsManager;
let chromeManager: ChromeManager;
let runner: Runner;
let watchdog: WatchdogManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Commishes Control Center',
    icon: join(__dirname, '../renderer/assets/icon.ico'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process gone:', details);
    appendCrashEvent('renderer-process-gone', { details });
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
      } else {
        mainWindow.webContents.reload();
      }
    }, 100);
  });

  mainWindow.webContents.on('unresponsive', () => {
    logger.warn('Renderer became unresponsive; watchdog will recover it.');
    appendCrashEvent('renderer-unresponsive');
  });

  mainWindow.webContents.on('responsive', () => {
    appendCrashEvent('renderer-responsive');
  });

  mainWindow.webContents.on('child-process-gone', (_event, details) => {
    logger.error('Electron child process gone:', details);
    appendCrashEvent('electron-child-process-gone', { details });
  });

  mainWindow.on('closed', () => {
    appendCrashEvent('main-window-closed', {
      appQuitting: Boolean((app as any).isQuitting)
    });
    mainWindow = null;
  });

  // Setup window events (minimize to tray, etc.)
  setupWindowEvents(mainWindow, settingsManager);
}

function startRendererWatchdogHooks(): void {
  watchdog.setRendererHooks(
    async () => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return false;
      }

      return Promise.race([
        mainWindow.webContents.executeJavaScript('1 + 1').then(result => result === 2),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2500))
      ]);
    },
    async () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
      }

      if (!mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.reload();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  );
}

function initializeManagers() {
  queueManager = new QueueManager();
  historyManager = new HistoryManager();
  settingsManager = new SettingsManager();
  chromeManager = new ChromeManager(settingsManager);
  runner = new Runner(queueManager, historyManager, settingsManager, chromeManager);
  scheduler = new Scheduler(queueManager, runner, settingsManager);
  watchdog = new WatchdogManager(queueManager, historyManager, settingsManager, scheduler, runner, chromeManager);

  // Wire up events for IPC push
  queueManager.on('changed', () => {
    mainWindow?.webContents.send('queue:changed', queueManager.getAll());
  });

  historyManager.on('changed', () => {
    mainWindow?.webContents.send('history:changed', historyManager.getAll());
  });

  scheduler.on('tick', (status) => {
    mainWindow?.webContents.send('scheduler:tick', status);
  });

  runner.on('progress', (progress) => {
    setRuntimeProgress(progress);
    mainWindow?.webContents.send('job:progress', progress);
  });

  // Recover stuck jobs on startup
  queueManager.recoverStuckJobs();
}

async function initializeApp() {
  logger.info('Initializing Commishes Control Center...');
  
  initializeManagers();
  setupIpcHandlers({
    queueManager,
    historyManager,
    settingsManager,
    scheduler,
    runner,
    chromeManager,
    watchdog,
    mainWindow: () => mainWindow
  });

  // Setup app features
  setupAutoLaunch(settingsManager);
  setupNotifications(settingsManager, runner, () => mainWindow);
  setupGlobalShortcuts(() => mainWindow);

  // Start scheduler if enabled in settings
  const settings = settingsManager.get();
  if (settings.scheduler?.autoStart) {
    scheduler.start(settings.scheduler.intervalMs || 5000);
    logger.info('Scheduler auto-started');
  }

  // Create tray
  createTray(mainWindow, scheduler, settingsManager);

  logger.info('Initialization complete');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    startCrashDiagnostics();
    armProcessGuardian();
    startProcessGuardianMonitor();
    await initializeApp();
    createWindow();
    startRendererWatchdogHooks();
    watchdog.start(5000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // Keep the main process alive until the user explicitly confirms quit.
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  markCleanShutdown('app.before-quit');
  stopProcessGuardianMonitor();
  watchdog?.stop();
  scheduler.stop();
  void chromeManager.disconnect();
  appendCrashEvent('application-shutdown-begin');
  stopCrashDiagnostics();
  logger.info('Application shutting down');
});

// Main-process errors are captured and reported instead of silently disappearing.
process.on('uncaughtExceptionMonitor', (error) => {
  appendCrashEvent('uncaught-exception-monitor', {
    error: error instanceof Error ? error.stack || error.message : String(error)
  });
});

process.on('uncaughtException', (error) => {
  appendCrashEvent('uncaught-exception', {
    error: error instanceof Error ? error.stack || error.message : String(error)
  });
  logger.error('Uncaught exception:', error);
  try {
    new Notification({
      title: 'Commishes Watchdog',
      body: `Main process error captured: ${error instanceof Error ? error.message : String(error)}`,
      silent: false
    }).show();
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  appendCrashEvent('unhandled-rejection', {
    reason: reason instanceof Error ? reason.stack || reason.message : String(reason)
  });
  logger.error('Unhandled rejection:', reason);
  try {
    new Notification({
      title: 'Commishes Watchdog',
      body: `Unhandled operation error: ${reason instanceof Error ? reason.message : String(reason)}`,
      silent: false
    }).show();
  } catch {}
});

process.on('warning', (warning) => {
  appendCrashEvent('node-warning', {
    warning: warning instanceof Error ? warning.stack || warning.message : String(warning)
  });
});

process.on('exit', (code) => {
  appendCrashEvent('process-exit', { code });
});
