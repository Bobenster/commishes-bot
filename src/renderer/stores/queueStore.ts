// Queue Store - Reactive state management for queue

import type { QueueItem } from '../../main/engine/types.js';

type Listener = (queue: QueueItem[]) => void;

class QueueStore {
  private queue: QueueItem[] = [];
  private listeners: Set<Listener> = new Set();
  private loading = false;

  get all(): QueueItem[] {
    return this.queue;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  init(): void {
    // Subscribe to IPC updates
    window.api.queue.onChanged((queue: QueueItem[]) => {
      this.queue = queue;
      this.notify();
    });
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.notify();
    try {
      this.queue = await window.api.queue.getAll();
    } catch (error) {
      console.error('Failed to load queue:', error);
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
      listener(this.queue);
    }
  }

  // The main process emits queue:changed as part of queue:add().
  // By the time invoke() resolves, the same item is often already present
  // in this store. Reconcile by id instead of blindly appending it.
  async add(params: any): Promise<QueueItem> {
    const item = await window.api.queue.add(params);
    const existingIndex = this.queue.findIndex(q => q.id === item.id);

    if (existingIndex === -1) {
      this.queue = [...this.queue, item].sort(this.sortFn);
    } else {
      const next = [...this.queue];
      next[existingIndex] = item;
      this.queue = next.sort(this.sortFn);
    }

    this.notify();
    return item;
  }

  async update(id: string, patch: any): Promise<QueueItem | undefined> {
    const item = await window.api.queue.update(id, patch);
    if (item) {
      this.queue = this.queue.map(q => q.id === id ? item : q).sort(this.sortFn);
      this.notify();
    }
    return item;
  }

  async delete(id: string): Promise<boolean> {
    const success = await window.api.queue.delete(id);
    if (success) {
      this.queue = this.queue.filter(q => q.id !== id);
      this.notify();
    }
    return success;
  }

  async runNow(id: string): Promise<void> {
    await window.api.queue.runNow(id);
  }

  async testRun(id: string): Promise<any> {
    return window.api.queue.testRun(id);
  }

  async pause(id: string): Promise<void> {
    await window.api.queue.pause(id);
    this.queue = this.queue.map(q => q.id === id ? { ...q, status: 'paused' } : q);
    this.notify();
  }

  async resume(id: string): Promise<void> {
    await window.api.queue.resume(id);
    this.queue = this.queue.map(q => q.id === id ? { ...q, status: 'waiting' } : q);
    this.notify();
  }

  async reorder(ids: string[]): Promise<void> {
    await window.api.queue.reorder(ids);
    // Reorder will trigger IPC update
  }

  async copyImage(sourcePath: string): Promise<string> {
    return window.api.queue.copyImage(sourcePath);
  }

  async recoverStuck(): Promise<void> {
    await window.api.queue.recoverStuck();
    this.refresh();
  }

  async exportQueue(): Promise<string> {
    return window.api.queue.export();
  }

  async importQueue(json: string, merge: boolean): Promise<number> {
    return window.api.queue.import(json, merge);
  }

  private sortFn(a: QueueItem, b: QueueItem): number {
    const statusOrder: Record<string, number> = {
      running: 0,
      retrying: 1,
      waiting: 2,
      paused: 3,
      completed: 4,
      failed: 5
    };
    const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
  }

  // Get filtered/sorted queue for display
  getFiltered(search: string, statusFilter: string): QueueItem[] {
    let result = this.queue;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(q => 
        q.params.title.toLowerCase().includes(s) ||
        q.params.subtitle.toLowerCase().includes(s) ||
        q.id.toLowerCase().includes(s)
      );
    }

    if (statusFilter) {
      result = result.filter(q => q.status === statusFilter);
    }

    return result;
  }
}

export const queueStore = new QueueStore();