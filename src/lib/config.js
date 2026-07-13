'use strict';

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

module.exports = { BROWSER, HH, TIMEOUT };
