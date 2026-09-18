const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function getChromeWsEndpoint() {
    const activePortFile = path.join(
        process.env.LOCALAPPDATA,
        'Google',
        'Chrome',
        'User Data',
        'DevToolsActivePort'
    );

    if (!fs.existsSync(activePortFile)) {
        throw new Error(
            `DevToolsActivePort not found:\n${activePortFile}`
        );
    }

    const lines = fs
        .readFileSync(activePortFile, 'utf8')
        .trim()
        .split(/\r?\n/);

    if (lines.length < 2) {
        throw new Error(
            'Invalid DevToolsActivePort file'
        );
    }

    const port = lines[0].trim();
    const wsPath = lines[1].trim();

    return `ws://127.0.0.1:${port}${wsPath}`;
}

function checkForChallenge(page) {
    const url = page.url().toLowerCase();

    const suspiciousUrl =
        url.includes('captcha') ||
        url.includes('challenge') ||
        url.includes('verify');

    if (suspiciousUrl) {
        throw new Error(
            `Browser challenge detected at:\n${page.url()}`
        );
    }
}

(async () => {
    // =========================================================
    // SETTINGS
    // =========================================================

    const IMAGE_PATH = 'C:\\commishes-bot\\test.png';

    const TEST = {
        category: 'furry',
        subtitle: 'Space man YCH',
        title: 'Space man YCH',
        description: 'Test',

        // 0 = Safe
        // 1 = Questionable
        // 2 = Explicit
        // 3 = Shock
        rating: '0',

        // РќРµ РІРєР»СЋС‡Р°РµРј РїР»Р°С‚РЅРѕРµ РїСЂРѕРґРІРёР¶РµРЅРёРµ
        promoted: false,

        // РџСЂРѕРІРµСЂРёРј РІР°СЂРёР°РЅС‚ 24 С‡Р°СЃР°
        duration: '24',

        startingBid: '5.50',
        minIncrease: '1.25',

        // РќРµ РІРєР»СЋС‡Р°РµРј autobuy
        autobuyEnabled: true,
        autobuy: '50.00'
    };

    // =========================================================
    // CHECK IMAGE
    // =========================================================

    if (!fs.existsSync(IMAGE_PATH)) {
        throw new Error(
            `Test image not found:\n${IMAGE_PATH}`
        );
    }

    let browser;

    try {
        // =====================================================
        // CONNECT TO EXISTING CHROME
        // =====================================================

        const wsEndpoint = await getChromeWsEndpoint();

        console.log('Connecting to existing Chrome...');

        browser = await chromium.connectOverCDP(wsEndpoint);

        const contexts = browser.contexts();

        if (!contexts.length) {
            throw new Error(
                'No browser contexts found.'
            );
        }

        const context = contexts[0];

        console.log('Connected to Chrome.');
        console.log('');

        // =====================================================
        // PAGE 1 вЂ” CREATE
        // =====================================================

        let page = context.pages().find(
            p => p.url().includes(
                'ych.commishes.com/auction/create'
            )
        );

        if (!page) {
            console.log(
                'Create page not found. Opening it...'
            );

            page = await context.newPage();

            await page.goto(
                'https://ych.commishes.com/auction/create/',
                {
                    waitUntil: 'domcontentloaded'
                }
            );
        }

        await page.bringToFront();

        checkForChallenge(page);

        console.log('================================');
        console.log('PAGE 1 вЂ” CREATE AUCTION');
        console.log('================================');

        console.log('URL:', page.url());

        // -----------------------------------------------------
        // Upload image
        // -----------------------------------------------------

        const fileInput = page.locator(
            'input[type="file"][name="file"]'
        );

        if (!(await fileInput.count())) {
            throw new Error(
                'File input not found.'
            );
        }

        await fileInput.setInputFiles(
            IMAGE_PATH
        );

        // -----------------------------------------------------
        // Category
        // -----------------------------------------------------

        const category = page.locator(
            'select[name="category"]'
        );

        if (!(await category.count())) {
            throw new Error(
                'Category select not found.'
            );
        }

        await category.selectOption(
            TEST.category
        );

        // -----------------------------------------------------
        // Subtitle
        // -----------------------------------------------------

        await page.locator(
            'input[name="subtitle"]'
        ).fill(
            TEST.subtitle
        );

        // -----------------------------------------------------
        // Title
        // -----------------------------------------------------

        await page.locator(
            'input[name="title"]'
        ).fill(
            TEST.title
        );

        // -----------------------------------------------------
        // Description
        // -----------------------------------------------------

        await page.locator(
            'textarea[name="description"]'
        ).fill(
            TEST.description
        );

        // -----------------------------------------------------
        // Rating
        // -----------------------------------------------------

        await page.locator(
            `input[name="rating"][value="${TEST.rating}"]`
        ).check();

        // -----------------------------------------------------
        // NSFW OFF
        // -----------------------------------------------------

        const nsfw = page.locator(
            'input[name="nsfw"]'
        );

        if (
            await nsfw.count() &&
            await nsfw.isChecked()
        ) {
            await nsfw.uncheck();
        }

        // -----------------------------------------------------
        // Prevent sniping OFF
        // -----------------------------------------------------

        const noSniping = page.locator(
            'input[name="security[sniping_disabled]"]'
        );

        if (
            await noSniping.count() &&
            await noSniping.isChecked()
        ) {
            await noSniping.uncheck();
        }

        // -----------------------------------------------------
        // Create button
        // -----------------------------------------------------

        const createButton = page.getByRole(
            'button',
            {
                name: 'Create auction'
            }
        );

        const createDisabled =
            await createButton.isDisabled();

        console.log(
            'File:',
            IMAGE_PATH
        );

        console.log(
            'Category:',
            await category.inputValue()
        );

        console.log(
            'Subtitle:',
            await page
                .locator('input[name="subtitle"]')
                .inputValue()
        );

        console.log(
            'Title:',
            await page
                .locator('input[name="title"]')
                .inputValue()
        );

        console.log(
            'Rating:',
            await page
                .locator('input[name="rating"]:checked')
                .inputValue()
        );

        console.log(
            'Create button disabled:',
            createDisabled
        );

        if (createDisabled) {
            throw new Error(
                'Create auction button is still disabled.'
            );
        }

        // =====================================================
        // SUBMIT PAGE 1
        // =====================================================

        console.log('');
        console.log(
            'Submitting PAGE 1...'
        );

        await createButton.click();

        // Р–РґС‘Рј РїРµСЂРµС…РѕРґР° /start/...
        await page.waitForURL(
            /\/auction\/start\/\d+\//,
            {
                timeout: 30000,
                waitUntil: 'domcontentloaded'
            }
        );

        checkForChallenge(page);

        console.log('');
        console.log(
            'PAGE 1 SUCCESS'
        );

        console.log(
            'New URL:',
            page.url()
        );

        // =====================================================
        // PAGE 2 вЂ” START
        // =====================================================

        console.log('');
        console.log(
            '================================'
        );
        console.log(
            'PAGE 2 вЂ” AUCTION START'
        );
        console.log(
            '================================'
        );

        // -----------------------------------------------------
        // Promoted
        // -----------------------------------------------------

        const promoted = page.locator(
            'input[name="promoted"]'
        );

        if (!(await promoted.count())) {
            throw new Error(
                'Promoted checkbox not found.'
            );
        }

        if (
            TEST.promoted &&
            !(await promoted.isChecked())
        ) {
            await promoted.check();
        }

        if (
            !TEST.promoted &&
            (await promoted.isChecked())
        ) {
            await promoted.uncheck();
        }

        // -----------------------------------------------------
        // Duration
        // -----------------------------------------------------

        const duration = page.locator(
            `input[name="duration"][value="${TEST.duration}"]`
        );

        if (!(await duration.count())) {
            throw new Error(
                `Duration option not found: ${TEST.duration}`
            );
        }

        await duration.check();

        console.log(
            'Promoted:',
            await promoted.isChecked()
        );

        console.log(
            'Duration:',
            await page
                .locator('input[name="duration"]:checked')
                .inputValue()
        );

        // -----------------------------------------------------
        // PAGE 2 FORM
        // -----------------------------------------------------

        const startForm = page.locator(
            'form.regular'
        );

        if (!(await startForm.count())) {
            throw new Error(
                'Page 2 form not found.'
            );
        }

        const goButton = startForm.locator('button').first();

        if (!(await goButton.count())) {
            throw new Error(
                'Go button not found.'
            );
        }

        // =====================================================
        // SUBMIT PAGE 2
        // =====================================================

        console.log('');
        console.log(
            'Submitting PAGE 2 (Go)...'
        );

        await goButton.click();

        await page.waitForURL(
            /\/auction\/ready\/\d+\//,
            {
                timeout: 30000,
                waitUntil: 'domcontentloaded'
            }
        );

        checkForChallenge(page);

        console.log('');
        console.log(
            'PAGE 2 SUCCESS'
        );

        console.log(
            'New URL:',
            page.url()
        );

        // =====================================================
        // PAGE 3 вЂ” READY
        // =====================================================

        console.log('');
        console.log(
            '================================'
        );
        console.log(
            'PAGE 3 вЂ” CONFIRM START'
        );
        console.log(
            '================================'
        );

        // -----------------------------------------------------
        // Starting bid
        // -----------------------------------------------------

        const startingBid = page.locator(
            'input[name="startingbid"]'
        );

        if (!(await startingBid.count())) {
            throw new Error(
                'Starting bid field not found.'
            );
        }

        await startingBid.fill(
            TEST.startingBid
        );

        // -----------------------------------------------------
        // Minimum increase
        // -----------------------------------------------------

        const minIncrease = page.locator(
            'input[name="minincrease"]'
        );

        if (!(await minIncrease.count())) {
            throw new Error(
                'Minimum increase field not found.'
            );
        }

        await minIncrease.fill(
            TEST.minIncrease
        );

        // -----------------------------------------------------
        // Autobuy
        // -----------------------------------------------------

        const autobuyEnabled = page.locator(
            'input[name="autobuyenabled"]'
        );

        const autobuy = page.locator(
            'input[name="autobuy"]'
        );

        if (await autobuyEnabled.count()) {

            if (
                TEST.autobuyEnabled &&
                !(await autobuyEnabled.isChecked())
            ) {
                await autobuyEnabled.check();
            }

            if (
                !TEST.autobuyEnabled &&
                (await autobuyEnabled.isChecked())
            ) {
                await autobuyEnabled.uncheck();
            }
        }

        if (
            TEST.autobuyEnabled &&
            await autobuy.count()
        ) {
            await autobuy.fill(
                TEST.autobuy
            );
        }

        // =====================================================
        // READ FINAL VALUES
        // =====================================================

        console.log(
            'Starting bid:',
            await startingBid.inputValue()
        );

        console.log(
            'Minimum increase:',
            await minIncrease.inputValue()
        );

        console.log(
            'Autobuy enabled:',
            await autobuyEnabled.isChecked()
        );

        console.log(
            'Autobuy:',
            await autobuy.inputValue()
        );

        // -----------------------------------------------------
        // Find final button
        // -----------------------------------------------------

        const startButton = page.locator(
            'input[type="submit"][value="Start now!"]'
        );

        console.log(
            'Start now button found:',
            (await startButton.count()) > 0
        );

        // =====================================================
        // HARD STOP
        // =====================================================

        console.log('');
        console.log(
            '================================'
        );
        console.log(
            'FULL TEST SUCCESS'
        );
        console.log(
            '================================'
        );

        console.log(
            'Reached PAGE 3 successfully.'
        );

        console.log(
            'Start now! was NOT clicked.'
        );

        console.log(
            'Auction was NOT published.'
        );

        console.log('');
        console.log(
            'Chrome remains open on PAGE 3.'
        );

    } catch (error) {

        console.error('');
        console.error(
            '================================'
        );
        console.error(
            'TEST FAILED'
        );
        console.error(
            '================================'
        );

        console.error(
            error
        );

        process.exitCode = 1;
    }
})();



