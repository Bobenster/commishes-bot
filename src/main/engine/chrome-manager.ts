import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { Settings, logger } from './index.js';
import { SELECTORS, URLS } from './selectors.js';

export interface BotChromeSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  port: number;
  pid: number;
  cdpSession?: CDPSession;
}

export interface FoundChromeInfo {
  pid: number;
  port: number;
  commandLine: string;
}

export class ChromeManager extends EventEmitter {
  private settings: Settings;
  private currentSession: BotChromeSession | null = null;
  private chromeProcess: ChildProcess | null = null;
  private ensurePromise: Promise<BotChromeSession> | null = null;

  constructor(settingsManager: { get: () => Settings; on: (event: string, cb: () => void) => void }) {
    super();
    this.settings = settingsManager.get();
    settingsManager.on('changed', () => {
      this.settings = settingsManager.get();
    });
  }

  // Find existing BOT Chrome process by user-data-dir
  private findBotChrome(): FoundChromeInfo | null {
    const psScript = `
      Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
      Select-Object ProcessId, CommandLine |
      ConvertTo-Json -Compress
    `;

    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      psScript
    ], { encoding: 'utf8' });

    if (result.error) {
      throw result.error;
    }

    const output = result.stdout.trim();
    if (!output) return null;

    let processes;
    try {
      processes = JSON.parse(output);
    } catch {
      throw new Error(`Could not parse Chrome process list:\n${output}`);
    }

    if (!Array.isArray(processes)) {
      processes = [processes];
    }

    const normalizedProfile = this.settings.chrome.profilePath.replace(/\\/g, '\\\\');

    for (const process of processes) {
      const commandLine = process.CommandLine || '';

      if (
        commandLine.includes(`--user-data-dir=${this.settings.chrome.profilePath}`) ||
        commandLine.includes(`--user-data-dir="${this.settings.chrome.profilePath}"`)
      ) {
        const portMatch = commandLine.match(/--remote-debugging-port=(\d+)/);
        if (!portMatch) {
          throw new Error('BOT Chrome is running, but remote debugging port was not found.');
        }

        return {
          pid: Number(process.ProcessId),
          port: Number(portMatch[1]),
          commandLine
        };
      }
    }

    return null;
  }

  // Check debug endpoint
  private async getDebugInfo(port: number) {
    const addresses = [
      `http://127.0.0.1:${port}/json/version`,
      `http://[::1]:${port}/json/version`
    ];

    for (const url of addresses) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.json();
        if (data.webSocketDebuggerUrl) {
          return data;
        }
      } catch {
        // Try next address
      }
    }
    return null;
  }

  // Wait for debug endpoint
  private async waitForDebug(port: number, timeout = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const info = await this.getDebugInfo(port);
      if (info) return info;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  // Find available port
  private async findAvailablePort(): Promise<number> {
    for (let port = this.settings.chrome.debugPort; port < this.settings.chrome.debugPort + 20; port++) {
      const info = await this.getDebugInfo(port);
      if (!info) return port;
    }
    throw new Error('Could not find an available debug port.');
  }

  // Start BOT Chrome
  private async startBotChrome(): Promise<FoundChromeInfo> {
    fs.mkdirSync(this.settings.chrome.profilePath, { recursive: true });

    const port = await this.findAvailablePort();
    logger.info(`Starting BOT Chrome on port ${port}...`);

    this.chromeProcess = spawn(
      this.settings.chrome.executablePath,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${this.settings.chrome.profilePath}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--start-minimized'
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      }
    );

    this.chromeProcess.unref();

    const debugInfo = await this.waitForDebug(port);
    if (!debugInfo) {
      throw new Error(`BOT Chrome started but DevTools did not become available on port ${port}.`);
    }

    // We need to find the PID of the started process
    // Since we spawned it detached, we can't easily get the PID
    // We'll find it by searching for the process with our profile path and port
    await new Promise(r => setTimeout(r, 1000));
    const found = this.findBotChrome();
    if (!found) {
      throw new Error('Started Chrome but could not find its process');
    }

    return found;
  }

  // Ensure BOT Chrome is running and return session
  async ensureBotChrome(): Promise<BotChromeSession> {
    // Never open a second CDP connection when a usable session already exists.
    // The renderer polls this endpoint periodically, while Runner also calls it
    // at the beginning of a job. Reusing the same session prevents competing
    // connectOverCDP calls and accidental page/context races.
    if (
      this.currentSession &&
      this.currentSession.browser.isConnected() &&
      !this.currentSession.page.isClosed()
    ) {
      return this.currentSession;
    }

    if (this.ensurePromise) {
      return this.ensurePromise;
    }

    this.ensurePromise = this.connectOrCreateSession();

    try {
      return await this.ensurePromise;
    } finally {
      this.ensurePromise = null;
    }
  }

  private async connectOrCreateSession(): Promise<BotChromeSession> {
    // Try to find existing BOT Chrome.
    let botChrome = this.findBotChrome();

    if (botChrome) {
      logger.info('BOT Chrome already running', { pid: botChrome.pid, port: botChrome.port });
    } else {
      logger.info('BOT Chrome not running, starting new instance...');
      botChrome = await this.startBotChrome();
      logger.info('BOT Chrome started', { port: botChrome.port, pid: botChrome.pid });
    }

    const debugInfo = await this.getDebugInfo(botChrome.port);
    if (!debugInfo) {
      throw new Error(`Could not connect to BOT Chrome on port ${botChrome.port}.`);
    }

    logger.info('Connecting to BOT Chrome via CDP...', {
      port: botChrome.port,
      pid: botChrome.pid
    });

    // Use a bounded timeout so a wedged CDP handshake fails quickly and can
    // be retried by the caller instead of blocking the queue for 30+ seconds.
    const browser = await chromium.connectOverCDP(
      debugInfo.webSocketDebuggerUrl,
      { timeout: 10000 }
    );

    const contexts = browser.contexts();
    if (!contexts.length) {
      await browser.close().catch(() => {});
      throw new Error('BOT Chrome has no browser context.');
    }

    const context = contexts[0];
    const pages = context.pages();

    let page = pages.find(p =>
      p.url().toLowerCase().includes('ych.commishes.com') &&
      !p.isClosed()
    );

    if (!page) {
      logger.info('Commishes tab not found, creating new one...');
      page = await context.newPage();
      await page.goto(URLS.create, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } else {
      logger.info('Found existing Commishes tab');
    }

    this.currentSession = {
      browser,
      context,
      page,
      port: botChrome.port,
      pid: botChrome.pid
    };

    this.emit('sessionReady', this.currentSession);
    return this.currentSession;
  }

  // Health check - verify Chrome is responsive
  async healthCheck(session: BotChromeSession): Promise<boolean> {
    try {
      await session.page.evaluate(() => 1 + 1);
      return true;
    } catch {
      return false;
    }
  }

  // Get Commishes page (create if needed)
  async getCommishesPage(context: BrowserContext): Promise<Page> {
    const pages = context.pages();
    let page = pages.find(p => 
      p.url().toLowerCase().includes('ych.commishes.com')
    );

    if (!page) {
      page = await context.newPage();
      await page.goto(URLS.create, { waitUntil: 'domcontentloaded' });
    }
    return page;
  }

  // Check for challenges (captcha, etc.)
  async checkForChallenge(page: Page): Promise<void> {
    const url = page.url().toLowerCase();
    const suspiciousUrl = SELECTORS.common.challengeIndicators.some(
      indicator => url.includes(indicator)
    );

    if (suspiciousUrl) {
      throw new Error(`Browser challenge detected at: ${page.url()}`);
    }
  }

  // Get current session
  getSession(): BotChromeSession | null {
    return this.currentSession;
  }

  // Disconnect and cleanup
  async disconnect(): Promise<void> {
    if (this.currentSession) {
      try {
        await this.currentSession.browser.close();
      } catch (error) {
        logger.warn('Error closing browser:', error);
      }
      this.currentSession = null;
    }
    if (this.chromeProcess) {
      try {
        this.chromeProcess.kill();
      } catch {}
      this.chromeProcess = null;
    }
    logger.info('Chrome Manager disconnected');
  }

  // Force restart Chrome
  async restart(): Promise<BotChromeSession> {
    await this.disconnect();
    return this.ensureBotChrome();
  }
}