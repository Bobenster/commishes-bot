const { chromium } = require('playwright');

(async () => {
    try {
        const browser = await chromium.connectOverCDP(
            'ws://[::1]:9222/devtools/browser/1de71c26-5357-4ed9-839e-efe436fa989c'
        );

        const context = browser.contexts()[0];

        console.log('Connected to BOT Chrome.');
        console.log('Tabs:', context.pages().length);

        for (const [i, page] of context.pages().entries()) {
            console.log(`\nTab ${i}`);
            console.log('URL:', page.url());

            try {
                console.log('Title:', await page.title());
            } catch {
                console.log('Title: <unavailable>');
            }
        }

        let page = context.pages().find(
            p => p.url().includes('ych.commishes.com')
        );

        if (!page) {
            console.log('\nCommishes tab not found.');
            console.log('Opening Commishes in background...');

            page = await context.newPage();

            await page.goto(
                'https://ych.commishes.com/auction/create/',
                {
                    waitUntil: 'domcontentloaded'
                }
            );
        } else {
            console.log('\nCommishes tab FOUND.');
        }

        console.log('\n=== COMMISHES ===');
        console.log('URL:', page.url());
        console.log('Title:', await page.title());

        const h1 = await page
            .locator('h1')
            .first()
            .textContent()
            .catch(() => null);

        console.log('H1:', h1);

        console.log('No clicks.');
        console.log('No typing.');
        console.log('No uploads.');
        console.log('No form submission.');
        console.log('\nBrowser check complete.');

    } catch (error) {
        console.error('\nFAILED:');
        console.error(error);
        process.exitCode = 1;
    }
})();