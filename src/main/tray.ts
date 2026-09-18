/// <reference path="./electron-augmentation.d.ts" />

import { Tray, Menu, nativeImage, app, BrowserWindow, NativeImage, dialog } from 'electron';
import { join } from 'path';
import { Scheduler } from './engine/scheduler.js';
import { SettingsManager } from './data/settings-manager.js';
import { logger } from './engine/index.js';

let tray: Tray | null = null;

export function createTray(
  mainWindow: BrowserWindow | null,
  scheduler: Scheduler,
  settingsManager: SettingsManager
): void {
  // Try to load icon from assets
  const iconPath = join(__dirname, '../renderer/assets/icon.ico');
  let icon: NativeImage;
  
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty();
    } else {
      icon = icon.resize({ width: 16, height: 16 });
    }
  } catch {
    icon = nativeImage.createEmpty();
  }
  
  tray = new Tray(icon);
  
  tray.setToolTip('Commishes Control Center');
  
  const updateMenu = () => {
    const settings = settingsManager.get();
    const schedulerStatus = scheduler.getStatus();
    
    const menu = Menu.buildFromTemplate([
      {
        label: 'Commishes Control Center',
        enabled: false
      },
      { type: 'separator' },
      {
        label: schedulerStatus.running ? 'Pause Scheduler' : 'Resume Scheduler',
        click: () => {
          if (schedulerStatus.running) {
            scheduler.stop();
          } else {
            scheduler.start(settings.scheduler.intervalMs);
          }
          updateMenu();
        }
      },
      {
        label: 'Show Window',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
          mainWindow?.webContents.send('navigate:settings');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          const win = mainWindow;
          if (win && !win.isDestroyed()) {
            const response = dialog.showMessageBoxSync(win, {
              type: 'question',
              buttons: ['Cancel', 'Exit'],
              defaultId: 0,
              cancelId: 0,
              title: 'Quit Commishes Control Center?',
              message: 'Exit the application?',
              detail: 'The scheduler will stop and background automation will no longer run.'
            });
            if (response === 0) return;
          }

          (app as any).isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    tray?.setContextMenu(menu);
  };
  
  updateMenu();
  
  // Double click to show
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  
  // Update menu when scheduler status changes
  scheduler.on('tick', updateMenu);
  scheduler.on('started', updateMenu);
  scheduler.on('stopped', updateMenu);
  
  logger.info('Tray created');
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}