'use strict';

const path = require('path');
const fs = require('fs');

// Shared browser automation config used across all Playwright contexts.
// Change the UA/viewport here to update everywhere at once.
const BROWSER = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:  { width: 1920, height: 1080 },
};

// hh.ru entry points
const HH = {
    login:       'https://hh.ru/account/login',
    resumes:     'https://hh.ru/applicant/resumes',
    negotiations:'https://hh.ru/applicant/negotiations',
    personal:    'https://hh.ru/applicant/personal',
    search:      'https://hh.ru/search/vacancy',
};

// Default timeouts (ms)
const TIMEOUT = {
    navigation: 30_000,
    element:    10_000,
    short:       5_000,
};

// Writable data directory.
// In packaged Electron, __dirname/.. points inside app.asar (read-only),
// so we use app.getPath('userData') which is a writable per-user folder.
// In CLI mode (node init.js / parse.js) we fall back to the project root.
let DATA_DIR;
try {
    const { app } = require('electron');
    if (app && app.getPath) {
        DATA_DIR = app.getPath('userData');
    }
} catch { /* not in Electron — CLI mode */ }
if (!DATA_DIR) {
    DATA_DIR = path.join(__dirname, '..', '..');
}
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

module.exports = { BROWSER, HH, TIMEOUT, DATA_DIR };
