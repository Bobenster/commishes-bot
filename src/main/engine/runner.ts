import { EventEmitter } from 'events';
import { QueueManager } from '../data/queue-manager.js';
import { HistoryManager } from '../data/history-manager.js';
import { SettingsManager } from '../data/settings-manager.js';
import { ChromeManager, BotChromeSession } from './chrome-manager.js';
import { CommishesEngine } from './commisshes-engine.js';
import { QueueItem, RunResult, JobProgress, AuctionParams, logger, createJobLogger } from './index.js';

export class Runner extends EventEmitter {
  private queueManager: QueueManager;
  private historyManager: HistoryManager;
  private settingsManager: SettingsManager;
  private chromeManager: ChromeManager;
  private engine: CommishesEngine;
  private currentJob: QueueItem | null = null;
  private currentSession: BotChromeSession | null = null;

  constructor(
    queueManager: QueueManager,
    historyManager: HistoryManager,
    settingsManager: SettingsManager,
    chromeManager: ChromeManager
  ) {
    super();
    this.queueManager = queueManager;
    this.historyManager = historyManager;
    this.settingsManager = settingsManager;
    this.chromeManager = chromeManager;
    this.engine = new CommishesEngine();
  }

  async run(job: QueueItem, modeOverride?: 'dry-run' | 'publish'): Promise<RunResult> {
    this.currentJob = job;
    const jobId = job.id;
    const jobLog = createJobLogger(jobId);
    const stages: JobProgress['stage'][] = [];

    logger.info('Runner.run started', { jobId, hasParams: !!job.params, paramsKeys: job.params ? Object.keys(job.params) : 'none' });

    const emitProgress = (stage: string, progress: number, message: string) => {
      const progressEvent: JobProgress = {
        jobId,
        stage,
        progress,
        message,
        timestamp: new Date().toISOString()
      };
      this.emit('progress', progressEvent);
    };

    try {
      emitProgress('starting', 5, 'Initializing...');
      this.queueManager.markRunning(jobId);

      // Ensure Chrome is running
      emitProgress('chrome_connect', 10, 'Connecting to Chrome...');
      this.currentSession = await this.chromeManager.ensureBotChrome();

      // Health check
      emitProgress('health_check', 15, 'Checking Chrome health...');
      const healthy = await this.chromeManager.healthCheck(this.currentSession);
      if (!healthy) {
        emitProgress('chrome_restart', 20, 'Chrome unhealthy, restarting...');
        this.currentSession = await this.chromeManager.restart();
      }

      // Run dry run (test mode) or publish based on settings
      const settings = this.settingsManager.get();
      const isTestMode = modeOverride === 'dry-run'
        ? true
        : modeOverride === 'publish'
          ? false
          : settings.engine.testMode;

      emitProgress('navigate', 25, isTestMode ? 'Running DRY RUN...' : 'Publishing...');
      
      let result;
      if (isTestMode) {
        result = await this.engine.dryRun(job.params, this.currentSession, jobId);
      } else {
        result = await this.engine.publish(job.params, this.currentSession, jobId);
      }

      // Process result
      if (result.success) {
        emitProgress('completed', 100, 'Completed successfully');
        
        this.queueManager.markCompleted(jobId, { 
          auctionUrl: result.auctionUrl, 
          stages: result.stages 
        });

        this.historyManager.append({
          queueItemId: jobId,
          idempotencyKey: job.idempotencyKey,
          startedAt: job.lastRunAt || new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          success: true,
          auctionUrl: result.auctionUrl,
          stages: result.stages,
          isDryRun: isTestMode
        });

        jobLog.writeResult(true);
        return {
          success: true,
          auctionUrl: result.auctionUrl,
          stages: result.stages,
          isDryRun: isTestMode
        };
      } else {
        throw new Error(result.error || 'Unknown error');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Job ${jobId} failed:`, errorMsg);

      emitProgress('failed', 100, `Failed: ${errorMsg}`);

      this.queueManager.markFailed(jobId, errorMsg);

      this.historyManager.append({
        queueItemId: jobId,
        idempotencyKey: job.idempotencyKey,
        startedAt: job.lastRunAt || new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        success: false,
        error: errorMsg,
        stages: [],
        isDryRun: isTestMode
      });

      jobLog.writeResult(false, errorMsg);

      return {
        success: false,
        error: errorMsg,
        stages: [],
        isDryRun: isTestMode
      };

    } finally {
      this.currentJob = null;
    }
  }

  // Manual run for "Run Now" or "Test Run" from UI.
  // Do not mutate SettingsManager just to force a dry-run.
  async runManual(job: QueueItem, mode: 'dry-run' | 'publish' = 'dry-run'): Promise<RunResult> {
    return this.run(job, mode);
  }

  getCurrentJob(): QueueItem | null {
    return this.currentJob;
  }

  isRunning(): boolean {
    return this.currentJob !== null;
  }
}