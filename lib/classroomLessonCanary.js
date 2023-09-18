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

    log.info('Running canary...');

    // old lesson with 5 year signature expiry time will expire 28/06/2026
    // created from old existing production lesson using laravel tinker.
    // booking uuid must be updated before running the url method to be in
    // the format 'canary-{{$relationship->id}}...'

    await synthetics.executeStep('tutor', async () => {
        const tutorUrl = baseUrl + '?u=eqwmrmqe&r=tutor&l=canary-1330185-9xoy5d56&s=4462cf605aaf428a3cdb76fc9cbf1236ad9ab7a143229e0bc7d111690cfe3151&t=1782642273&novideo';

        await page.goto(tutorUrl, { waitUntil: ['load', 'networkidle0'] });
        await page.waitForSelector('[data-testid="new-board-button"]');
        await page.click('[data-testid="new-board-button"]');
        await page.waitForSelector('#board2');
    });

    await synthetics.executeStep('student', async () => {
        const studentUrl = baseUrl + '?u=rn36nma4&r=student&l=canary-1330185-9xoy5d56&s=a389da5e328b14fd6978f86b70a2d54617e66864cbce753c2db9ebbb691bba10&t=1782642298&novideo';

        await page.goto(studentUrl, { waitUntil: ['load', 'networkidle0'] });
        while (await page.$("#board2")) {
            await page.hover('#board2');
            await page.click('#board2 .delete-icon');
        }
        await page.waitForSelector('[data-testid="delete-icon"]', { hidden: true });
    });
};
