import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createStorage } from './storage.js';
import { HistoryItem, HistoryFilter } from '../engine/types.js';
import { logger, getJobLog, getErrorScreenshots } from '../shared/logger.js';

const historyStorage = createStorage<HistoryItem[]>('history.json', []);

export class HistoryManager extends EventEmitter {
  private history: HistoryItem[] = [];

  constructor() {
    super();
    this.load();
  }

  private load(): void {
    this.history = historyStorage.load();
    this.emit('changed');
  }

  private persist(): void {
    historyStorage.save(this.history);
    this.emit('changed');
  }

  append(record: Omit<HistoryItem, 'id'>): HistoryItem {
    const item: HistoryItem = {
      ...record,
      id: uuidv4()
    };
    this.history.unshift(item);
    this.persist();
    return item;
  }

  getAll(filter?: HistoryFilter): HistoryItem[] {
    let result = [...this.history];

    if (filter) {
      if (filter.dateFrom) {
        const from = new Date(filter.dateFrom).getTime();
        result = result.filter(h => new Date(h.startedAt).getTime() >= from);
      }
      if (filter.dateTo) {
        const to = new Date(filter.dateTo).getTime();
        result = result.filter(h => new Date(h.startedAt).getTime() <= to);
      }
      if (filter.status === 'success') {
        result = result.filter(h => h.success);
      } else if (filter.status === 'failed') {
        result = result.filter(h => !h.success);
      }
      if (filter.search) {
        const search = filter.search.toLowerCase();
        result = result.filter(h =>
          h.queueItemId.toLowerCase().includes(search) ||
          (h.error && h.error.toLowerCase().includes(search))
        );
      }
      if (filter.offset) {
        result = result.slice(filter.offset);
      }
      if (filter.limit) {
        result = result.slice(0, filter.limit);
      }
    }

    return result;
  }

  getByJobId(queueItemId: string): HistoryItem[] {
    return this.history.filter(h => h.queueItemId === queueItemId);
  }

  getById(id: string): HistoryItem | undefined {
    return this.history.find(h => h.id === id);
  }

  getLogPath(jobId: string): string {
    return '';
  }

  clear(): void {
    this.history = [];
    this.persist();
  }

  exportHistory(): string {
    return JSON.stringify(this.history, null, 2);
  }
}
