export type AuctionDuration = '24h' | '3d' | '7d';

export const AUCTION_DURATION_OPTIONS: ReadonlyArray<{ value: AuctionDuration; label: string }> = [
  { value: '24h', label: '24 Hours (Free)' },
  { value: '3d', label: '3 Days (Free)' },
  { value: '7d', label: '7 Days (Free)' }
];

export const AUCTION_DURATION_MS: Record<AuctionDuration, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

export interface AuctionParams {
  imagePath: string;
  category: string;
  subtitle: string;
  title: string;
  description: string;
  rating: '0' | '1' | '2' | '3';
  nsfw: boolean;
  preventSniping: boolean;
  promoted: boolean;
  duration: AuctionDuration;
  startingBid: string;
  minIncrease: string;
  autobuyEnabled: boolean;
  autobuy: string;
}

export interface RecurrenceSettings {
  enabled: boolean;
  gapDays: number;
}

export interface QueueItem {
  id: string;
  idempotencyKey: string;
  params: AuctionParams;
  scheduledAt: string; // ISO 8601
  status: JobStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  recurrence?: RecurrenceSettings;
  lastError?: string;
  lastRunAt?: string;
}

export type JobStatus = 
  | 'waiting'      // в очереди, ждёт scheduledAt
  | 'running'      // выполняется прямо сейчас
  | 'completed'    // успешно (для Dry Run — дошёл до Page 3)
  | 'failed'       // ошибка, ретраи исчерпаны
  | 'paused'       // пользователь поставил на паузу
  | 'retrying';    // ошибка, будет повтор через backoff

export interface HistoryItem {
  id: string;
  queueItemId: string;
  idempotencyKey: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  sourceParams?: AuctionParams;
  sourceScheduledAt?: string;
  sourceRecurrence?: RecurrenceSettings;
  error?: string;
  auctionUrl?: string;
  stages: StageLog[];
  isDryRun: boolean;
}

export interface StageLog {
  stage: string;
  ok: boolean;
  timestamp: string;
  durationMs: number;
  details?: Record<string, unknown>;
}

export interface DryRunResult {
  success: boolean;
  auctionUrl?: string;
  error?: string;
  stages: StageLog[];
  publishAttempted?: boolean;
}

export interface PublishResult {
  success: boolean;
  auctionUrl?: string;
  error?: string;
}

export interface RunResult {
  success: boolean;
  auctionUrl?: string;
  error?: string;
  stages: StageLog[];
  isDryRun: boolean;
  publishAttempted?: boolean;
}

export interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  lastTickAt?: string;
  nextTickAt?: string;
  jobsProcessed: number;
  jobsSucceeded: number;
  jobsFailed: number;
  isProcessing: boolean;
}

export interface JobProgress {
  jobId: string;
  stage: string;
  progress: number; // 0-100
  message: string;
  timestamp: string;
}

export interface Settings {
  chrome: {
    executablePath: string;
    profilePath: string;
    debugPort: number;
  };
  scheduler: {
    intervalMs: number;
    cooldownMs: number;
    maxRetries: number;
    autoStart: boolean;
  };
  engine: {
    testMode: boolean;
    imagesDir: string;
  };
  app: {
    autoLaunch: boolean;
    minimizeToTray: boolean;
    notifications: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  chrome: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    profilePath: 'C:\\commishes-bot\\chrome-profile',
    debugPort: 9223
  },
  scheduler: {
    intervalMs: 5000,
    cooldownMs: 60000,
    maxRetries: 2,
    autoStart: false
  },
  engine: {
    testMode: false,
    imagesDir: 'C:\\commishes-bot\\images'
  },
  app: {
    autoLaunch: false,
    minimizeToTray: true,
    notifications: true
  }
};

export interface HistoryFilter {
  dateFrom?: string;
  dateTo?: string;
  status?: 'success' | 'failed';
  search?: string;
  limit?: number;
  offset?: number;
}

// Migration exports
export const SCHEMA_VERSION = 4;

export interface Migration<T> {
  version: number;
  up: (data: T) => T;
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
      // logger.info would cause circular dependency, so we skip logging here
      result = migration.up(result);
    }
  }
  return result;
}