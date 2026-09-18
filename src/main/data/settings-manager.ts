import { EventEmitter } from 'events';
import { createStorage } from './storage.js';
import { runMigrations, settingsMigrations, SETTINGS_SCHEMA_VERSION } from './migrations.js';
import { Settings, DEFAULT_SETTINGS } from '../engine/types.js';
import { logger } from '../shared/logger.js';

const settingsStorage = createStorage<Settings>('settings.json', DEFAULT_SETTINGS);
const settingsSchemaStorage = createStorage<{ version: number }>('settings-schema-version.json', { version: 0 });

export class SettingsManager extends EventEmitter {
  private settings!: Settings;

  constructor() {
    super();
    this.load();
  }

  private load(): void {
    // Settings need their own schema version because QueueManager updates the shared schema first.
    const settingsSchema = settingsSchemaStorage.load();
    this.settings = settingsStorage.load();
    this.settings = runMigrations(this.settings, settingsMigrations, settingsSchema.version);
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...this.settings,
      chrome: { ...DEFAULT_SETTINGS.chrome, ...this.settings.chrome },
      scheduler: { ...DEFAULT_SETTINGS.scheduler, ...this.settings.scheduler },
      engine: { ...DEFAULT_SETTINGS.engine, ...this.settings.engine },
      app: { ...DEFAULT_SETTINGS.app, ...this.settings.app }
    };
    this.persist();
    settingsSchemaStorage.save({ version: SETTINGS_SCHEMA_VERSION });
    this.emit('changed');
  }

  private persist(): void {
    settingsStorage.save(this.settings);
    // Emit the current settings so listeners such as auto-launch handling
    // never receive an undefined payload after a settings update.
    this.emit('changed', this.get());
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
