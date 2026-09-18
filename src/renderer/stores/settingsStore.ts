// Settings Store

import type { Settings } from '../../main/engine/types.js';

type Listener = (settings: Settings) => void;

class SettingsStore {
  private settings: Settings | null = null;
  private listeners: Set<Listener> = new Set();
  private loading = false;

  get current(): Settings | null {
    return this.settings;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  init(): void {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.notify();
    try {
      this.settings = await window.api.settings.get();
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.settings!);
    }
  }

  async set(patch: Partial<Settings>): Promise<Settings> {
    this.settings = await window.api.settings.set(patch);
    this.notify();
    return this.settings!;
  }

  async reset(): Promise<Settings> {
    this.settings = await window.api.settings.reset();
    this.notify();
    return this.settings!;
  }

  async updateChrome(chrome: Partial<Settings['chrome']>): Promise<Settings> {
    return this.set({ chrome: { ...this.settings!.chrome, ...chrome } });
  }

  async updateScheduler(scheduler: Partial<Settings['scheduler']>): Promise<Settings> {
    return this.set({ scheduler: { ...this.settings!.scheduler, ...scheduler } });
  }

  async updateEngine(engine: Partial<Settings['engine']>): Promise<Settings> {
    return this.set({ engine: { ...this.settings!.engine, ...engine } });
  }

  async updateApp(app: Partial<Settings['app']>): Promise<Settings> {
    return this.set({ app: { ...this.settings!.app, ...app } });
  }

  async exportSettings(): Promise<string> {
    return window.api.settings.export();
  }

  async importSettings(json: string): Promise<Settings> {
    this.settings = await window.api.settings.import(json);
    this.notify();
    return this.settings!;
  }

  onChange(listener: Listener): () => void {
    return this.subscribe(listener);
  }
}

export const settingsStore = new SettingsStore();