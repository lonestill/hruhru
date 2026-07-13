'use strict';

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');
const { BROWSER, HH, TIMEOUT } = require('./config');

chromium.use(stealth);

const DATA_DIR = path.join(__dirname, '..', '..');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

// Fallback selectors in case the personal-info form fields change; hh.ru's
// header historically exposes the logged-in user's name via one of these.
const HEADER_NAME_SELECTORS = [
    '[data-qa="mainmenu_applicantProfile"]',
    '[data-qa="mainmenu_userNick"]',
    '[data-qa="supernova-personal-name"]',
];

// Scrapes the display name of whoever `page`'s session belongs to.
// Primary source is the personal-info form (separate first/last name inputs),
// falling back to header/menu text. Returns null instead of throwing so a
// selector change never breaks auth - the caller just won't get a name.
async function scrapeProfileName(page) {
    try {
        await page.goto(HH.personal, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
        await page.waitForTimeout(1000);

        const fromForm = await page.evaluate(() => {
            const first = document.querySelector('input[name="first_name"]')?.value?.trim();
            const last  = document.querySelector('input[name="last_name"]')?.value?.trim();
            const full  = [first, last].filter(Boolean).join(' ');
            return full || null;
        });
        if (fromForm) return fromForm;

        return await page.evaluate((selectors) => {
            for (const sel of selectors) {
                const text = document.querySelector(sel)?.innerText?.trim();
                if (text) return text;
            }
            return null;
        }, HEADER_NAME_SELECTORS);
    } catch {
        return null;
    }
}

// Launches its own headless session from the saved auth.json. Used when
// there is no cached name yet (first run after a manually-placed auth.json).
async function getProfileName() {
    if (!fs.existsSync(AUTH_FILE)) return null;

    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: BROWSER.userAgent,
            viewport: BROWSER.viewport,
            storageState: AUTH_FILE
        });
        const pg = await context.newPage();
        return await scrapeProfileName(pg);
    } catch {
        return null;
    } finally {
        await browser.close().catch(() => {});
    }
}

function loadProfileCache() {
    if (!fs.existsSync(PROFILE_FILE)) return null;
    try { return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8')); } catch { return null; }
}

function saveProfileCache(name) {
    const data = { name, cachedAt: new Date().toISOString() };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return data;
}

function clearProfileCache() {
    if (fs.existsSync(PROFILE_FILE)) fs.unlinkSync(PROFILE_FILE);
}

// Cached read used by the renderer on every status check - avoids spinning
// up a headless browser just to display the sidebar label.
async function getProfile() {
    const cached = loadProfileCache();
    if (cached && cached.name) return cached;
    const name = await getProfileName();
    return name ? saveProfileCache(name) : null;
}

module.exports = { getProfile, getProfileName, scrapeProfileName, saveProfileCache, clearProfileCache, loadProfileCache };
