import { join } from 'path';
import { getAppDataPath } from './utils.js';
import * as fs from 'fs';
import * as electronLog from 'electron-log';

const LOG_DIR = join(getAppDataPath(), 'logs');
const JOBS_LOG_DIR = join(LOG_DIR, 'jobs');
const ERRORS_LOG_DIR = join(LOG_DIR, 'errors');

[LOG_DIR, JOBS_LOG_DIR, ERRORS_LOG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure electron-log
electronLog.initialize({ preload: true });
electronLog.transports.file.level = 'info';
electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
electronLog.transports.file.maxSize = 20 * 1024 * 1024; // 20MB
electronLog.transports.file.resolvePathFn = () => join(LOG_DIR, 'main.log');
electronLog.transports.console.level = 'debug';

// Export both the logger and the utility functions
export const logger = electronLog;

export interface StageLog {
  stage: string;
  ok: boolean;
  timestamp: string;
  durationMs: number;
  details?: Record<string, unknown>;
}

export interface JobLog {
  jobId: string;
  startedAt: string;
  finishedAt?: string;
  success?: boolean;
  error?: string;
  stages: StageLog[];
}

export function createJobLogger(jobId: string) {
  const logPath = join(JOBS_LOG_DIR, `${jobId}.log`);
  
  const writeStage = (stage: Omit<StageLog, 'timestamp'>) => {
    const entry: StageLog = {
      ...stage,
      timestamp: new Date().toISOString()
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  };

  const writeResult = (success: boolean, error?: string) => {
    const entry = {
      jobId,
      finishedAt: new Date().toISOString(),
      success,
      error
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  };

  return { writeStage, writeResult, logPath };
}

export function getJobLog(jobId: string): JobLog | null {
  const logPath = join(JOBS_LOG_DIR, `${jobId}.log`);
  if (!fs.existsSync(logPath)) return null;

  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
  const stages: StageLog[] = [];
  let finishedAt: string | undefined;
  let success: boolean | undefined;
  let error: string | undefined;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.stage) {
        stages.push(parsed);
      } else {
        finishedAt = parsed.finishedAt;
        success = parsed.success;
        error = parsed.error;
      }
    } catch {
      // Skip invalid lines
    }
  }

  return {
    jobId,
    startedAt: stages[0]?.timestamp || new Date().toISOString(),
    finishedAt,
    success,
    error,
    stages
  };
}

export function saveErrorScreenshot(jobId: string, buffer: Buffer): string {
  const timestamp = Date.now();
  const filename = `${jobId}-${timestamp}.png`;
  const filepath = join(ERRORS_LOG_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

export function getErrorScreenshots(jobId: string): string[] {
  if (!fs.existsSync(ERRORS_LOG_DIR)) return [];
  return fs.readdirSync(ERRORS_LOG_DIR)
    .filter(f => f.startsWith(jobId) && f.endsWith('.png'))
    .map(f => join(ERRORS_LOG_DIR, f))
    .sort()
    .reverse();
}