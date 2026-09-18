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
        throw new Error('Invalid DevToolsActivePort file');
    }

    const port = lines[0].trim();
    const wsPath = lines[1].trim();

    return `ws://127.0.0.1:${port}${wsPath}`;
}

(async () => {
    try {
        console.log('Connecting to existing Chrome...');

        const wsEndpoint = await getChromeWsEndpoint();

        const browser = await chromium.connectOverCDP(
            wsEndpoint
        );

        const context = browser.contexts()[0];

        console.log('Connected.');
        console.log('');

        // ---------------------------------------------------------
        // Ищем уже открытую вкладку Commishes
        // ---------------------------------------------------------

        let page = context.pages().find(
            p => p.url().includes('ych.commishes.com')
        );

        if (page) {
            console.log('Commishes tab FOUND.');
        } else {
            console.log('Commishes tab NOT FOUND.');
            console.log('Opening a new background tab...');

            page = await context.newPage();

            await page.goto(
                'https://ych.commishes.com/auction/create/',
                {
                    waitUntil: 'domcontentloaded'
                }
            );
        }

        // ВАЖНО:
        // Никакого page.bringToFront()
        // Никакого focus / click / fill.

        console.log('');
        console.log('=== PAGE INFO ===');

        console.log(
            'URL:',
            page.url()
        );

        console.log(
            'Title:',
            await page.title()
        );

        console.log(
            'H1:',
            await page.locator('h1').first().textContent()
                .catch(() => null)
        );

        console.log(
            'Forms:',
            await page.locator('form').count()
        );

        console.log(
            'Inputs:',
            await page.locator('input').count()
        );

        console.log(
            'Buttons:',
            await page.locator('button').count()
        );

        // Берём небольшой кусок текста страницы
        const bodyText = await page.locator('body').innerText();

        console.log('');
        console.log('=== PAGE TEXT PREVIEW ===');

        console.log(
            bodyText
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 500)
        );

        console.log('');
        console.log('=== ALL BROWSER TABS ===');

        const pages = context.pages();

        pages.forEach((p, i) => {
            console.log(
                `${i}: ${p.url()}`
            );
        });

        console.log('');
        console.log('Browser check completed.');
        console.log('No clicks, typing, uploads or submissions were performed.');

    } catch (error) {
        console.error('');
        console.error('Browser check FAILED:');
        console.error(error);
        process.exitCode = 1;
    }
})();