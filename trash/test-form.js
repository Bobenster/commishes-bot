const { chromium } = require('playwright');
const path = require('path');

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

        // УКАЖИ ЗДЕСЬ ПУТЬ К ТЕСТОВОЙ КАРТИНКЕ
        const imagePath = 'C:\\commishes-bot\\test.jpg';

        console.log('Filling Commishes form...');

        // Загружаем изображение
        await page.locator('input[type="file"][name="file"]')
            .setInputFiles(imagePath);

        // Выбираем категорию
        await page.locator('select[name="category"]')
            .selectOption('furry');

        // Заполняем текст
        await page.locator('input[name="subtitle"]')
            .fill('TEST SUBTITLE');

        await page.locator('input[name="title"]')
            .fill('TEST AUCTION');

        await page.locator('textarea[name="description"]')
            .fill('TEST DESCRIPTION');

        // Rating = Explicit
        await page.locator('input[name="rating"][value="2"]')
            .check();

        console.log('\nForm values:');

        console.log(
            'Category:',
            await page.locator('select[name="category"]').inputValue()
        );

        console.log(
            'Subtitle:',
            await page.locator('input[name="subtitle"]').inputValue()
        );

        console.log(
            'Title:',
            await page.locator('input[name="title"]').inputValue()
        );

        console.log(
            'Description:',
            await page.locator('textarea[name="description"]').inputValue()
        );

        console.log(
            'Rating:',
            await page.locator('input[name="rating"]:checked').inputValue()
        );

        console.log(
            'Create button disabled:',
            await page.getByRole('button', {
                name: 'Create auction'
            }).isDisabled()
        );

        console.log('\nTEST COMPLETE — NOTHING WAS SUBMITTED.');

    } catch (error) {
        console.error('\nTest failed:');
        console.error(error);
        process.exitCode = 1;
    }
})();