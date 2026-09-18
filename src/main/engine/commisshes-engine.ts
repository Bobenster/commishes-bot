import { Page } from 'playwright';
import { AuctionParams, DryRunResult, StageLog, BotChromeSession, logger, createJobLogger, saveErrorScreenshot, SELECTORS, URLS } from './index.js';

export class CommishesEngine {
  private jobLogger = createJobLogger;

  // Main entry point - DRY RUN only (stops at Page 3)
  async dryRun(params: AuctionParams, session: BotChromeSession): Promise<DryRunResult> {
    const jobId = `dryrun-${Date.now()}`;
    const jobLog = this.jobLogger(jobId);
    const stages: StageLog[] = [];

    const addStage = (stage: string, ok: boolean, durationMs: number, details?: Record<string, unknown>) => {
      stages.push({ stage, ok, timestamp: new Date().toISOString(), durationMs, details });
      jobLog.writeStage({ stage, ok, durationMs, details });
    };

    const page = session.page;

    try {
      // Match the reference workflow: operate on the active Commishes tab.
      await page.bringToFront();

      // Ensure we're on the create page
      await this.ensureCreatePage(page);
      await this.checkForChallenge(page);

      // ========== PAGE 1 - CREATE ==========
      const page1Start = Date.now();
      await this.fillPage1(page, params, addStage);
      addStage('page1_fill', true, Date.now() - page1Start);

      // Submit Page 1
      const submit1Start = Date.now();
      await this.submitPage1(page);
      addStage('page1_submit', true, Date.now() - submit1Start);

      // Wait for navigation to /start/
      await page.waitForURL(URLS.startPattern, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await this.checkForChallenge(page);
      addStage('page1_navigate', true, Date.now() - page1Start);

      // ========== PAGE 2 - START ==========
      const page2Start = Date.now();
      await this.fillPage2(page, params, addStage);
      addStage('page2_fill', true, Date.now() - page2Start);

      // Submit Page 2
      const submit2Start = Date.now();
      await this.submitPage2(page);
      addStage('page2_submit', true, Date.now() - submit2Start);

      // Wait for navigation to /ready/
      await page.waitForURL(URLS.readyPattern, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await this.checkForChallenge(page);
      addStage('page2_navigate', true, Date.now() - page2Start);

      // ========== PAGE 3 - READY ==========
      const page3Start = Date.now();
      const auctionUrl = await this.fillPage3(page, params, addStage);
      addStage('page3_fill', true, Date.now() - page3Start);

      // DRY RUN: Stop here, do NOT click "Start now!"
      addStage('dryrun_complete', true, Date.now() - page3Start, { auctionUrl });

      jobLog.writeResult(true);
      return {
        success: true,
        auctionUrl,
        stages
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Dry run failed:', error);
      
      // Try to capture screenshot
      try {
        const screenshot = await page.screenshot({ fullPage: true });
        const screenshotPath = saveErrorScreenshot(jobId, screenshot);
        addStage('error_screenshot', true, 0, { path: screenshotPath });
      } catch {}

      jobLog.writeResult(false, errorMsg);
      return {
        success: false,
        error: errorMsg,
        stages
      };
    }
  }

  // Full publish - NOT IMPLEMENTED (requires explicit user consent)
  async publish(params: AuctionParams, session: BotChromeSession): Promise<{ success: boolean; auctionUrl?: string; error?: string }> {
    throw new Error('Publish not implemented - requires explicit user consent. Use dryRun for testing.');
  }

  private async ensureCreatePage(page: Page): Promise<void> {
    if (!page.url().includes('ych.commishes.com/auction/create')) {
      await page.goto(URLS.create, { waitUntil: 'domcontentloaded' });
    }
  }

  private async checkForChallenge(page: Page): Promise<void> {
    const url = page.url().toLowerCase();
    const suspiciousUrl = SELECTORS.common.challengeIndicators.some(
      indicator => url.includes(indicator)
    );

    if (suspiciousUrl) {
      throw new Error(`Browser challenge detected at: ${page.url()}`);
    }
  }

  // ========== PAGE 1 ==========
  private async fillPage1(page: Page, params: AuctionParams, addStage: (stage: string, ok: boolean, durationMs: number, details?: any) => void): Promise<void> {
    // Upload image
    const fileInput = page.locator(SELECTORS.create.fileInput);
    if (!(await fileInput.count())) throw new Error('File input not found');
    await fileInput.setInputFiles(params.imagePath);
    addStage('upload_image', true, 0, { image: params.imagePath });

    // Category
    const category = page.locator(SELECTORS.create.category);
    if (!(await category.count())) throw new Error('Category select not found');
    await category.selectOption(params.category);
    addStage('select_category', true, 0, { category: params.category });

    // Subtitle
    await page.locator(SELECTORS.create.subtitle).fill(params.subtitle);

    // Title
    await page.locator(SELECTORS.create.title).fill(params.title);

    // Description
    await page.locator(SELECTORS.create.description).fill(params.description);

    // Rating
    await page.locator(SELECTORS.create.rating(params.rating)).check();
    addStage('select_rating', true, 0, { rating: params.rating });

    // NSFW OFF
    const nsfw = page.locator(SELECTORS.create.nsfw);
    if (await nsfw.count() && await nsfw.isChecked()) {
      await nsfw.uncheck();
    }

    // Prevent sniping OFF
    const noSniping = page.locator(SELECTORS.create.preventSniping);
    if (await noSniping.count() && await noSniping.isChecked()) {
      await noSniping.uncheck();
    }
  }

  private async submitPage1(page: Page): Promise<void> {
    const createButton = page.getByRole('button', { name: 'Create auction' });
    const createDisabled = await createButton.isDisabled();
    if (createDisabled) throw new Error('Create auction button is still disabled');
    await createButton.click();
  }

  // ========== PAGE 2 ==========
  private async fillPage2(page: Page, params: AuctionParams, addStage: (stage: string, ok: boolean, durationMs: number, details?: any) => void): Promise<void> {
    // Promoted
    const promoted = page.locator(SELECTORS.start.promoted);
    if (!(await promoted.count())) throw new Error('Promoted checkbox not found');

    if (params.promoted && !(await promoted.isChecked())) {
      await promoted.check();
    } else if (!params.promoted && await promoted.isChecked()) {
      await promoted.uncheck();
    }
    addStage('set_promoted', true, 0, { promoted: params.promoted });

    // Duration
    // The UI stores a semantic duration (24h / 3d / 7d). Resolve it against
    // the actual radio options on Commishes so we never invent site values.
    const durationValue = await this.resolveDurationValue(page, params.duration);
    const duration = page.locator(SELECTORS.start.duration(durationValue));
    await duration.check();
    addStage('set_duration', true, 0, {
      duration: params.duration,
      siteValue: durationValue
    });
  }

  private async resolveDurationValue(page: Page, duration: AuctionParams['duration']): Promise<string> {
    const expected = {
      '24h': { label: /24\\s*hours?/i, fallbackValues: ['24'] },
      '3d': { label: /3\\s*days?/i, fallbackValues: ['72'] },
      '7d': { label: /7\\s*days?/i, fallbackValues: ['168'] }
    }[duration];

    if (!expected) {
      throw new Error(`Unsupported duration: ${duration}`);
    }

    const options = await page.locator(SELECTORS.start.durationInputs).evaluateAll((inputs) =>
      inputs.map((input) => {
        const element = input as HTMLInputElement;
        const id = element.id;
        const linkedLabel = id
          ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
          : null;
        const container = linkedLabel || element.closest('label') || element.parentElement;
        return {
          value: element.value,
          text: (container?.textContent || '').replace(/\\s+/g, ' ').trim()
        };
      })
    );

    const byLabel = options.find(option => expected.label.test(option.text));
    if (byLabel) {
      return byLabel.value;
    }

    const byFallback = options.find(option => expected.fallbackValues.includes(option.value));
    if (byFallback) {
      return byFallback.value;
    }

    const available = options.map(option => `${option.value}:${option.text || 'unlabeled'}`).join(', ');
    throw new Error(
      `Duration option "${duration}" was not found on Commishes. Available options: ${available || 'none'}`
    );
  }

  private async submitPage2(page: Page): Promise<void> {
    const startForm = page.locator(SELECTORS.start.form);
    if (!(await startForm.count())) throw new Error('Page 2 form not found');

    const goButton = startForm.locator('button').first();
    if (!(await goButton.count())) throw new Error('Go button not found');
    await goButton.click();
  }

  // ========== PAGE 3 ==========
  private async fillPage3(page: Page, params: AuctionParams, addStage: (stage: string, ok: boolean, durationMs: number, details?: any) => void): Promise<string> {
    // Starting bid
    const startingBid = page.locator(SELECTORS.ready.startingBid);
    if (!(await startingBid.count())) throw new Error('Starting bid field not found');
    await startingBid.fill(params.startingBid);
    addStage('set_starting_bid', true, 0, { startingBid: params.startingBid });

    // Minimum increase
    const minIncrease = page.locator(SELECTORS.ready.minIncrease);
    if (!(await minIncrease.count())) throw new Error('Minimum increase field not found');
    await minIncrease.fill(params.minIncrease);
    addStage('set_min_increase', true, 0, { minIncrease: params.minIncrease });

    // Autobuy
    const autobuyEnabled = page.locator(SELECTORS.ready.autobuyEnabled);
    const autobuy = page.locator(SELECTORS.ready.autobuy);

    if (await autobuyEnabled.count()) {
      if (params.autobuyEnabled && !(await autobuyEnabled.isChecked())) {
        await autobuyEnabled.check();
      } else if (!params.autobuyEnabled && await autobuyEnabled.isChecked()) {
        await autobuyEnabled.uncheck();
      }
      addStage('set_autobuy_enabled', true, 0, { autobuyEnabled: params.autobuyEnabled });
    }

    if (params.autobuyEnabled && await autobuy.count()) {
      await autobuy.fill(params.autobuy);
      addStage('set_autobuy', true, 0, { autobuy: params.autobuy });
    }

    // Verify Start now! button exists (but don't click)
    const startButton = page.locator(SELECTORS.ready.startNowButton);
    const hasStartButton = (await startButton.count()) > 0;
    addStage('verify_start_button', hasStartButton, 0, { found: hasStartButton });

    if (!hasStartButton) {
      throw new Error('Start now! button not found on Page 3');
    }

    return page.url();
  }
}