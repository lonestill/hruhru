const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

chromium.use(stealth);

const AUTH_FILE = 'auth.json';
const OUTPUT_FILE = 'hh_global_elements_map.json';
const STATE_FILE = 'crawl_state.json';

const MAX_PAGES_PER_RUN = 25;
const MIN_VACANCIES = 3;
const MAX_QUEUE_SIZE = 200;

const SEED_PAGES = [
    { name: 'main_page', url: 'https://hh.ru/' },
    { name: 'search_page', url: 'https://hh.ru/search/vacancy?text=Программист' },
    { name: 'resumes_list', url: 'https://hh.ru/applicant/resumes' },
    { name: 'negotiations_active', url: 'https://hh.ru/applicant/negotiations' },
    { name: 'favorites', url: 'https://hh.ru/applicant/favorite' }
];

const ALLOWED_PATH_PREFIXES = [
    '/search/vacancy',
    '/vacancy/',
    '/employer/',
    '/applicant/',
    '/resume/',
    '/article/',
    '/metro/',
    '/salary/',
    '/vacancies/',
    '/profession/',
    '/career/',
    '/internship'
];

const SKIP_PATH_PATTERNS = [
    '/account/login',
    '/account/logout',
    '/oauth/',
    '/auth/',
    '/applicant/registration',
    '/employer/registration',
    '/article/registration',
    '/legal/',
    '/oferta',
    '/price',
    '/pay',
    '/billing',
    '/support/',
    '/feedback',
    '/promo/',
    '/apps/',
    '/mobile',
    '/set_user_type',
    '/captcha',
    '/blocked',
    '/error'
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
    } catch {
        return null;
    }
}

function loadJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return fallback;
    }
}

function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function getPageName(url) {
    const path = new URL(url).pathname;

    if (path === '/' || path === '') return 'main_page';
    if (path.startsWith('/search/vacancy')) return 'search_page';
    if (path.startsWith('/applicant/resumes')) return 'resumes_list';
    if (path.startsWith('/applicant/negotiations')) return 'negotiations_active';
    if (path.startsWith('/applicant/favorite')) return 'favorites';
    if (path.startsWith('/applicant/settings')) return 'applicant_settings';

    const vacancyMatch = path.match(/^\/vacancy\/(\d+)/);
    if (vacancyMatch) return `vacancy_page_${vacancyMatch[1]}`;

    const employerMatch = path.match(/^\/employer\/(\d+)/);
    if (employerMatch) return `employer_page_${employerMatch[1]}`;

    const resumeMatch = path.match(/^\/resume\/([a-f0-9]+)/i);
    if (resumeMatch) return `resume_page_${resumeMatch[1]}`;

    const slug = path.replace(/^\/|\/$/g, '').replace(/[\/\?&=]/g, '_').slice(0, 60);
    return slug || 'unknown_page';
}

function isAllowedUrl(url) {
    const path = new URL(url).pathname;
    if (SKIP_PATH_PATTERNS.some(p => path.includes(p))) return false;
    if (path.match(/\.(pdf|png|jpg|jpeg|gif|svg|zip|doc|docx)$/i)) return false;
    return ALLOWED_PATH_PREFIXES.some(prefix => path.startsWith(prefix)) || path === '/';
}

function ensureUniqueName(name, usedNames) {
    if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
    }
    let i = 2;
    while (usedNames.has(`${name}_${i}`)) i++;
    const unique = `${name}_${i}`;
    usedNames.add(unique);
    return unique;
}

async function run() {
    if (!fs.existsSync(AUTH_FILE)) {
        console.error('❌ Ошибка: Файл auth.json не найден. Сначала авторизуйся через init.js');
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

    console.log('🚀 Запуск краулера hh.ru');
    console.log(`📂 Уже обработано: ${visited.size} страниц`);
    console.log(`📋 В очереди: ${state.queue.length} ссылок`);
    console.log(`💼 Вакансий в базе: ${state.vacancyIds.length}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        storageState: AUTH_FILE
    });

    const page = await context.newPage();
    let pagesProcessed = 0;
    let pagesSkipped = 0;

    async function extractElementsFromCurrentPage() {
        return await page.evaluate(() => {
            const elements = [];
            const seen = new Set();

            document.querySelectorAll('[data-qa]').forEach(node => {
                const qa = node.getAttribute('data-qa');
                if (!qa || qa.length > 100 || seen.has(qa)) return;
                seen.add(qa);

                let text = node.innerText ? node.innerText.split('\n')[0].trim() : '';
                if (text.length > 60) text = text.substring(0, 60) + '...';

                elements.push({
                    dataQA: qa,
                    tag: node.tagName.toLowerCase(),
                    textSnippet: text || '[Без текста / Иконка / Блок]'
                });
            });

            return elements.sort((a, b) => a.dataQA.localeCompare(b.dataQA));
        });
    }

    async function discoverLinks() {
        return await page.evaluate(() => {
            const links = new Set();
            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.getAttribute('href');
                if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                    links.add(href);
                }
            });
            return [...links];
        });
    }

    async function collectVacancyLinks() {
        return await page.evaluate(() => {
            const selectors = [
                '[data-qa="serp-item__title"]',
                '[data-qa="vacancy-serp__vacancy-title"]',
                'a[data-qa*="vacancy-title"]'
            ];
            const urls = [];
            const seen = new Set();

            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => {
                    const a = el.tagName.toLowerCase() === 'a' ? el : el.closest('a');
                    const href = a?.getAttribute('href');
                    if (!href || seen.has(href)) return;
                    seen.add(href);
                    urls.push(href);
                });
            }
            return urls;
        });
    }

    function saveProgress() {
        saveJson(OUTPUT_FILE, elementsMap);
        saveJson(STATE_FILE, state);
    }

    async function scanPage(url) {
        const normalized = normalizeUrl(url);
        if (!normalized || visited.has(normalized)) return false;

        const pageName = ensureUniqueName(getPageName(normalized), usedNames);

        console.log(`\n🌐 Сканируем: ${pageName}`);
        console.log(`   ${normalized}`);

        await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(2500, 4000);

        const elements = await extractElementsFromCurrentPage();
        const vacancyId = normalized.match(/\/vacancy\/(\d+)/)?.[1];

        elementsMap[normalized] = {
            name: pageName,
            url: normalized,
            elements,
            scrapedAt: new Date().toISOString(),
            elementCount: elements.length
        };

        visited.add(normalized);
        state.visited[normalized] = {
            name: pageName,
            scrapedAt: elementsMap[normalized].scrapedAt
        };

        if (vacancyId && !state.vacancyIds.includes(vacancyId)) {
            state.vacancyIds.push(vacancyId);
        }

        saveProgress();
        console.log(`✅ Сохранено ${elements.length} элементов (всего страниц: ${visited.size})`);

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
            console.log(`🔗 Найдено новых ссылок: +${added} (очередь: ${state.queue.length})`);
        }

        return true;
    }

    async function ensureVacancies() {
        const missing = MIN_VACANCIES - state.vacancyIds.length;
        if (missing <= 0) return;

        console.log(`\n💼 Нужно ещё ${missing} вакансий — идём на поиск...`);
        await page.goto('https://hh.ru/search/vacancy?text=Программист', { waitUntil: 'domcontentloaded' });
        await randomDelay(2000, 3000);

        const vacancyLinks = (await collectVacancyLinks())
            .map(normalizeUrl)
            .filter(Boolean);

        for (const url of vacancyLinks) {
            if (state.vacancyIds.length >= MIN_VACANCIES) break;
            const id = url.match(/\/vacancy\/(\d+)/)?.[1];
            if (!id || state.vacancyIds.includes(id)) continue;
            if (!state.queue.includes(url)) {
                state.queue.unshift(url);
                console.log(`   + вакансия в очередь: ${id}`);
            }
        }

        saveProgress();
    }

    try {
        await ensureVacancies();

        while (state.queue.length > 0 && pagesProcessed < MAX_PAGES_PER_RUN) {
            const url = state.queue.shift();
            const normalized = normalizeUrl(url);

            if (!normalized || visited.has(normalized)) {
                pagesSkipped++;
                continue;
            }

            if (!isAllowedUrl(normalized)) continue;

            const ok = await scanPage(normalized);
            if (ok) pagesProcessed++;

            saveProgress();
        }

        console.log('\n======================================================');
        console.log('🎉 Сессия краулера завершена');
        console.log(`   Обработано за запуск: ${pagesProcessed}`);
        console.log(`   Пропущено (уже есть): ${pagesSkipped}`);
        console.log(`   Всего в базе: ${visited.size} страниц, ${state.vacancyIds.length} вакансий`);
        console.log(`   Осталось в очереди: ${state.queue.length}`);
        console.log(`📂 Данные: ${OUTPUT_FILE}`);
        console.log(`📂 Состояние: ${STATE_FILE}`);
        console.log('======================================================\n');

        if (state.queue.length > 0) {
            console.log('💡 Запусти скрипт ещё раз — он продолжит с очереди и не перепарсит готовое.\n');
        }

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        saveProgress();
        await page.screenshot({ path: 'debug_global_extractor_error.png' }).catch(() => {});
        console.log('💾 Прогресс сохранён — можно перезапустить скрипт.');
    } finally {
        await browser.close();
    }
}

run();
