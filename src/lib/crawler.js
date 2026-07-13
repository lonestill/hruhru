const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { BROWSER, HH, TIMEOUT, DATA_DIR } = require('./config');

chromium.use(stealth);

const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'hh_global_elements_map.json');
const STATE_FILE = path.join(DATA_DIR, 'crawl_state.json');

const MAX_PAGES_PER_RUN = 25;
const MIN_VACANCIES = 3;
const MAX_QUEUE_SIZE = 200;

const SEED_PAGES = [
    { name: 'main_page', url: 'https://hh.ru/' },
    { name: 'search_page', url: `${HH.search}?text=Программист` },
    { name: 'resumes_list', url: HH.resumes },
    { name: 'negotiations_active', url: HH.negotiations },
    { name: 'favorites', url: 'https://hh.ru/applicant/favorite' }
];

const ALLOWED_PATH_PREFIXES = [
    '/search/vacancy', '/vacancy/', '/employer/', '/applicant/',
    '/resume/', '/article/', '/metro/', '/salary/', '/vacancies/',
    '/profession/', '/career/', '/internship'
];

const SKIP_PATH_PATTERNS = [
    '/account/login', '/account/logout', '/oauth/', '/auth/',
    '/applicant/registration', '/employer/registration', '/article/registration',
    '/legal/', '/oferta', '/price', '/pay', '/billing', '/support/',
    '/feedback', '/promo/', '/apps/', '/mobile', '/set_user_type',
    '/captcha', '/blocked', '/error'
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1) + min));

function normalizeUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://hh.ru${url.startsWith('/') ? url : '/' + url}`);
        if (!parsed.hostname.endsWith('hh.ru')) return null;
        parsed.hash = '';
        parsed.search = parsed.search
            .replace(/[?&](utm_[^&]+|from=[^&]+|hhtmFrom=[^&]+|hhtmFromLabel=[^&]+)/g, '')
            .replace(/^&/, '?')
            .replace(/\?$/, '');
        return parsed.origin + parsed.pathname + (parsed.search || '');
    } catch { return null; }
}

function loadJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
    catch { return fallback; }
}

function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function getPageName(url) {
    const p = new URL(url).pathname;
    if (p === '/' || p === '') return 'main_page';
    if (p.startsWith('/search/vacancy')) return 'search_page';
    if (p.startsWith('/applicant/resumes')) return 'resumes_list';
    if (p.startsWith('/applicant/negotiations')) return 'negotiations_active';
    if (p.startsWith('/applicant/favorite')) return 'favorites';
    if (p.startsWith('/applicant/settings')) return 'applicant_settings';
    const vm = p.match(/^\/vacancy\/(\d+)/);
    if (vm) return `vacancy_page_${vm[1]}`;
    const em = p.match(/^\/employer\/(\d+)/);
    if (em) return `employer_page_${em[1]}`;
    const rm = p.match(/^\/resume\/([a-f0-9]+)/i);
    if (rm) return `resume_page_${rm[1]}`;
    return p.replace(/^\/|\/$/g, '').replace(/[\/\?&=]/g, '_').slice(0, 60) || 'unknown_page';
}

function isAllowedUrl(url) {
    const p = new URL(url).pathname;
    if (SKIP_PATH_PATTERNS.some(s => p.includes(s))) return false;
    if (p.match(/\.(pdf|png|jpg|jpeg|gif|svg|zip|doc|docx)$/i)) return false;
    return ALLOWED_PATH_PREFIXES.some(prefix => p.startsWith(prefix)) || p === '/';
}

function ensureUniqueName(name, usedNames) {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    let i = 2;
    while (usedNames.has(`${name}_${i}`)) i++;
    const u = `${name}_${i}`;
    usedNames.add(u);
    return u;
}

class Crawler extends EventEmitter {
    constructor() {
        super();
        this._stopped = false;
        this._browser = null;
    }

    log(msg) { this.emit('log', msg); }

    stop() {
        this._stopped = true;
        if (this._browser) this._browser.close().catch(() => {});
    }

    async run() {
        if (!fs.existsSync(AUTH_FILE)) {
            this.emit('done', false, 'auth.json не найден — сначала авторизуйтесь');
            return;
        }

        const elementsMap = loadJson(OUTPUT_FILE, {});
        const state = loadJson(STATE_FILE, { visited: {}, queue: [], vacancyIds: [] });
        if (!state.visited) state.visited = {};
        if (!state.queue) state.queue = [];
        if (!state.vacancyIds) state.vacancyIds = [];

        const visited = new Set(Object.keys(state.visited));
        const usedNames = new Set(Object.values(elementsMap).map(p => p?.name).filter(Boolean));

        if (state.queue.length === 0) {
            for (const seed of SEED_PAGES) {
                const url = normalizeUrl(seed.url);
                if (url && !visited.has(url)) state.queue.push(url);
            }
        }

        this.log(`📂 Уже обработано: ${visited.size} страниц`);
        this.log(`📋 В очереди: ${state.queue.length} ссылок`);
        this.log(`💼 Вакансий в базе: ${state.vacancyIds.length}`);

        const emitProgress = () => {
            this.emit('progress', {
                visited: visited.size,
                queue: state.queue.length,
                vacancies: state.vacancyIds.length,
                processed: pagesProcessed,
                skipped: pagesSkipped
            });
        };

        let pagesProcessed = 0;
        let pagesSkipped = 0;

        let browser, page;
        try {
            browser = await chromium.launch({ headless: true });
            this._browser = browser;
            const context = await browser.newContext({
                userAgent: BROWSER.userAgent,
                viewport: BROWSER.viewport,
                storageState: AUTH_FILE
            });
            page = await context.newPage();

            const extractElements = () => page.evaluate(() => {
                const elements = [];
                const seen = new Set();
                document.querySelectorAll('[data-qa]').forEach(node => {
                    const qa = node.getAttribute('data-qa');
                    if (!qa || qa.length > 100 || seen.has(qa)) return;
                    seen.add(qa);
                    let text = node.innerText ? node.innerText.split('\n')[0].trim() : '';
                    if (text.length > 60) text = text.substring(0, 60) + '...';
                    elements.push({ dataQA: qa, tag: node.tagName.toLowerCase(), textSnippet: text || '[Без текста / Иконка / Блок]' });
                });
                return elements.sort((a, b) => a.dataQA.localeCompare(b.dataQA));
            });

            const discoverLinks = () => page.evaluate(() => {
                const links = new Set();
                document.querySelectorAll('a[href]').forEach(a => {
                    const href = a.getAttribute('href');
                    if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:'))
                        links.add(href);
                });
                return [...links];
            });

            const collectVacancyLinks = () => page.evaluate(() => {
                const selectors = ['[data-qa="serp-item__title"]', '[data-qa="vacancy-serp__vacancy-title"]', 'a[data-qa*="vacancy-title"]'];
                const urls = []; const seen = new Set();
                for (const sel of selectors) {
                    document.querySelectorAll(sel).forEach(el => {
                        const a = el.tagName.toLowerCase() === 'a' ? el : el.closest('a');
                        const href = a?.getAttribute('href');
                        if (!href || seen.has(href)) return;
                        seen.add(href); urls.push(href);
                    });
                }
                return urls;
            });

            const saveProgress = () => {
                saveJson(OUTPUT_FILE, elementsMap);
                saveJson(STATE_FILE, state);
            };

            const scanPage = async (url) => {
                const normalized = normalizeUrl(url);
                if (!normalized || visited.has(normalized)) return false;
                const pageName = ensureUniqueName(getPageName(normalized), usedNames);

                this.log(`🌐 Сканируем: ${pageName}`);
                this.emit('page-scan', { name: pageName, url: normalized });

                await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.navigation });
                await randomDelay(2500, 4000);

                const elements = await extractElements();
                const vacancyId = normalized.match(/\/vacancy\/(\d+)/)?.[1];

                elementsMap[normalized] = {
                    name: pageName, url: normalized,
                    elements, scrapedAt: new Date().toISOString(),
                    elementCount: elements.length
                };

                visited.add(normalized);
                state.visited[normalized] = { name: pageName, scrapedAt: elementsMap[normalized].scrapedAt };

                if (vacancyId && !state.vacancyIds.includes(vacancyId))
                    state.vacancyIds.push(vacancyId);

                saveProgress();
                this.log(`✅ ${pageName}: ${elements.length} элементов (всего: ${visited.size})`);
                emitProgress();

                const rawLinks = await discoverLinks();
                let added = 0;
                for (const raw of rawLinks) {
                    const link = normalizeUrl(raw);
                    if (!link || visited.has(link) || !isAllowedUrl(link)) continue;
                    if (state.queue.includes(link)) continue;
                    if (state.queue.length >= MAX_QUEUE_SIZE) break;
                    state.queue.push(link);
                    added++;
                }
                if (added > 0) {
                    saveProgress();
                    this.log(`🔗 +${added} ссылок (очередь: ${state.queue.length})`);
                }
                return true;
            };

            // Ensure vacancies
            const missing = MIN_VACANCIES - state.vacancyIds.length;
            if (missing > 0) {
                this.log(`💼 Нужно ещё ${missing} вакансий — идём на поиск...`);
                await page.goto(`${HH.search}?text=Программист`, { waitUntil: 'domcontentloaded' });
                await randomDelay(2000, 3000);
                const vacancyLinks = (await collectVacancyLinks()).map(normalizeUrl).filter(Boolean);
                for (const url of vacancyLinks) {
                    if (state.vacancyIds.length >= MIN_VACANCIES) break;
                    const id = url.match(/\/vacancy\/(\d+)/)?.[1];
                    if (!id || state.vacancyIds.includes(id)) continue;
                    if (!state.queue.includes(url)) {
                        state.queue.unshift(url);
                        this.log(`   + вакансия в очередь: ${id}`);
                    }
                }
                saveJson(STATE_FILE, state);
            }

            emitProgress();

            while (state.queue.length > 0 && pagesProcessed < MAX_PAGES_PER_RUN && !this._stopped) {
                const url = state.queue.shift();
                const normalized = normalizeUrl(url);
                if (!normalized || visited.has(normalized)) { pagesSkipped++; continue; }
                if (!isAllowedUrl(normalized)) continue;
                const ok = await scanPage(normalized);
                if (ok) pagesProcessed++;
                saveJson(STATE_FILE, state);
            }

            const summary = `Обработано: ${pagesProcessed}, пропущено: ${pagesSkipped}, всего: ${visited.size}, вакансий: ${state.vacancyIds.length}`;
            this.log(this._stopped ? `⏹️ Остановлено. ${summary}` : `🎉 Сессия завершена. ${summary}`);
            if (state.queue.length > 0) this.log(`💡 Осталось в очереди: ${state.queue.length}. Запусти снова — продолжит с места.`);
            emitProgress();
            this.emit('done', true, summary);

        } catch (err) {
            if (!this._stopped) {
                this.log(`❌ Ошибка: ${err.message}`);
                this.emit('done', false, err.message);
            }
        } finally {
            if (browser) await browser.close().catch(() => {});
            this._browser = null;
        }
    }
}

module.exports = Crawler;
