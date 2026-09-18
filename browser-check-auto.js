const { chromium } = require('playwright');
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH =
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PROFILE_PATH =
    'C:\\commishes-bot\\chrome-profile';

const PREFERRED_PORT = 9223;

const COMMISHES_URL =
    'https://ych.commishes.com/auction/create/';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// FIND EXISTING BOT CHROME PROCESS
// ============================================================

function findBotChrome() {
    const ps = `
        Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
        Select-Object ProcessId, CommandLine |
        ConvertTo-Json -Compress
    `;

    const result = spawnSync(
        'powershell.exe',
        [
            '-NoProfile',
            '-Command',
            ps
        ],
        {
            encoding: 'utf8'
        }
    );

    if (result.error) {
        throw result.error;
    }

    const output = result.stdout.trim();

    if (!output) {
        return null;
    }

    let processes;

    try {
        processes = JSON.parse(output);
    } catch {
        throw new Error(
            `Could not parse Chrome process list:\n${output}`
        );
    }

    if (!Array.isArray(processes)) {
        processes = [processes];
    }

    const normalizedProfile =
        PROFILE_PATH.replace(/\\/g, '\\\\');

    for (const process of processes) {
        const commandLine =
            process.CommandLine || '';

        if (
            commandLine.includes(
                `--user-data-dir=${PROFILE_PATH}`
            ) ||
            commandLine.includes(
                `--user-data-dir="${PROFILE_PATH}"`
            )
        ) {
            const portMatch =
                commandLine.match(
                    /--remote-debugging-port=(\d+)/
                );

            if (!portMatch) {
                throw new Error(
                    'BOT Chrome is running, but remote debugging port was not found.'
                );
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

// ============================================================
// CHECK DEBUG ENDPOINT
// ============================================================

async function getDebugInfo(port) {
    const addresses = [
        `http://127.0.0.1:${port}/json/version`,
        `http://[::1]:${port}/json/version`
    ];

    for (const url of addresses) {
        try {
            const response =
                await fetch(url);

            if (!response.ok) {
                continue;
            }

            const data =
                await response.json();

            if (data.webSocketDebuggerUrl) {
                return data;
            }
        } catch {
            // Try next address.
        }
    }

    return null;
}

// ============================================================
// WAIT FOR DEBUG ENDPOINT
// ============================================================

async function waitForDebug(port, timeout = 15000) {
    const started =
        Date.now();

    while (
        Date.now() - started < timeout
    ) {
        const info =
            await getDebugInfo(port);

        if (info) {
            return info;
        }

        await sleep(250);
    }

    return null;
}

// ============================================================
// FIND FREE PORT
// ============================================================

async function findAvailablePort() {
    for (
        let port = PREFERRED_PORT;
        port < PREFERRED_PORT + 20;
        port++
    ) {
        const info =
            await getDebugInfo(port);

        if (!info) {
            return port;
        }
    }

    throw new Error(
        'Could not find an available debug port.'
    );
}

// ============================================================
// START BOT CHROME
// ============================================================

async function startBotChrome() {
    fs.mkdirSync(
        PROFILE_PATH,
        {
            recursive: true
        }
    );

    const port =
        await findAvailablePort();

    console.log(
        `Starting BOT Chrome on port ${port}...`
    );

    const child =
        spawn(
            CHROME_PATH,
            [
                `--remote-debugging-port=${port}`,
                `--user-data-dir=${PROFILE_PATH}`,
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

    child.unref();

    const debugInfo =
        await waitForDebug(port);

    if (!debugInfo) {
        throw new Error(
            `BOT Chrome started but DevTools did not become available on port ${port}.`
        );
    }

    return {
        port,
        debugInfo
    };
}

// ============================================================
// MAIN
// ============================================================

(async () => {
    try {
        console.log(
            '================================'
        );
        console.log(
            'BOT CHROME CHECK'
        );
        console.log(
            '================================'
        );

        console.log(
            'Profile:',
            PROFILE_PATH
        );

        console.log('');

        // --------------------------------------------------------
        // STEP 1 — FIND EXISTING BOT CHROME
        // --------------------------------------------------------

        let botChrome =
            findBotChrome();

        if (botChrome) {

            console.log(
                'BOT Chrome is ALREADY RUNNING.'
            );

            console.log(
                'PID:',
                botChrome.pid
            );

            console.log(
                'Port:',
                botChrome.port
            );

        } else {

            console.log(
                'BOT Chrome is NOT running.'
            );

            botChrome =
                await startBotChrome();

            console.log(
                'BOT Chrome started.'
            );

            console.log(
                'Port:',
                botChrome.port
            );
        }

        // --------------------------------------------------------
        // STEP 2 — CONNECT TO THAT EXACT CHROME
        // --------------------------------------------------------

        const debugInfo =
            await getDebugInfo(
                botChrome.port
            );

        if (!debugInfo) {
            throw new Error(
                `Could not connect to BOT Chrome on port ${botChrome.port}.`
            );
        }

        console.log('');
        console.log(
            'Connecting to BOT Chrome...'
        );

        const browser =
            await chromium.connectOverCDP(
                debugInfo.webSocketDebuggerUrl
            );

        const contexts =
            browser.contexts();

        if (!contexts.length) {
            throw new Error(
                'BOT Chrome has no browser context.'
            );
        }

        const context =
            contexts[0];

        console.log(
            'Connected successfully.'
        );

        // --------------------------------------------------------
        // STEP 3 — CHECK TABS
        // --------------------------------------------------------

        const pages =
            context.pages();

        console.log('');
        console.log(
            'BOT Chrome tabs:',
            pages.length
        );

        let page =
            pages.find(
                p =>
                    p.url()
                        .toLowerCase()
                        .includes(
                            'ych.commishes.com'
                        )
            );

        if (page) {

            console.log(
                'Commishes tab FOUND.'
            );

        } else {

            console.log(
                'Commishes tab NOT FOUND.'
            );

            console.log(
                'Opening Commishes in background...'
            );

            page =
                await context.newPage();

            await page.goto(
                COMMISHES_URL,
                {
                    waitUntil:
                        'domcontentloaded'
                }
            );
        }

        // --------------------------------------------------------
        // IMPORTANT:
        // NO bringToFront()
        // NO click()
        // NO fill()
        // NO upload()
        // --------------------------------------------------------

        console.log('');
        console.log(
            '================================'
        );
        console.log(
            'COMMISHES PAGE'
        );
        console.log(
            '================================'
        );

        console.log(
            'URL:',
            page.url()
        );

        console.log(
            'Title:',
            await page.title()
        );

        const h1 =
            await page
                .locator('h1')
                .first()
                .textContent()
                .catch(() => null);

        console.log(
            'H1:',
            h1
        );

        console.log(
            'Forms:',
            await page
                .locator('form')
                .count()
        );

        console.log(
            'Inputs:',
            await page
                .locator('input')
                .count()
        );

        console.log(
            'Buttons:',
            await page
                .locator('button')
                .count()
        );

        // --------------------------------------------------------
        // SHOW ALL TABS
        // --------------------------------------------------------

        console.log('');
        console.log(
            '=== ALL BOT CHROME TABS ==='
        );

        for (
            const [i, p]
            of context.pages().entries()
        ) {
            console.log(
                `${i}: ${p.url()}`
            );
        }

        console.log('');
        console.log(
            '================================'
        );
        console.log(
            'CHECK SUCCESS'
        );
        console.log(
            '================================'
        );

        console.log(
            'Existing BOT Chrome was reused if available.'
        );

        console.log(
            'Otherwise BOT Chrome was started automatically.'
        );

        console.log(
            'Commishes tab was checked/opened.'
        );

        console.log(
            'No clicks.'
        );

        console.log(
            'No typing.'
        );

        console.log(
            'No uploads.'
        );

        console.log(
            'No form submissions.'
        );

        console.log(
            'No bringToFront().'
        );

        console.log('');

    } catch (error) {

        console.error('');
        console.error(
            '================================'
        );
        console.error(
            'CHECK FAILED'
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