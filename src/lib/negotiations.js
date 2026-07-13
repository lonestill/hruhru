const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');
const { BROWSER, HH, TIMEOUT, DATA_DIR } = require('./config');

chromium.use(stealth);

const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

const randomDelay = (min, max) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1) + min)));

// Reads one negotiations page already loaded into `pg`. Cards are matched by
// hh.ru's stable data-qa hooks (Magritte redesign uses hashed class names
// that change between deploys, so those can't be relied on).
async function scrapeNegotiationsPage(pg) {
    return pg.evaluate(() => {
        const statusFromTag = (tagEl) => {
            if (!tagEl) return { status: '', statusCode: '' };
            const qa = tagEl.getAttribute('data-qa') || '';
            let statusCode = '';
            if (qa.includes('discard')) statusCode = 'discard';
            else if (qa.includes('interview')) statusCode = 'interview';
            else if (qa.includes('not-viewed')) statusCode = 'not_viewed';
            else if (qa.includes('viewed')) statusCode = 'viewed';
            else if (qa.includes('invitation')) statusCode = 'invitation';
            else if (qa.includes('hired')) statusCode = 'hired';
            return { status: tagEl.innerText?.trim() || '', statusCode };
        };

        const idFromHref = (href, prefix) => {
            if (!href) return '';
            const m = href.match(new RegExp(`${prefix}/(\\d+)`));
            return m ? m[1] : '';
        };

        const results = [];
        document.querySelectorAll('[data-qa="negotiations-item"]').forEach(card => {
            const row = card.closest('li') || card;

            const vacancyEl   = row.querySelector('[data-qa="negotiations-item-vacancy"]');
            const vacancyLink = vacancyEl?.closest('a') || row.querySelector('a[href*="/vacancy/"]');

            const companyEl   = row.querySelector('[data-qa="negotiations-item-company"]');
            const companyLink = companyEl?.closest('a') || row.querySelector('a[href*="/employer/"]');

            const dateEl = row.querySelector('[data-qa="negotiations-item-date"]');
            const tagEl  = row.querySelector('[data-qa*="negotiations-tag"]');
            const logoEl = row.querySelector('img[alt="Employer Logo"]');

            const title = vacancyEl?.innerText?.trim() || '';
            if (!title) return;

            const { status, statusCode } = statusFromTag(tagEl);

            results.push({
                title,
                url: vacancyLink?.href || '',
                vacancyId: idFromHref(vacancyLink?.href, 'vacancy'),
                employer: companyEl?.innerText?.trim() || '',
                employerUrl: companyLink?.href || '',
                employerId: idFromHref(companyLink?.href, 'employer'),
                logo: logoEl?.src || '',
                status,
                statusCode,
                date: dateEl?.innerText?.trim() || dateEl?.getAttribute('datetime') || ''
            });
        });

        return results;
    });
}

// `onPage(pageItems, totalSoFar)` fires after each page is scraped, so callers
// (the renderer, via IPC) can render results incrementally instead of waiting
// for all pages to finish.
async function getNegotiations(onPage) {
    if (!fs.existsSync(AUTH_FILE)) throw new Error('auth.json не найден');

    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: BROWSER.userAgent,
            viewport: BROWSER.viewport,
            storageState: AUTH_FILE
        });
        const pg = await context.newPage();
        await pg.goto(HH.negotiations, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
        await randomDelay(1500, 2500);

        const items = [];
        const MAX_PAGES = 30;

        for (let page = 0; page < MAX_PAGES; page++) {
            const pageItems = await scrapeNegotiationsPage(pg);
            items.push(...pageItems);
            if (onPage) onPage(pageItems, items.length);

            const nextLink = pg.locator('[data-qa="number-pages-next"]');
            if (await nextLink.count() === 0 || !(await nextLink.first().isVisible())) break;

            await nextLink.first().click();
            await pg.waitForLoadState('domcontentloaded');
            await randomDelay(1200, 2000);
        }

        return items;
    } finally {
        await browser.close();
    }
}

async function getResumes() {
    if (!fs.existsSync(AUTH_FILE)) throw new Error('auth.json не найден');

    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: BROWSER.userAgent,
            viewport: BROWSER.viewport,
            storageState: AUTH_FILE
        });
        const pg = await context.newPage();
        await pg.goto(HH.resumes, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
        await randomDelay(1500, 2000);

        return await pg.evaluate(() => {
            const results = [];
            document.querySelectorAll('[data-qa="resume-title"]').forEach((el, i) => {
                results.push({ index: i, title: el.innerText?.trim() || `Резюме ${i + 1}`, url: el.closest('a')?.href || '' });
            });
            return results;
        });
    } finally {
        await browser.close();
    }
}

module.exports = { getNegotiations, getResumes };
