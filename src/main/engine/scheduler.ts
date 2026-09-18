import { EventEmitter } from 'events';
import { QueueManager } from '../data/queue-manager.js';
import { Runner } from './runner.js';
import { SettingsManager } from '../data/settings-manager.js';
import { SchedulerStatus, logger } from './index.js';

export class Scheduler extends EventEmitter {
  private queueManager: QueueManager;
  private runner: Runner;
  private settingsManager: SettingsManager;
  
  private interval: NodeJS.Timeout | null = null;
  private intervalMs: number = 5000;
  private isProcessing: boolean = false;
  private lastTickAt?: Date;
  private nextTickAt?: Date;
  private jobsProcessed: number = 0;
  private jobsSucceeded: number = 0;
  private jobsFailed: number = 0;
  private lastRunAt?: Date;

  constructor(
    queueManager: QueueManager,
    runner: Runner,
    settingsManager: SettingsManager
  ) {
    super();
    this.queueManager = queueManager;
    this.runner = runner;
    this.settingsManager = settingsManager;
  }

  start(intervalMs?: number): void {
    if (this.interval) {
      logger.warn('Scheduler already running');
      return;
    }

    this.intervalMs = intervalMs || this.settingsManager.get().scheduler.intervalMs || 5000;
    this.jobsProcessed = 0;
    this.jobsSucceeded = 0;
    this.jobsFailed = 0;

    logger.info(`Scheduler started with interval ${this.intervalMs}ms`);

    // Run immediately once
    this.tick();

    // Then run on interval
    this.interval = setInterval(() => this.tick(), this.intervalMs);
    
    this.emit('started');
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Scheduler stopped');
      this.emit('stopped');
    }
  }

  private async tick(): Promise<void> {
    if (this.isProcessing) {
      logger.debug('Scheduler tick skipped - still processing previous job');
      return;
    }

    const settings = this.settingsManager.get();
    const cooldownMs = settings.scheduler.cooldownMs || 60000;

    // Check cooldown
    if (this.lastRunAt && (Date.now() - this.lastRunAt.getTime()) < cooldownMs) {
      return;
    }

    this.lastTickAt = new Date();
    this.nextTickAt = new Date(Date.now() + this.intervalMs);

    const dueJobs = this.queueManager.getDue(this.lastTickAt);
    
    if (dueJobs.length === 0) {
      this.emit('tick', this.getStatus());
      return;
    }

    this.isProcessing = true;
    this.emit('tick', this.getStatus());

    try {
      for (const job of dueJobs) {
        logger.info(`Processing job ${job.id}: ${job.params.title}`);
        
        const result = await this.runner.run(job);
        
        this.jobsProcessed++;
        if (result.success) {
          this.jobsSucceeded++;
        } else {
          this.jobsFailed++;
        }
        
        this.lastRunAt = new Date();
        
        // Only process one job per tick (sequential execution)
        break;
      }
    } catch (error) {
      logger.error('Scheduler tick error:', error);
    } finally {
      this.isProcessing = false;
      this.emit('tick', this.getStatus());
    }
  }

  getStatus(): SchedulerStatus {
    return {
      running: this.interval !== null,
      intervalMs: this.intervalMs,
      lastTickAt: this.lastTickAt?.toISOString(),
      nextTickAt: this.nextTickAt?.toISOString(),
      jobsProcessed: this.jobsProcessed,
      jobsSucceeded: this.jobsSucceeded,
      jobsFailed: this.jobsFailed,
      isProcessing: this.isProcessing
    };
  }

  getIntervalMs(): number {
    return this.intervalMs;
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
    if (this.interval) {
      this.stop();
      this.start(ms);
    }
  }
}