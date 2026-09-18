import { AuctionDuration, AuctionParams, QueueItem, Settings, DEFAULT_SETTINGS } from '../engine/types.js';
import { logger } from '../shared/logger.js';

export const SCHEMA_VERSION = 3;

export interface Migration<T> {
  version: number;
  up: (data: T) => T;
}

const LEGACY_QUEUE_PARAM_KEYS: Array<keyof AuctionParams> = [
  'imagePath',
  'category',
  'subtitle',
  'title',
  'description',
  'rating',
  'nsfw',
  'preventSniping',
  'duration',
  'promoted',
  'startingBid',
  'minIncrease',
  'autobuyEnabled',
  'autobuy'
];

function normalizeDuration(raw: unknown): AuctionDuration {
  switch (String(raw ?? '')) {
    case '24h':
    case '24':
      return '24h';
    case '3d':
    case '72':
      return '3d';
    case '7d':
    case '168':
      return '7d';
    default:
      // Older builds offered unsupported durations (1/3/6/12/48 hours).
      // Fall back to the one duration verified by the reference workflow.
      return '24h';
  }
}

function normalizeAuctionParams(raw: Partial<AuctionParams> | undefined): AuctionParams {
  return {
    imagePath: raw?.imagePath ?? '',
    category: raw?.category ?? '',
    subtitle: raw?.subtitle ?? '',
    title: raw?.title ?? '',
    description: raw?.description ?? '',
    rating: raw?.rating === '1' || raw?.rating === '2' || raw?.rating === '3' ? raw.rating : '0',
    nsfw: raw?.nsfw ?? false,
    preventSniping: false,
    promoted: raw?.promoted ?? false,
    duration: normalizeDuration(raw?.duration),
    startingBid: raw?.startingBid ?? '',
    minIncrease: raw?.minIncrease ?? '',
    autobuyEnabled: raw?.autobuyEnabled ?? false,
    autobuy: raw?.autobuy ?? ''
  };
}

/**
 * Converts legacy queue items that stored auction fields at the QueueItem root
 * into the current { params: AuctionParams, scheduledAt, ... } shape.
 *
 * This intentionally runs on every queue load instead of relying only on the
 * schema version because older versions of the app used the same shared
 * schema-version file as settings.
 */
export function normalizeQueueItem(item: QueueItem | Record<string, any>): QueueItem {
  if (!item || typeof item !== 'object') {
    throw new Error('Invalid queue item: expected an object');
  }

  const raw = item as Record<string, any>;
  const rawParams = raw.params && typeof raw.params === 'object' ? raw.params : raw;

  const normalized: QueueItem = {
    ...raw,
    params: normalizeAuctionParams(rawParams),
    recurrence: {
      enabled: raw.recurrence?.enabled === true,
      gapDays: Number.isFinite(Number(raw.recurrence?.gapDays))
        ? Math.max(0, Number(raw.recurrence.gapDays))
        : 1
    }
  } as QueueItem;

  // Remove legacy top-level auction fields once params has been created.
  for (const key of LEGACY_QUEUE_PARAM_KEYS) {
    delete (normalized as any)[key];
  }

  return normalized;
}

export function normalizeQueueItems(queue: QueueItem[]): QueueItem[] {
  return queue.map(item => normalizeQueueItem(item));
}

export const queueMigrations: Migration<QueueItem[]>[] = [
  {
    version: 1,
    up: (queue) => queue.map(item => ({
      ...item,
      retryCount: item.retryCount ?? 0,
      maxRetries: item.maxRetries ?? 2,
      idempotencyKey: item.idempotencyKey ?? item.id
    }))
  },
  {
    version: 2,
    up: (queue) => queue.map(item => ({
      ...item,
      lastRunAt: item.lastRunAt ?? undefined
    }))
  }
];

export const settingsMigrations: Migration<Settings>[] = [
  {
    version: 1,
    up: (settings) => ({
      ...DEFAULT_SETTINGS,
      ...settings,
      scheduler: {
        ...DEFAULT_SETTINGS.scheduler,
        ...settings.scheduler,
        intervalMs: settings.scheduler?.intervalMs ?? DEFAULT_SETTINGS.scheduler.intervalMs,
        cooldownMs: settings.scheduler?.cooldownMs ?? DEFAULT_SETTINGS.scheduler.cooldownMs,
        maxRetries: settings.scheduler?.maxRetries ?? DEFAULT_SETTINGS.scheduler.maxRetries,
        autoStart: settings.scheduler?.autoStart ?? DEFAULT_SETTINGS.scheduler.autoStart
      },
      engine: {
        ...DEFAULT_SETTINGS.engine,
        ...settings.engine,
        testMode: settings.engine?.testMode ?? DEFAULT_SETTINGS.engine.testMode,
        imagesDir: settings.engine?.imagesDir ?? DEFAULT_SETTINGS.engine.imagesDir
      },
      app: {
        ...DEFAULT_SETTINGS.app,
        ...settings.app,
        autoLaunch: settings.app?.autoLaunch ?? DEFAULT_SETTINGS.app.autoLaunch,
        minimizeToTray: settings.app?.minimizeToTray ?? DEFAULT_SETTINGS.app.minimizeToTray,
        notifications: settings.app?.notifications ?? DEFAULT_SETTINGS.app.notifications
      }
    })
  }
];

export function runMigrations<T>(data: T, migrations: Migration<T>[], currentVersion: number): T {
  let result = data;
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      logger.info(`Running migration v${migration.version}`);
      result = migration.up(result);
    }
  }
  return result;
}
