const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const baseUrl = "https://{{url}}/";

exports.handler = async () => {
    const page = await synthetics.getPage();

    page.setDefaultTimeout(30000);

    page.on('console', (message) => {
        log.info(`Browser console log: ${message.type().substr(0, 3).toUpperCase()} ${message.text()}`);
    });

    page.on('pageerror', ({ message }) => {
        log.error('Unhandled exception on page: ' + message);
    });

    await synthetics.executeStep('demo', async () => {
        await page.goto(baseUrl, { waitUntil: ['load', 'networkidle0'] });
        await page.waitForSelector('.video-container');
        await page.waitForSelector('[data-testid="sharing-button-text"]');
        await page.click('[data-testid="sharing-button-text"]');
        await page.waitForSelector('.toast-body');
    });
};
