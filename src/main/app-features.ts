/// <reference path="./electron-augmentation.d.ts" />

import { app, globalShortcut, Notification, BrowserWindow, dialog } from 'electron';
import { SettingsManager } from './data/settings-manager.js';
import { logger } from './engine/index.js';

export function setupAutoLaunch(settingsManager: SettingsManager): void {
  const handleAutoLaunchChange = (settings?: any) => {
    // Be defensive: older callers emitted "changed" without a payload.
    const currentSettings = settings ?? settingsManager.get();
    const autoLaunch = currentSettings.app?.autoLaunch;
    if (autoLaunch) {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: ['--hidden']
      });
    } else {
      app.setLoginItemSettings({ openAtLogin: false });
    }
  };

  const settings = settingsManager.get();
  handleAutoLaunchChange(settings);
  settingsManager.on('changed', handleAutoLaunchChange);
}

export function setupNotifications(
  settingsManager: SettingsManager,
  runner: any,
  mainWindow: () => BrowserWindow | null
): void {
  runner.on('progress', (progress: any) => {
    const settings = settingsManager.get();
    if (!settings.app?.notifications) return;

    if (progress.stage === 'completed' && progress.progress === 100) {
      const win = mainWindow();
      if (win && win.isVisible()) return;

      new Notification({
        title: 'Commishes Control Center',
        body: `Job completed: ${progress.message}`,
        silent: false
      }).show();
    } else if (progress.stage === 'failed') {
      const win = mainWindow();
      if (win && win.isVisible()) return;

      new Notification({
        title: 'Commishes Control Center - Error',
        body: `Job failed: ${progress.message}`,
        silent: false
      }).show();
    }
  });
}

export function setupGlobalShortcuts(mainWindow: () => BrowserWindow | null): void {
  const registerShortcuts = () => {
    globalShortcut.register('CommandOrControl+N', () => {
      const win = mainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        win.webContents.send('shortcut:newJob');
      }
    });

    globalShortcut.register('CommandOrControl+Shift+R', () => {
      const win = mainWindow();
      if (win) {
        win.webContents.send('shortcut:refresh');
      }
    });

    globalShortcut.register('CommandOrControl+Shift+S', () => {
      const win = mainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        win.webContents.send('shortcut:openSettings');
      }
    });
  };

  if (app.isReady()) {
    registerShortcuts();
  } else {
    app.on('ready', registerShortcuts);
  }

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

export function setupWindowEvents(mainWindow: BrowserWindow, _settingsManager: SettingsManager): void {
  // Normal Windows minimize now behaves normally. Hiding to the tray is
  // an explicit UI action via the "Hide to Tray" button.
  mainWindow.on('close', (e: Electron.Event) => {
    if ((app as any).isQuitting) return;

    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Cancel', 'Exit'],
      defaultId: 0,
      cancelId: 0,
      title: 'Quit Commishes Control Center?',
      message: 'Exit the application?',
      detail: 'The scheduler will stop and background automation will no longer run.'
    });

    if (response === 0) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    (app as any).isQuitting = true;
    app.quit();
  });
}