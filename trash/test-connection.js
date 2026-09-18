const { chromium } = require('playwright');

(async () => {
    const wsEndpoint =
        'ws://127.0.0.1:9222/devtools/browser/d37ea48b-5033-453e-976f-517bb544d45c';

    try {
        const browser = await chromium.connectOverCDP(wsEndpoint);
        const context = browser.contexts()[0];

        const page = context.pages().find(
            p => p.url().includes('ych.commishes.com/auction/create')
        );

        if (!page) {
            throw new Error('Вкладка Commishes не найдена');
        }

        console.log('Commishes tab found!\n');

        console.log('=== INPUTS ===');

        const inputs = await page.locator('input').evaluateAll(elements =>
            elements.map((el, i) => ({
                index: i,
                type: el.type,
                name: el.name,
                value: el.value,
                id: el.id,
                checked: el.checked
            }))
        );

        console.dir(inputs, { depth: null });

        console.log('\n=== SELECTS ===');

        const selects = await page.locator('select').evaluateAll(elements =>
            elements.map((el, i) => ({
                index: i,
                name: el.name,
                id: el.id,
                value: el.value,
                options: Array.from(el.options).map(o => ({
                    text: o.textContent.trim(),
                    value: o.value,
                    selected: o.selected
                }))
            }))
        );

        console.dir(selects, { depth: null });

        console.log('\n=== BUTTONS ===');

        const buttons = await page.locator('button').evaluateAll(elements =>
            elements.map((el, i) => ({
                index: i,
                text: el.textContent.trim(),
                type: el.type,
                name: el.name,
                value: el.value,
                id: el.id,
                disabled: el.disabled
            }))
        );

        console.dir(buttons, { depth: null });

        console.log('\n=== LABELS ===');

        const labels = await page.locator('label').evaluateAll(elements =>
            elements.map((el, i) => ({
                index: i,
                text: el.textContent.trim(),
                for: el.htmlFor
            }))
        );

        console.dir(labels, { depth: null });

        console.log('\nDiagnostic completed.');

    } catch (error) {
        console.error('\nTest failed:');
        console.error(error);
        process.exitCode = 1;
    }
})();