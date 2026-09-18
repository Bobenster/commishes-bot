// History Store

import type { HistoryItem, HistoryFilter } from '../../main/engine/types.js';

type Listener = (history: HistoryItem[]) => void;

class HistoryStore {
  private history: HistoryItem[] = [];
  private listeners: Set<Listener> = new Set();
  private loading = false;

  get all(): HistoryItem[] {
    return this.history;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  init(): void {
    window.api.history.onChanged((history) => {
      this.history = history;
      this.notify();
    });
  }

  async refresh(filter?: HistoryFilter): Promise<void> {
    this.loading = true;
    this.notify();
    try {
      this.history = await window.api.history.getAll(filter);
    } catch (error) {
      console.error('Failed to load history:', error);
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
      listener(this.history);
    }
  }

  async getLog(jobId: string): Promise<any> {
    return window.api.history.getLog(jobId);
  }

  async getScreenshots(jobId: string): Promise<string[]> {
    return window.api.history.getScreenshots(jobId);
  }

  async clear(): Promise<void> {
    await window.api.history.clear();
    this.history = [];
    this.notify();
  }

  async exportHistory(): Promise<string> {
    return window.api.history.export();
  }

  getFiltered(filter: HistoryFilter): HistoryItem[] {
    // Filtering is done server-side via IPC
    return this.history;
  }
}

export const historyStore = new HistoryStore();