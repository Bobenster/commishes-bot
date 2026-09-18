import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import * as fs from 'fs';
import { createStorage, ensureDataFiles } from './storage.js';
import { normalizeQueueItem, normalizeQueueItems, runMigrations, queueMigrations, SCHEMA_VERSION } from './migrations.js';
import { AUCTION_DURATION_MS, QueueItem, JobStatus, RecurrenceSettings, logger } from '../engine/index.js';
import { getAppDataPath } from '../shared/utils.js';

const IMAGES_DIR = join(getAppDataPath(), 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

const queueStorage = createStorage<QueueItem[]>('queue.json', []);
const schemaStorage = createStorage<{ version: number }>('schema-version.json', { version: 0 });

export class QueueManager extends EventEmitter {
  private queue: QueueItem[] = [];

  constructor() {
    super();
    ensureDataFiles();
    this.load();
  }

  private load(): void {
    const schema = schemaStorage.load();
    this.queue = queueStorage.load();
    this.queue = runMigrations(this.queue, queueMigrations, schema.version);

    // Older builds stored auction fields directly on QueueItem.
    // Normalize them before any consumer (UI, scheduler, runner) sees them.
    this.queue = normalizeQueueItems(this.queue);

    schemaStorage.save({ version: SCHEMA_VERSION });
    queueStorage.save(this.queue);
    this.emit('changed');
  }

  private persist(): void {
    queueStorage.save(this.queue);
    this.emit('changed');
  }

  getAll(): QueueItem[] {
    return [...this.queue].sort((a, b) => {
      const statusOrder: Record<JobStatus, number> = {
        running: 0,
        retrying: 1,
        waiting: 2,
        paused: 3,
        completed: 4,
        failed: 5
      };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    });
  }

  getById(id: string): QueueItem | undefined {
    return this.queue.find(item => item.id === id);
  }

  add(input: Pick<QueueItem, 'params' | 'scheduledAt'> & { recurrence?: RecurrenceSettings }): QueueItem {
    const now = new Date().toISOString();
    const id = uuidv4();

    // Keep the QueueItem contract exactly as { params, scheduledAt, ... }.
    // This also normalizes any missing optional form values before storage.
    const item = normalizeQueueItem({
      ...input,
      id,
      idempotencyKey: uuidv4(),
      status: 'waiting',
      retryCount: 0,
      maxRetries: 2,
      createdAt: now,
      updatedAt: now,
      recurrence: {
        enabled: input.recurrence?.enabled === true,
        gapDays: Math.max(0, Number(input.recurrence?.gapDays ?? 1) || 0)
      }
    } as QueueItem);

    this.queue.push(item);
    this.persist();
    return item;
  }

  update(id: string, patch: Partial<QueueItem>): QueueItem | undefined {
    const index = this.queue.findIndex(item => item.id === id);
    if (index === -1) return undefined;

    this.queue[index] = normalizeQueueItem({
      ...this.queue[index],
      ...patch,
      updatedAt: new Date().toISOString()
    });
    this.persist();
    return this.queue[index];
  }

  delete(id: string): boolean {
    const index = this.queue.findIndex(item => item.id === id);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    this.persist();
    return true;
  }

  getDue(now: Date = new Date()): QueueItem[] {
    return this.queue.filter(item =>
      item.status === 'waiting' &&
      new Date(item.scheduledAt) <= now
    );
  }

  reorder(ids: string[]): void {
    const idToIndex = new Map(this.queue.map((item, index) => [item.id, index]));
    const newQueue: QueueItem[] = [];

    for (const id of ids) {
      const index = idToIndex.get(id);
      if (index !== undefined) {
        newQueue.push(this.queue[index]);
      }
    }

    for (const item of this.queue) {
      if (!ids.includes(item.id)) {
        newQueue.push(item);
      }
    }

    this.queue = newQueue;
    this.persist();
  }

  markRunning(id: string): void {
    this.update(id, { status: 'running', lastRunAt: new Date().toISOString() });
  }

  markCompleted(id: string, result: { auctionUrl?: string; stages: any[] }): void {
    this.update(id, {
      status: 'completed',
      lastError: undefined,
      updatedAt: new Date().toISOString()
    });
  }

  markFailed(id: string, error: string): void {
    const item = this.getById(id);
    if (!item) return;

    const newRetryCount = item.retryCount + 1;
    const willRetry = newRetryCount <= item.maxRetries;

    this.update(id, {
      status: willRetry ? 'retrying' : 'failed',
      retryCount: newRetryCount,
      lastError: error,
      updatedAt: new Date().toISOString()
    });
  }

  createNextOccurrence(id: string, now: Date = new Date()): QueueItem | undefined {
    const current = this.getById(id);
    if (!current?.recurrence?.enabled) return undefined;

    const durationMs = AUCTION_DURATION_MS[current.params.duration];
    const gapMs = current.recurrence.gapDays * 24 * 60 * 60 * 1000;

    if (!durationMs || gapMs < 0) {
      logger.warn('Cannot create recurring occurrence: invalid recurrence settings', { jobId: id });
      return undefined;
    }

    let nextScheduledAtMs = now.getTime() + durationMs + gapMs;
    if (!Number.isFinite(nextScheduledAtMs)) return undefined;

    const next = this.add({
      params: { ...current.params },
      scheduledAt: new Date(nextScheduledAtMs).toISOString(),
      recurrence: { ...current.recurrence }
    });

    logger.info('Created next recurring occurrence', {
      sourceJobId: id,
      nextJobId: next.id,
      scheduledAt: next.scheduledAt,
      duration: current.params.duration,
      gapDays: current.recurrence.gapDays
    });

    return next;
  }

  markPaused(id: string): void {
    this.update(id, { status: 'paused' });
  }

  markWaiting(id: string): void {
    this.update(id, { status: 'waiting' });
  }

  recoverStuckJobs(): void {
    let recovered = 0;
    for (const item of this.queue) {
      if (item.status === 'running' || item.status === 'retrying') {
        this.update(item.id, {
          status: 'waiting',
          retryCount: item.retryCount + 1,
          lastError: 'Recovered after app restart'
        });
        recovered++;
      }
    }
    if (recovered > 0) {
      logger.info(`Recovered ${recovered} stuck jobs to waiting status`);
    }
  }

  exportQueue(): string {
    return JSON.stringify(this.queue, null, 2);
  }

  importQueue(json: string, merge: boolean = true): number {
    try {
      const importedRaw = JSON.parse(json) as unknown;
      if (!Array.isArray(importedRaw)) {
        throw new Error('Queue import must be a JSON array');
      }

      const imported = importedRaw.map(item => normalizeQueueItem(item as any));
      let added = 0;

      for (const item of imported) {
        if (merge && this.queue.some(q => q.id === item.id)) {
          this.update(item.id, item);
        } else {
          this.add({
            params: item.params,
            scheduledAt: item.scheduledAt,
            recurrence: item.recurrence
          });
          added++;
        }
      }

      return added;
    } catch (error) {
      logger.error('Failed to import queue:', error);
      throw error;
    }
  }

  async copyImage(sourcePath: string): Promise<string> {
    const ext = join(sourcePath).split('.').pop() || 'png';
    const filename = `${uuidv4()}.${ext}`;
    const destPath = join(IMAGES_DIR, filename);

    fs.copyFileSync(sourcePath, destPath);
    return destPath;
  }
}
