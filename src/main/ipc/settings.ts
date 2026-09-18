import { ipcMain } from 'electron';
import { SettingsManager } from '../data/settings-manager.js';
import { Settings } from '../engine/types.js';

interface SettingsIpcDeps {
  settingsManager: SettingsManager;
}

export function setupSettingsIpc(deps: SettingsIpcDeps): void {
  const { settingsManager } = deps;

  ipcMain.handle('settings:get', () => {
    return settingsManager.get();
  });

  ipcMain.handle('settings:set', (_, patch: Partial<Settings>) => {
    return settingsManager.set(patch);
  });

  ipcMain.handle('settings:reset', () => {
    return settingsManager.reset();
  });

  ipcMain.handle('settings:updateChrome', (_, chrome: Partial<Settings['chrome']>) => {
    return settingsManager.updateChromeSettings(chrome);
  });

  ipcMain.handle('settings:updateScheduler', (_, scheduler: Partial<Settings['scheduler']>) => {
    return settingsManager.updateSchedulerSettings(scheduler);
  });

  ipcMain.handle('settings:updateEngine', (_, engine: Partial<Settings['engine']>) => {
    return settingsManager.updateEngineSettings(engine);
  });

  ipcMain.handle('settings:updateApp', (_, app: Partial<Settings['app']>) => {
    return settingsManager.updateAppSettings(app);
  });

  ipcMain.handle('settings:export', () => {
    return settingsManager.exportSettings();
  });

  ipcMain.handle('settings:import', (_, json: string) => {
    return settingsManager.importSettings(json);
  });
}