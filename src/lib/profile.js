'use strict';

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');
const { BROWSER, HH, TIMEOUT, DATA_DIR } = require('./config');

chromium.use(stealth);

const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

const HEADER_NAME_SELECTORS = [
    '[data-qa="mainmenu_applicantProfile"]',
    '[data-qa="mainmenu_userNick"]',
    '[data-qa="supernova-personal-name"]',
];

// Scrapes profile info from hh.ru/applicant/profile/me.
// Returns { name, subtitle, avatarUrl } or null.
// The profile page has:
//   <h1 data-qa="title">Иван Быков</h1>
//   <div ...>19 лет · Россия</div>
// We also try the personal-info form as a fallback for the name.
async function scrapeProfile(page) {
    try {
        await page.goto(HH.profile, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
        await page.waitForTimeout(2000);

        const data = await page.evaluate((selectors) => {
            const result = { name: null, subtitle: null, avatarUrl: null };

            // Name: h1[data-qa="title"] is the primary source
            const titleEl = document.querySelector('[data-qa="title"]');
            if (titleEl) {
                result.name = titleEl.innerText?.trim() || null;
            }

            // Fallback: first/last name inputs
            if (!result.name) {
                const first = document.querySelector('input[name="first_name"]')?.value?.trim();
                const last  = document.querySelector('input[name="last_name"]')?.value?.trim();
                result.name = [first, last].filter(Boolean).join(' ') || null;
            }

            // Fallback: header menu
            if (!result.name) {
                for (const sel of selectors) {
                    const text = document.querySelector(sel)?.innerText?.trim();
                    if (text) { result.name = text; break; }
                }
            }

            // Subtitle: the text next to the title, e.g. "19 лет · Россия"
            // On the profile page it's a sibling div with style-secondary class
            const titleContainer = titleEl?.closest('[data-qa="title-container"]') || titleEl?.parentElement;
            if (titleContainer) {
                const parent = titleContainer.parentElement;
                if (parent) {
                    const secondary = parent.querySelector('[class*="text_style-secondary"]');
                    if (secondary) {
                        result.subtitle = secondary.innerText?.trim() || null;
                    }
                }
            }

            // Avatar: look for profile image near the title
            const avatar = document.querySelector('[class*="avatar"] img, img[alt*="аватар"], img[class*="avatar"]');
            if (avatar) result.avatarUrl = avatar.src || null;

            return result;
        }, HEADER_NAME_SELECTORS);

        if (!data.name) return null;
        return data;
    } catch {
        return null;
    }
}

// Legacy alias — returns just the name string
async function scrapeProfileName(page) {
    const data = await scrapeProfile(page);
    return data ? data.name : null;
}

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

function saveProfileCache(data) {
    const cached = { ...data, cachedAt: new Date().toISOString() };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(cached, null, 2), 'utf-8');
    return cached;
}

function clearProfileCache() {
    if (fs.existsSync(PROFILE_FILE)) fs.unlinkSync(PROFILE_FILE);
}

// Cached read — returns { name, subtitle, avatarUrl, cachedAt } or null
async function getProfile() {
    const cached = loadProfileCache();
    if (cached && cached.name) return cached;
    if (!fs.existsSync(AUTH_FILE)) return null;

    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: BROWSER.userAgent,
            viewport: BROWSER.viewport,
            storageState: AUTH_FILE
        });
        const pg = await context.newPage();
        const data = await scrapeProfile(pg);
        return data ? saveProfileCache(data) : null;
    } catch {
        return null;
    } finally {
        await browser.close().catch(() => {});
    }
}

module.exports = { getProfile, getProfileName, scrapeProfile, scrapeProfileName, saveProfileCache, clearProfileCache, loadProfileCache };
