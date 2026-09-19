import { EventEmitter } from 'events';
import { Notification } from 'electron';
import { QueueManager } from '../data/queue-manager.js';
import { HistoryManager } from '../data/history-manager.js';
import { SettingsManager } from '../data/settings-manager.js';
import { Scheduler } from './scheduler.js';
import { Runner } from './runner.js';
import { ChromeManager } from './chrome-manager.js';
import { logger } from '../shared/logger.js';

export type WatchdogState = 'healthy' | 'idle' | 'recovering' | 'warning' | 'failed';

export interface WatchdogServiceStatus {
  id: string;
  label: string;
  state: WatchdogState;
  message: string;
  lastCheckedAt: string;
  restartCount: number;
  lastError?: string;
}

export interface WatchdogStatus {
  enabled: boolean;
  startedAt?: string;
  lastCheckAt?: string;
  services: WatchdogServiceStatus[];
}

type RendererProbe = () => Promise<boolean>;
type RendererRestart = () => Promise<void>;

export class WatchdogManager extends EventEmitter {
  private readonly services = new Map<string, WatchdogServiceStatus>();
  private interval: NodeJS.Timeout | null = null;
  private rendererProbe: RendererProbe | null = null;
  private rendererRestart: RendererRestart | null = null;
  private lastRunnerProgressAt = Date.now();
  private alertCooldown = new Map<string, number>();
  private startedAt?: string;
  private lastCheckAt?: string;

  constructor(
    private readonly queueManager: QueueManager,
    private readonly historyManager: HistoryManager,
    private readonly settingsManager: SettingsManager,
    private readonly scheduler: Scheduler,
    private readonly runner: Runner,
    private readonly chromeManager: ChromeManager
  ) {
    super();

    this.runner.on('progress', () => {
      this.lastRunnerProgressAt = Date.now();
    });

    this.ensureService('main', 'Main process');
    this.ensureService('renderer', 'Main window');
    this.ensureService('ipc', 'IPC bridge');
    this.ensureService('storage', 'Data storage');
    this.ensureService('scheduler', 'Scheduler');
    this.ensureService('runner', 'Runner');
    this.ensureService('chrome', 'Chrome / CDP');
    this.ensureService('commishes', 'Commishes session');
  }

  setRendererHooks(probe: RendererProbe, restart: RendererRestart): void {
    this.rendererProbe = probe;
    this.rendererRestart = restart;
  }

  start(intervalMs = 5000): void {
    if (this.interval) return;

    this.startedAt = new Date().toISOString();
    this.setHealthy('main', 'Watchdog loop is running');
    this.interval = setInterval(() => {
      void this.checkNow();
    }, intervalMs);

    void this.checkNow();
    logger.info('Watchdog started');
  }

  stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
    logger.info('Watchdog stopped');
  }

  async checkNow(): Promise<WatchdogStatus> {
    const checkedAt = new Date().toISOString();
    this.lastCheckAt = checkedAt;
    this.setHealthy('main', 'Main process is responsive', checkedAt);

    try {
      await this.checkRenderer(checkedAt);
      await this.checkIpc(checkedAt);
      await this.checkStorage(checkedAt);
      await this.checkScheduler(checkedAt);
      await this.checkRunner(checkedAt);
      await this.checkChrome(checkedAt);
      await this.checkCommishes(checkedAt);
    } catch (error) {
      const message = this.errorMessage(error);
      this.setStatus('main', 'warning', `Watchdog check error: ${message}`, checkedAt);
      this.notifyFailure('main', `Watchdog itself encountered an error: ${message}`);
      logger.error('Watchdog check failed:', error);
    }

    this.emit('changed', this.getStatus());
    return this.getStatus();
  }

  reportRendererError(message: string): void {
    this.setStatus('renderer', 'warning', `Renderer error captured: ${message}`);
    this.notifyFailure('renderer', `Renderer error captured: ${message}`);
    this.emit('changed', this.getStatus());
  }

  getStatus(): WatchdogStatus {
    return {
      enabled: this.interval !== null,
      startedAt: this.startedAt,
      lastCheckAt: this.lastCheckAt,
      services: Array.from(this.services.values()).map(service => ({ ...service }))
    };
  }

  async restartService(id: string): Promise<void> {
    switch (id) {
      case 'renderer':
        if (this.rendererRestart) {
          await this.rendererRestart();
          this.setRecovering('renderer', 'Main window renderer restarted');
        }
        break;
      case 'scheduler':
        this.scheduler.start(this.settingsManager.get().scheduler.intervalMs || 5000);
        this.setRecovering('scheduler', 'Scheduler restarted manually');
        break;
      case 'chrome':
        if (this.runner.isRunning()) {
          throw new Error('Chrome cannot be manually restarted while a job is running.');
        }
        await this.chromeManager.restart();
        this.setRecovering('chrome', 'BOT Chrome restarted manually');
        break;
      default:
        throw new Error(`Service "${id}" cannot be restarted independently.`);
    }

    this.emit('changed', this.getStatus());
  }

  private async checkRenderer(checkedAt: string): Promise<void> {
    if (!this.rendererProbe) {
      this.setStatus('renderer', 'idle', 'Renderer probe is not attached yet', checkedAt);
      return;
    }

    try {
      const responsive = await this.withTimeout(this.rendererProbe(), 2500, false);
      if (responsive) {
        this.setHealthy('renderer', 'Window renderer is responsive', checkedAt);
        return;
      }

      this.setRecovering('renderer', 'Renderer is unresponsive; reloading window', checkedAt);
      if (this.rendererRestart) {
        await this.rendererRestart();
        this.setHealthy('renderer', 'Renderer recovered after reload', checkedAt);
      } else {
        this.setFailed('renderer', 'Renderer is unresponsive and cannot be restarted', undefined, checkedAt);
        this.notifyFailure('renderer', 'Main window renderer is unresponsive and could not be restarted.');
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.setRecovering('renderer', `Renderer error; reloading window: ${message}`, checkedAt);
      try {
        await this.rendererRestart?.();
        this.setHealthy('renderer', 'Renderer recovered after reload', checkedAt);
      } catch (restartError) {
        const restartMessage = this.errorMessage(restartError);
        this.setFailed('renderer', 'Renderer restart failed', restartMessage, checkedAt);
        this.notifyFailure('renderer', `Main window restart failed: ${restartMessage}`);
      }
    }
  }

  private async checkIpc(checkedAt: string): Promise<void> {
    try {
      // Calling manager accessors through the main process verifies its IPC dependencies are alive.
      this.queueManager.getAll();
      this.historyManager.getAll();
      this.settingsManager.get();
      this.setHealthy('ipc', 'Main-process IPC dependencies are responsive', checkedAt);
    } catch (error) {
      const message = this.errorMessage(error);
      this.setFailed('ipc', 'IPC dependency check failed', message, checkedAt);
      this.notifyFailure('ipc', `IPC dependency check failed: ${message}`);
    }
  }

  private async checkStorage(checkedAt: string): Promise<void> {
    try {
      this.queueManager.getAll();
      this.historyManager.getAll();
      this.settingsManager.get();
      this.setHealthy('storage', 'Queue, history and settings are readable', checkedAt);
    } catch (error) {
      const message = this.errorMessage(error);
      this.setFailed('storage', 'Persistent data could not be read', message, checkedAt);
      this.notifyFailure('storage', `Persistent data check failed: ${message}`);
    }
  }

  private async checkScheduler(checkedAt: string): Promise<void> {
    const settings = this.settingsManager.get();
    const status = this.scheduler.getStatus();

    if (this.scheduler.shouldBeRunning() && !status.running) {
      try {
        this.setRecovering('scheduler', 'Scheduler stopped unexpectedly; restarting', checkedAt);
        this.scheduler.start(settings.scheduler.intervalMs || 5000);
        this.setHealthy('scheduler', 'Scheduler restarted automatically', checkedAt);
        return;
      } catch (error) {
        const message = this.errorMessage(error);
        this.setFailed('scheduler', 'Scheduler restart failed', message, checkedAt);
        this.notifyFailure('scheduler', `Scheduler could not be restarted: ${message}`);
        return;
      }
    }

    if (status.running) {
      this.setHealthy('scheduler', `Running; polling every ${status.intervalMs}ms`, checkedAt);
    } else {
      this.setStatus('scheduler', 'idle', 'Stopped by configuration/user action', checkedAt);
    }
  }

  private async checkRunner(checkedAt: string): Promise<void> {
    if (!this.runner.isRunning()) {
      this.setStatus('runner', 'idle', 'Idle; ready for the next job', checkedAt);
      return;
    }

    const stalledMs = Date.now() - this.lastRunnerProgressAt;
    if (stalledMs > 120000) {
      const message = `A job is running but no progress event was seen for ${Math.floor(stalledMs / 1000)}s`;
      this.setStatus('runner', 'warning', message, checkedAt);
      this.notifyFailure('runner', `${message}. It was not force-restarted to avoid duplicate auction actions.`);
      return;
    }

    this.setHealthy('runner', 'Active job is producing progress', checkedAt);
  }

  private async checkChrome(checkedAt: string): Promise<void> {
    const session = this.chromeManager.getSession();

    // During an active automation the Runner owns the browser/page. The
    // watchdog observes only and must never evaluate, reload, or restart the
    // same page in parallel.
    if (this.runner.isRunning()) {
      if (session) {
        this.setHealthy('chrome', 'Chrome/CDP connected; controlled by active Runner', checkedAt);
        this.setHealthy('commishes', 'Commishes page is controlled by the active Runner', checkedAt);
      } else {
        this.setStatus('chrome', 'warning', 'Runner is active but Chrome session is unavailable', checkedAt);
        this.setStatus('commishes', 'warning', 'Runner is active but Commishes session is unavailable', checkedAt);
      }
      return;
    }

    if (!session) {
      this.setStatus('chrome', 'idle', 'No active session; Chrome will be connected on demand', checkedAt);
      this.setStatus('commishes', 'idle', 'No active browser session', checkedAt);
      return;
    }

    try {
      let healthy = await this.chromeManager.healthCheck(session);

      // Playwright navigation can briefly destroy the page execution context even
      // while Chrome/CDP itself is healthy. Recheck before warning during a job.
      if (!healthy && this.runner.isRunning()) {
        for (let attempt = 1; attempt <= 2 && !healthy; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          healthy = await this.chromeManager.healthCheck(session);
        }

        if (healthy) {
          this.setHealthy('chrome', `Connected on CDP port ${session.port}; transient check recovered during active job`, checkedAt);
          return;
        }

        const message = 'Chrome health check is still failing while a job is running; no automatic restart was performed to avoid duplicate auction actions';
        this.setStatus('chrome', 'warning', message, checkedAt);
        this.notifyFailure('chrome', message);
        return;
      }

      if (healthy) {
        this.setHealthy('chrome', `Connected on CDP port ${session.port}`, checkedAt);
        return;
      }

      this.setRecovering('chrome', 'Chrome session is unhealthy; restarting', checkedAt);
      await this.chromeManager.restart();
      this.setHealthy('chrome', 'Chrome recovered after restart', checkedAt);
    } catch (error) {
      const message = this.errorMessage(error);
      this.setFailed('chrome', 'Chrome / CDP is unavailable', message, checkedAt);
      this.notifyFailure('chrome', `Chrome / CDP could not be recovered: ${message}`);
    }
  }

  private async checkCommishes(checkedAt: string): Promise<void> {
    const session = this.chromeManager.getSession();
    if (!session) {
      this.setStatus('commishes', 'idle', 'No active browser session', checkedAt);
      return;
    }

    try {
      const url = session.page.url();
      const healthy = await this.withTimeout(session.page.evaluate(() => Boolean(document.body)), 2500, false);
      if (!healthy) {
        if (this.runner.isRunning()) {
          throw new Error('Commishes page is not responsive while a job is running');
        }

        this.setRecovering('commishes', 'Commishes page is unresponsive; reloading', checkedAt);
        await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
        this.setHealthy('commishes', 'Commishes page recovered after reload', checkedAt);
        return;
      }

      if (url.toLowerCase().includes('ych.commishes.com')) {
        this.setHealthy('commishes', 'Commishes page is responsive', checkedAt);
      } else {
        this.setStatus('commishes', 'warning', `Browser tab is on a different page: ${url || 'unknown'}`, checkedAt);
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.setFailed('commishes', 'Commishes page check failed', message, checkedAt);
      this.notifyFailure('commishes', `Commishes session check failed: ${message}`);
    }
  }

  private ensureService(id: string, label: string): void {
    if (!this.services.has(id)) {
      this.services.set(id, {
        id,
        label,
        state: 'idle',
        message: 'Waiting for first check',
        lastCheckedAt: new Date().toISOString(),
        restartCount: 0
      });
    }
  }

  private setStatus(
    id: string,
    state: WatchdogState,
    message: string,
    checkedAt = new Date().toISOString(),
    lastError?: string
  ): void {
    const service = this.services.get(id);
    if (!service) return;
    service.state = state;
    service.message = message;
    service.lastCheckedAt = checkedAt;
    if (lastError !== undefined) service.lastError = lastError;
  }

  private setHealthy(id: string, message: string, checkedAt = new Date().toISOString()): void {
    this.setStatus(id, 'healthy', message, checkedAt);
  }

  private setRecovering(id: string, message: string, checkedAt = new Date().toISOString()): void {
    const service = this.services.get(id);
    if (!service) return;
    service.restartCount += 1;
    this.setStatus(id, 'recovering', message, checkedAt);
  }

  private setFailed(id: string, message: string, lastError?: string, checkedAt = new Date().toISOString()): void {
    this.setStatus(id, 'failed', message, checkedAt, lastError);
  }

  private notifyFailure(id: string, message: string): void {
    const now = Date.now();
    const last = this.alertCooldown.get(id) ?? 0;
    if (now - last < 60000) return;

    this.alertCooldown.set(id, now);
    try {
      new Notification({
        title: 'Commishes Watchdog',
        body: message,
        silent: false
      }).show();
    } catch (error) {
      logger.error('Watchdog notification failed:', error);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs))
    ]);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
