const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { BROWSER, HH, TIMEOUT } = require('./config');

chromium.use(stealth);

const DATA_DIR = path.join(__dirname, '..', '..');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1) + min));

// ---- Search ----
// Scrapes one SERP page already loaded in `pg` and extracts structured cards.
async function scrapeSearchPage(pg) {
    return pg.evaluate(() => {
        const cards = [];
        document.querySelectorAll('[data-qa="vacancy-serp__vacancy"]').forEach(card => {
            const get = (qa) => card.querySelector(`[data-qa="${qa}"]`);
            const getText = (qa) => get(qa)?.innerText?.trim() || '';
            const getHref = (qa) => get(qa)?.href || '';

            const titleEl    = get('serp-item__title') || get('vacancy-serp__vacancy-title');
            const employerEl = get('vacancy-serp__vacancy-employer');
            const salaryEl   = card.querySelector('[data-qa*="vacancy-serp__vacancy-compensation"]');
            const addressEl  = get('vacancy-serp__vacancy-address');
            const metroEl    = get('address-metro-station-name');
            const ratingEl   = get('company-review-rating-value');
            const reviewsEl  = get('company-review-rating-reviews-count');
            const expEl      = card.querySelector('[data-qa*="vacancy-serp__vacancy-work-experience"]');
            const respEl     = card.querySelector('[data-qa*="vacancy_snippet_responsibility"]');
            const reqEl      = card.querySelector('[data-qa*="vacancy_snippet_requirement"]');
            const respondEl  = get('vacancy-serp__vacancy_response');
            const logoEl     = get('vacancy-serp__vacancy-employer-logo-image');

            const titleHref = titleEl?.href || '';
            const idMatch = titleHref.match(/\/vacancy\/(\d+)/);

            cards.push({
                id: idMatch?.[1] || '',
                title: titleEl?.innerText?.trim() || '',
                url: titleHref,
                employer: employerEl?.innerText?.trim() || '',
                employerUrl: employerEl?.href || '',
                salary: salaryEl?.innerText?.trim() || '',
                address: addressEl?.innerText?.trim() || '',
                metro: metroEl?.innerText?.trim() || '',
                rating: ratingEl?.innerText?.trim() || '',
                reviews: reviewsEl?.innerText?.trim() || '',
                experience: expEl?.innerText?.trim() || '',
                responsibility: respEl?.innerText?.split('\n')[0]?.trim() || '',
                requirement: reqEl?.innerText?.split('\n')[0]?.trim() || '',
                canRespond: !!respondEl,
                responded: respondEl?.innerText?.includes('Отклик') || card.querySelector('[data-qa="vacancy-serp__vacancy_responded"]') !== null,
                logo: logoEl?.src || ''
            });
        });

        const totalEl = document.querySelector('[data-qa="vacancies-total-found"]');
        const pagesEl = document.querySelector('.pager');
        let totalPages = 1;
        if (pagesEl) {
            const allPageBtns = pagesEl.querySelectorAll('[data-qa="pager-page"]');
            if (allPageBtns.length > 0) {
                totalPages = parseInt(allPageBtns[allPageBtns.length - 1].innerText) || 1;
            }
        }

        return {
            cards,
            total: totalEl?.innerText?.replace(/\D/g, '') || String(cards.length),
            totalPages,
            currentPage: parseInt(new URL(location.href).searchParams.get('page') || '0') + 1
        };
    });
}

// Add a param that may be a single value or an array of values (hh.ru uses
// repeated query params for multi-select filters like area, search_field, etc).
function addParam(params, key, val) {
    if (val === undefined || val === null || val === '') return;
    if (Array.isArray(val)) {
        val.forEach(v => { if (v !== '' && v !== null) params.append(key, v); });
    } else {
        params.append(key, val);
    }
}

// Fetches up to `pages` SERP pages in one call, merging all cards so the
// renderer can filter/sort across a larger set than hh.ru's 20-per-page.
async function searchVacancies(opts = {}) {
    if (!fs.existsSync(AUTH_FILE)) throw new Error('auth.json не найден');

    const {
        text, area, salary, experience, remote, onlyWithSalary,
        pages = 3, page,
        // hh.ru server-side filters
        searchField, workFormat, employmentForm, workScheduleByDays,
        workingHours, education, label, inclusivenessTypes,
        salaryMode, currencyCode, acceptTemporary, excludedText,
        searchPeriod, orderBy,
    } = opts;

    const wantPages  = (page ? 1 : Math.max(1, Math.min(pages, 10)));
    const startPage  = page ? page : 1;

    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: BROWSER.userAgent,
            viewport: BROWSER.viewport,
            storageState: AUTH_FILE
        });
        const pg = await context.newPage();

        const buildUrl = (p) => {
            const params = new URLSearchParams();
            addParam(params, 'text', text);
            addParam(params, 'area', area);
            addParam(params, 'salary', salary);
            addParam(params, 'experience', experience);
            addParam(params, 'search_field', searchField);
            addParam(params, 'work_format', workFormat);
            addParam(params, 'employment_form', employmentForm);
            addParam(params, 'work_schedule_by_days', workScheduleByDays);
            addParam(params, 'working_hours', workingHours);
            addParam(params, 'education', education);
            addParam(params, 'label', label);
            addParam(params, 'inclusiveness_types', inclusivenessTypes);
            addParam(params, 'salary_mode', salaryMode);
            addParam(params, 'currency_code', currencyCode);
            addParam(params, 'accept_temporary', acceptTemporary ? 'true' : '');
            addParam(params, 'excluded_text', excludedText);
            addParam(params, 'search_period', searchPeriod);
            addParam(params, 'order_by', orderBy);
            if (onlyWithSalary) params.set('only_with_salary', 'true');
            if (remote) params.set('schedule', 'remote');
            if (p > 1) params.set('page', p - 1);
            return `${HH.search}?${params.toString()}`;
        };

        const allCards = [];
        let totalPages = 1, total = '0';

        for (let p = startPage; p < startPage + wantPages; p++) {
            await pg.goto(buildUrl(p), { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
            await randomDelay(1500, 2500);
            const res = await scrapeSearchPage(pg);
            allCards.push(...res.cards);
            total = res.total;
            totalPages = res.totalPages;
            if (p >= totalPages) break;
            if (res.cards.length === 0) break;
            await randomDelay(1200, 2000);
        }

        return {
            cards: allCards,
            total,
            totalPages,
            currentPage: startPage,
            fetchedPages: wantPages
        };
    } finally {
        await browser.close();
    }
}

// ---- Apply to single vacancy ----
async function applyToVacancy({ vacancyId, vacancyUrl, coverLetter, resumeIndex = 0 }) {
    if (!fs.existsSync(AUTH_FILE)) throw new Error('auth.json не найден');

    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: BROWSER.userAgent,
            viewport: BROWSER.viewport,
            storageState: AUTH_FILE
        });
        const pg = await context.newPage();

        const url = vacancyUrl || `https://hh.ru/vacancy/${vacancyId}`;
        await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
        await randomDelay(1500, 2500);

        // Check if already responded
        const alreadyResponded = await pg.locator('[data-qa="vacancy-response-link-top"][data-qa-responded="true"], .vacancy-response-letter-already-sent').count();
        if (alreadyResponded > 0) {
            return { ok: false, reason: 'already_responded' };
        }

        // Click respond button
        const respondBtn = pg.locator('[data-qa="vacancy-response-link-top"]').first();
        if (!await respondBtn.isVisible({ timeout: 5000 })) {
            return { ok: false, reason: 'no_respond_button' };
        }
        await respondBtn.click();
        await randomDelay(1500, 2500);

        // Handle resume selection if multiple
        const resumeSelect = pg.locator('[data-qa="resume-block__title"]');
        if (await resumeSelect.count() > 1) {
            const items = await resumeSelect.all();
            const idx = Math.min(resumeIndex, items.length - 1);
            await items[idx].click();
            await randomDelay(500, 1000);
        }

        // Fill cover letter if field exists
        const letterField = pg.locator('[data-qa="vacancy-response-popup-form-letter-input"], textarea[name="text"]').first();
        if (await letterField.isVisible({ timeout: 2000 }).catch(() => false)) {
            if (coverLetter) {
                await letterField.click();
                await letterField.fill(coverLetter);
                await randomDelay(500, 1000);
            }
        }

        // Submit
        const submitBtn = pg.locator('[data-qa="vacancy-response-submit-popup"], [data-qa="submit-response-button"]').first();
        if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await submitBtn.click();
        } else {
            // Try modal submit
            const modalSubmit = pg.locator('[data-qa="vacancy-response-letter-submit"]').first();
            if (await modalSubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
                await modalSubmit.click();
            }
        }

        await randomDelay(2000, 3000);
        return { ok: true };

    } finally {
        await browser.close();
    }
}

// ---- Auto-apply ----
const parseSalaryNum = (s) => { if (!s) return null; const m = s.replace(/\s/g, '').match(/(\d+)/); return m ? parseInt(m[1]) : null; };
const parseReviewsNum = (s) => { if (!s) return 0; const m = s.replace(/\s/g, '').match(/(\d+)/); return m ? parseInt(m[1]) : 0; };

function fillTemplate(tpl, v) {
    return tpl
        .replace(/\{title\}/g, v.title || '')
        .replace(/\{employer\}/g, v.employer || '')
        .replace(/\{salary\}/g, v.salary || '');
}

class AutoApply extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this._stopped = false;
        this._browser = null;
        this._scheduleTimer = null;
        this._seenIds = new Set();
    }

    log(msg) { this.emit('log', msg); }
    stop() {
        this._stopped = true;
        if (this._scheduleTimer) { clearTimeout(this._scheduleTimer); this._scheduleTimer = null; }
        if (this._browser) this._browser.close().catch(() => {});
    }

    matchesFilters(v) {
        const f = this.config.filters || {};
        if (!f) return true;

        if (f.onlyWithSalary && !v.salary) return false;

        const salNum = parseSalaryNum(v.salary);
        if (f.minSalary && salNum !== null && salNum < f.minSalary) return false;
        if (f.maxSalary && salNum !== null && salNum > f.maxSalary) return false;

        if (f.minRating && parseFloat(v.rating) < f.minRating) return false;
        if (f.minReviews && parseReviewsNum(v.reviews) < f.minReviews) return false;

        if (f.blacklist && f.blacklist.length) {
            const emp = (v.employer || '').toLowerCase();
            if (f.blacklist.some(b => emp.includes(b.toLowerCase()))) return false;
        }

        if (f.whitelist && f.whitelist.length) {
            const emp = (v.employer || '').toLowerCase();
            if (!f.whitelist.some(w => emp.includes(w.toLowerCase()))) return false;
        }

        if (f.excludeWords && f.excludeWords.length) {
            const title = (v.title || '').toLowerCase();
            const emp = (v.employer || '').toLowerCase();
            if (f.excludeWords.some(w => title.includes(w) || emp.includes(w))) return false;
        }

        if (f.keywords && f.keywords.length) {
            const text = (v.title + ' ' + (v.responsibility || '')).toLowerCase();
            if (f.keywordMode === 'all') {
                if (!f.keywords.every(k => text.includes(k.toLowerCase()))) return false;
            } else {
                if (!f.keywords.some(k => text.includes(k.toLowerCase()))) return false;
            }
        }

        return true;
    }

    pickCoverLetter(v) {
        const tpls = (this.config.coverLetters || []).filter(t => t && t.trim());
        if (!tpls.length) return '';
        const tpl = tpls[Math.floor(Math.random() * tpls.length)];
        return fillTemplate(tpl, v);
    }

    _buildSearchParams(p) {
        const params = new URLSearchParams();
        if (p.text)           params.set('text', p.text);
        if (p.area) {
            const areas = Array.isArray(p.area) ? p.area : String(p.area).split(',').map(s => s.trim()).filter(Boolean);
            areas.forEach(a => params.append('area', a));
        }
        if (p.experience)     params.set('experience', p.experience);
        if (p.onlyWithSalary) params.set('only_with_salary', 'true');
        if (p.searchPeriod)   params.set('search_period', p.searchPeriod);
        if (p.orderBy)        params.set('order_by', p.orderBy);
        (p.workFormat || []).forEach(v => params.append('work_format', v));
        (p.employmentForm || []).forEach(v => params.append('employment_form', v));
        if (p.education)      params.set('education', p.education);
        (p.label || []).forEach(v => params.append('label', v));
        return params;
    }

    async run() {
        if (!fs.existsSync(AUTH_FILE)) {
            this.emit('done', false, 'auth.json не найден');
            return;
        }

        const { searchParams, resumeIndex = 0,
                maxApply = 20, delayMin = 8000, delayMax = 15000,
                maxPages = 10, maxErrors = 5, retryAttempts = 1,
                dryRun = false } = this.config;

        let applied = 0, skipped = 0, errors = 0, page = 1;

        this.log(dryRun
            ? `🧪 Пробный прогон (без реальных откликов). Цель: до ${maxApply}`
            : `🚀 Автоотклик запущен. Цель: до ${maxApply} откликов`);

        const browser = await chromium.launch({ headless: true });
        this._browser = browser;

        try {
            const context = await browser.newContext({
                userAgent: BROWSER.userAgent,
                viewport: BROWSER.viewport,
                storageState: AUTH_FILE
            });
            const pg = await context.newPage();

            while (!this._stopped && applied < maxApply && page <= maxPages) {
                this.log(`📄 Страница ${page}...`);
                this.emit('progress', { applied, skipped, errors, page });

                const params = this._buildSearchParams(searchParams);
                if (page > 1) params.set('page', page - 1);

                await pg.goto(`${HH.search}?${params}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
                await randomDelay(2000, 3000);

                const vacancies = await pg.evaluate(() => {
                    const cards = [];
                    document.querySelectorAll('[data-qa="vacancy-serp__vacancy"]').forEach(card => {
                        const titleEl    = card.querySelector('[data-qa="serp-item__title"]');
                        const employerEl = card.querySelector('[data-qa="vacancy-serp__vacancy-employer"]');
                        const salaryEl   = card.querySelector('[data-qa*="vacancy-serp__vacancy-compensation"]');
                        const respondEl  = card.querySelector('[data-qa="vacancy-serp__vacancy_response"]');
                        const idMatch    = titleEl?.href?.match(/\/vacancy\/(\d+)/);
                        const respEl     = card.querySelector('[data-qa*="vacancy_snippet_responsibility"]');
                        const ratingEl   = card.querySelector('[data-qa="company-review-rating-value"]');
                        const reviewsEl  = card.querySelector('[data-qa="company-review-rating-reviews-count"]');
                        cards.push({
                            id: idMatch?.[1] || '',
                            title: titleEl?.innerText?.trim() || '',
                            url: titleEl?.href || '',
                            employer: employerEl?.innerText?.trim() || '',
                            salary: salaryEl?.innerText?.trim() || '',
                            responsibility: respEl?.innerText?.split('\n')[0]?.trim() || '',
                            rating: ratingEl?.innerText?.trim() || '',
                            reviews: reviewsEl?.innerText?.trim() || '',
                            canRespond: !!respondEl,
                            responded: card.querySelector('[data-qa="vacancy-serp__vacancy_responded"]') !== null
                        });
                    });
                    const hasNext = !!document.querySelector('[data-qa="pager-next"]');
                    return { cards, hasNext };
                });

                if (!vacancies.cards.length) { this.log('📭 Вакансии закончились'); break; }

                let newOnPage = 0;
                for (const v of vacancies.cards) {
                    if (this._stopped || applied >= maxApply) break;
                    if (!v.id) continue;
                    if (this._seenIds.has(v.id)) { skipped++; continue; }
                    if (v.responded) { skipped++; this._seenIds.add(v.id); continue; }
                    if (!this.matchesFilters(v)) {
                        this.log(`⏭ Пропускаем: ${v.title}`);
                        skipped++;
                        this._seenIds.add(v.id);
                        continue;
                    }

                    if (dryRun) {
                        applied++; newOnPage++;
                        this.log(`🧪 [DRY-RUN] Отклик: ${v.title} — ${v.employer || '—'} ${v.salary ? '· ' + v.salary : ''}`);
                        this._seenIds.add(v.id);
                        this.emit('progress', { applied, skipped, errors, page });
                        continue;
                    }

                    const letter = this.pickCoverLetter(v);
                    this.log(`📤 Откликаемся: ${v.title} — ${v.employer || '—'} ${v.salary ? '· ' + v.salary : ''}`);

                    let res = null, lastErr = null;
                    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
                        try {
                            res = await this._applySingle(context, v.url, letter, resumeIndex);
                            if (res.ok || res.reason === 'already_responded') break;
                        } catch (err) {
                            lastErr = err;
                            this.log(`⚠️ Попытка ${attempt}/${retryAttempts} неудачна: ${err.message}`);
                        }
                        if (attempt < retryAttempts && !this._stopped) await delay(2000);
                    }

                    if (res && res.ok) {
                        applied++; newOnPage++;
                        this.log(`✅ Отклик отправлен (${applied}/${maxApply})`);
                    } else if (res && res.reason === 'already_responded') {
                        this.log(`⏭ Уже откликались ранее`);
                        skipped++;
                    } else {
                        this.log(`⚠️ Не удалось: ${res ? res.reason : (lastErr ? lastErr.message : 'unknown')}`);
                        errors++;
                        if (maxErrors > 0 && errors >= maxErrors) {
                            this.log(`⏹ Лимит ошибок (${maxErrors}) — остановка`);
                            this.emit('progress', { applied, skipped, errors, page });
                            break;
                        }
                    }

                    this._seenIds.add(v.id);
                    this.emit('progress', { applied, skipped, errors, page });

                    if (applied < maxApply && !this._stopped) {
                        const wait = Math.floor(Math.random() * (delayMax - delayMin) + delayMin);
                        this.log(`⏳ Пауза ${(wait / 1000).toFixed(0)}с...`);
                        await delay(wait);
                    }
                }

                if (errors >= maxErrors && maxErrors > 0) break;
                if (!vacancies.hasNext) break;
                if (newOnPage === 0 && !dryRun) {
                    this.log(`📭 Новых вакансий на странице ${page} не найдено`);
                }
                page++;
                await randomDelay(2000, 4000);
            }

            const summary = `Откликнулись: ${applied}, пропущено: ${skipped}, ошибок: ${errors}`;
            this.log(this._stopped ? `⏹ Остановлено. ${summary}` : `🎉 Готово. ${summary}`);
            this.emit('done', true, summary);

        } catch (err) {
            if (!this._stopped) {
                this.log(`❌ Ошибка: ${err.message}`);
                this.emit('done', false, err.message);
            }
        } finally {
            await browser.close().catch(() => {});
            this._browser = null;
        }

        // Schedule next run if enabled and not stopped
        if (!this._stopped && this.config.scheduleEnabled && this.config.scheduleInterval) {
            const ms = this.config.scheduleInterval * 3600 * 1000;
            this.log(`⏰ Следующий запуск через ${this.config.scheduleInterval}ч`);
            this._scheduleTimer = setTimeout(() => {
                if (!this._stopped) {
                    this._seenIds.clear();
                    this.run();
                }
            }, ms);
        }
    }

    async _applySingle(context, vacancyUrl, coverLetter, resumeIndex) {
        const pg = await context.newPage();
        try {
            await pg.goto(vacancyUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
            await randomDelay(1200, 2000);

            const alreadyResponded = await pg.locator('[data-qa="vacancy-response-link-top"][aria-disabled="true"]').count();
            if (alreadyResponded > 0) return { ok: false, reason: 'already_responded' };

            const respondBtn = pg.locator('[data-qa="vacancy-response-link-top"]').first();
            if (!await respondBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
                return { ok: false, reason: 'no_respond_button' };
            }
            await respondBtn.click();
            await randomDelay(1500, 2500);

            const resumeItems = await pg.locator('[data-qa="resume-block__title"]').all();
            if (resumeItems.length > 1) {
                const idx = Math.min(resumeIndex, resumeItems.length - 1);
                await resumeItems[idx].click();
                await randomDelay(500, 1000);
            }

            const letterField = pg.locator('[data-qa="vacancy-response-popup-form-letter-input"], textarea[name="text"]').first();
            const letterVisible = await letterField.isVisible({ timeout: 2000 }).catch(() => false);
            if (letterVisible && coverLetter) {
                await letterField.fill(coverLetter);
                await randomDelay(500, 1000);
            }

            const submitSelectors = [
                '[data-qa="vacancy-response-submit-popup"]',
                '[data-qa="submit-response-button"]',
                '[data-qa="vacancy-response-letter-submit"]'
            ];
            for (const sel of submitSelectors) {
                const btn = pg.locator(sel).first();
                if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
                    await btn.click();
                    await randomDelay(1500, 2500);
                    return { ok: true };
                }
            }

            return { ok: false, reason: 'no_submit_button' };

        } finally {
            await pg.close().catch(() => {});
        }
    }
}

module.exports = { searchVacancies, applyToVacancy, AutoApply };
