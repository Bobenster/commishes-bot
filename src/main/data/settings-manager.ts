import { EventEmitter } from 'events';
import { createStorage, schemaStorage } from './storage.js';
import { runMigrations, settingsMigrations } from './migrations.js';
import { Settings, DEFAULT_SETTINGS } from '../engine/types.js';
import { logger } from '../shared/logger.js';

const settingsStorage = createStorage<Settings>('settings.json', DEFAULT_SETTINGS);

export class SettingsManager extends EventEmitter {
  private settings!: Settings;

  constructor() {
    super();
    this.load();
  }

  private load(): void {
    const schema = schemaStorage.load();
    this.settings = settingsStorage.load();
    this.settings = runMigrations(this.settings, settingsMigrations, schema.version);
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...this.settings,
      chrome: { ...DEFAULT_SETTINGS.chrome, ...this.settings.chrome },
      scheduler: { ...DEFAULT_SETTINGS.scheduler, ...this.settings.scheduler },
      engine: { ...DEFAULT_SETTINGS.engine, ...this.settings.engine },
      app: { ...DEFAULT_SETTINGS.app, ...this.settings.app }
    };
    this.persist();
    this.emit('changed');
  }

  private persist(): void {
    settingsStorage.save(this.settings);
    this.emit('changed');
  }

  get(): Settings {
    return {
      ...this.settings,
      chrome: { ...this.settings.chrome },
      scheduler: { ...this.settings.scheduler },
      engine: { ...this.settings.engine },
      app: { ...this.settings.app }
    };
  }

  set(patch: Partial<Settings>): Settings {
    this.settings = this.deepMerge(this.settings, patch);
    this.persist();
    return this.get();
  }

  reset(): Settings {
    this.settings = { ...DEFAULT_SETTINGS };
    this.persist();
    return this.get();
  }

  updateChromeSettings(chrome: Partial<Settings['chrome']>): Settings {
    return this.set({ chrome: { ...this.settings.chrome, ...chrome } });
  }

  updateSchedulerSettings(scheduler: Partial<Settings['scheduler']>): Settings {
    return this.set({ scheduler: { ...this.settings.scheduler, ...scheduler } });
  }

  updateEngineSettings(engine: Partial<Settings['engine']>): Settings {
    return this.set({ engine: { ...this.settings.engine, ...engine } });
  }

  updateAppSettings(app: Partial<Settings['app']>): Settings {
    return this.set({ app: { ...this.settings.app, ...app } });
  }

  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  importSettings(json: string): Settings {
    try {
      const imported = JSON.parse(json) as Partial<Settings>;
      return this.set(imported);
    } catch (error) {
      logger.error('Failed to import settings:', error);
      throw error;
    }
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}
