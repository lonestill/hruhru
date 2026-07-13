'use strict';

// ===================== TABS =====================
const navItems = document.querySelectorAll('.nav-item');
const tabs = document.querySelectorAll('.tab');

navItems.forEach(btn => {
    btn.addEventListener('click', () => {
        const t = btn.dataset.tab;
        navItems.forEach(n => n.classList.remove('active'));
        tabs.forEach(tab => tab.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${t}`).classList.add('active');
        if (t === 'negotiations' && !_negoLoaded) loadNegotiations();
        if (t === 'settings') loadSettings();
    });
});

// ===================== UTILS =====================
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

const _logQueues = new Map();
const _logFlushScheduled = new Set();
const LOG_MAX_LINES = 500;

function appendLog(id, msg) {
    if (!_logQueues.has(id)) _logQueues.set(id, []);
    _logQueues.get(id).push(msg);
    if (_logFlushScheduled.has(id)) return;
    _logFlushScheduled.add(id);
    requestAnimationFrame(() => {
        _logFlushScheduled.delete(id);
        const el = document.getElementById(id);
        const queue = _logQueues.get(id) || [];
        _logQueues.set(id, []);
        if (!el || !queue.length) return;
        const frag = document.createDocumentFragment();
        for (const m of queue) {
            const line = document.createElement('span');
            line.className = 'log-line';
            if (/✅|💾|🎉|успешн|Готово/.test(m))        line.classList.add('ok');
            else if (/❌|Ошибка|ошибка/.test(m))           line.classList.add('err');
            else if (/⚠️|Пропускаем|пропущ/.test(m))      line.classList.add('warn');
            else if (/🚀|🌐|📄|📤|🔍|⚡/.test(m))         line.classList.add('info');
            line.textContent = m;
            frag.appendChild(line);
        }
        el.appendChild(frag);
        while (el.children.length > LOG_MAX_LINES) el.removeChild(el.firstChild);
        el.scrollTop = el.scrollHeight;
    });
}

// ===================== AUTH STATUS =====================
const authDot     = document.getElementById('authDot');
const authLabel   = document.getElementById('authStatusLabel');
const logoutBtn   = document.getElementById('logoutBtn');
const authGate    = document.getElementById('authGate');
const splash      = document.getElementById('splash');

// Hide both gate and main app until we know auth state — avoids the flash.
authGate.style.display = 'none';

function hideSplash() {
    splash.classList.add('hidden');
    // Remove from DOM after transition so it doesn't block clicks.
    setTimeout(() => splash.remove(), 350);
}

async function refreshAuthStatus() {
    const { authExists, profileName } = await window.api.authStatus();
    authDot.className   = 'status-dot ' + (authExists ? 'ok' : 'error');
    authLabel.textContent = authExists ? (profileName || 'Сессия активна') : 'Нет сессии';
    authLabel.title = authExists && profileName ? profileName : '';
    logoutBtn.style.display = authExists ? '' : 'none';
    authGate.style.display = authExists ? 'none' : 'flex';
    return authExists;
}

// Fetch profile from hh.ru (launches headless browser if no cache).
// Updates sidebar status, settings profile card. Returns profile object.
async function fetchAndShowProfile() {
    const profile = await window.api.authFetchProfile();
    if (!profile) return null;
    const name = profile.name || '';
    const sub  = profile.subtitle || '';
    const avatar = profile.avatarUrl || '';

    // Sidebar
    if (name) { authLabel.textContent = name; authLabel.title = name; }

    // Settings profile card
    const nameEl = document.getElementById('setProfileName');
    const subEl  = document.getElementById('setProfileSub');
    const avEl   = document.getElementById('setProfileAvatar');
    if (nameEl) nameEl.textContent = name || 'Сессия активна';
    if (subEl)  subEl.textContent  = sub;
    if (avEl && avatar) {
        avEl.innerHTML = `<img src="${esc(avatar)}" alt="">`;
    }

    return profile;
}

// On startup: check auth, then fade out splash to reveal the right screen.
(async () => {
    const authRes = await window.api.authStatus();
    const authExists = authRes.authExists;

    // Sidebar
    authDot.className   = 'status-dot ' + (authExists ? 'ok' : 'error');
    authLabel.textContent = authExists ? (authRes.profileName || 'Сессия активна') : 'Нет сессии';
    authLabel.title = authExists && authRes.profileName ? authRes.profileName : '';
    logoutBtn.style.display = authExists ? '' : 'none';
    authGate.style.display = authExists ? 'none' : 'flex';

    // If cached profile has subtitle/avatar, populate settings card immediately
    if (authExists && authRes.profile) {
        const p = authRes.profile;
        const nameEl = document.getElementById('setProfileName');
        const subEl  = document.getElementById('setProfileSub');
        const avEl   = document.getElementById('setProfileAvatar');
        if (nameEl && p.name) nameEl.textContent = p.name;
        if (subEl && p.subtitle) subEl.textContent = p.subtitle;
        if (avEl && p.avatarUrl) avEl.innerHTML = `<img src="${esc(p.avatarUrl)}" alt="">`;
    }

    await new Promise(r => setTimeout(r, 600));
    hideSplash();

    if (authExists) {
        loadSettings();
        if (!authRes.profileName) fetchAndShowProfile();
    }

    // Auto-check for updates in background
    checkForUpdates(true);
})();

// ---- Update banner ----
const updateBanner      = document.getElementById('updateBanner');
const updateBannerVer   = document.getElementById('updateBannerVersion');
const updateBannerLink  = document.getElementById('updateBannerLink');
const updateBannerClose = document.getElementById('updateBannerClose');

let _updateUrl = '';

async function checkForUpdates(silent = false) {
    const res = await window.api.appCheckUpdates();
    if (!res.ok) {
        if (!silent && setUpdateStatus) setUpdateStatus.textContent = `Ошибка: ${res.error}`;
        return;
    }
    if (!silent && setUpdateStatus) {
        setUpdateStatus.textContent = `Актуальная версия: ${res.latest || res.current}`;
    }
    if (res.hasUpdate) {
        _updateUrl = res.url;
        updateBannerVer.textContent = res.latest;
        updateBannerLink.href = res.url;
        updateBanner.style.display = '';
    }
}

updateBannerLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (_updateUrl) window.api.openUrl(_updateUrl);
});

updateBannerClose.addEventListener('click', () => {
    updateBanner.style.display = 'none';
});

logoutBtn.addEventListener('click', async () => {
    if (!confirm('Выйти из аккаунта hh.ru? Сохранённая сессия будет удалена.')) return;
    await window.api.authLogout();
    await refreshAuthStatus();
    loginInput.value = '';
    if (passwordInput) passwordInput.value = '';
});

// ===================== AUTH GATE =====================
const authStartBtn  = document.getElementById('authStartBtn');
const authCancelBtn = document.getElementById('authCancelBtn');
const loginInput    = document.getElementById('loginInput');
const passwordInput = document.getElementById('passwordInput');
const togglePass    = document.getElementById('togglePass');
const otpModal      = document.getElementById('otpModal');
const otpInput      = document.getElementById('otpInput');
const otpSubmitBtn  = document.getElementById('otpSubmitBtn');
const authLogCard   = document.getElementById('authLogCard');
const clearAuthLog  = document.getElementById('clearAuthLog');

let authRunning = false;

if (togglePass && passwordInput) {
    togglePass.addEventListener('click', () => {
        const isPw = passwordInput.type === 'password';
        passwordInput.type = isPw ? 'text' : 'password';
        togglePass.innerHTML = isPw
            ? '<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-eye-off"/></svg>'
            : '<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-eye"/></svg>';
    });
}

clearAuthLog.addEventListener('click', () => { document.getElementById('authLog').innerHTML = ''; });

authStartBtn.addEventListener('click', async () => {
    if (authRunning) return;
    const login    = loginInput.value.trim();
    const password = passwordInput ? passwordInput.value.trim() : '';
    if (!login) {
        authLogCard.style.display = '';
        appendLog('authLog', '❌ Введите логин (телефон или email)');
        return;
    }
    const isEmail = login.includes('@');
    if (isEmail && !password) {
        authLogCard.style.display = '';
        appendLog('authLog', '❌ Для входа по email введите пароль');
        return;
    }
    authRunning = true;
    authStartBtn.disabled    = true;
    authCancelBtn.style.display = '';
    authLogCard.style.display   = '';
    const r = await window.api.authStart({ login, password });
    if (!r.ok) { appendLog('authLog', `❌ ${r.error}`); resetAuth(); }
});

authCancelBtn.addEventListener('click', async () => {
    await window.api.authCancel();
    appendLog('authLog', '⏹ Отменено');
    resetAuth();
});

function resetAuth() {
    authRunning = false;
    authStartBtn.disabled = false;
    authCancelBtn.style.display = 'none';
    otpModal.style.display = 'none';
}

window.api.onAuthLog(m => { authLogCard.style.display = ''; appendLog('authLog', m); });
window.api.onAuthOtpRequired(() => {
    otpModal.style.display = 'flex';
    otpInput.value = '';
    setTimeout(() => otpInput.focus(), 50);
});
window.api.onAuthDone(({ success, message }) => {
    appendLog('authLog', success ? `✅ ${message}` : `❌ ${message}`);
    resetAuth();
    refreshAuthStatus().then(authExists => {
        if (authExists) fetchAndShowProfile();
    });
});

otpSubmitBtn.addEventListener('click', sendOtp);
otpInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendOtp(); });

function sendOtp() {
    const code = otpInput.value.trim();
    if (!code) return;
    otpModal.style.display = 'none';
    window.api.authOtp(code);
}

// ===================== SEARCH TAB =====================
const searchBtn       = document.getElementById('searchBtn');
const searchMeta      = document.getElementById('searchMeta');
const searchTotal     = document.getElementById('searchTotal');
const searchFiltered  = document.getElementById('searchFiltered');
const searchPageEl    = document.getElementById('searchPage');
const searchPrev      = document.getElementById('searchPrev');
const searchNext      = document.getElementById('searchNext');
const searchResults   = document.getElementById('searchResults');
const searchEmpty     = document.getElementById('searchEmpty');
const searchAdvToggle = document.getElementById('searchAdvToggle');
const searchAdvanced  = document.getElementById('searchAdvanced');
const searchSort      = document.getElementById('searchSort');
const saveSearchBtn   = document.getElementById('saveSearchBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const savedSearchesEl = document.getElementById('savedSearches');

let _allCards = [];
let _searchState = { page: 1, totalPages: 1, serverParams: {}, clientFilters: {} };
let _sortMode = 'default';
let _searchRenderRaf = false;

// --- helpers ---
function getChecked(selector) {
    return Array.from(document.querySelectorAll(selector + ':checked')).map(el => el.value);
}

function parseSalaryNum(salaryStr) {
    if (!salaryStr) return null;
    const m = salaryStr.replace(/\s/g, '').match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
}

function parseReviewsNum(reviewsStr) {
    if (!reviewsStr) return 0;
    const m = reviewsStr.replace(/\s/g, '').match(/(\d+)/);
    return m ? parseInt(m[1]) : 0;
}

function collectServerParams() {
    const area = document.getElementById('s-area').value.trim();
    return {
        text: document.getElementById('s-text').value.trim(),
        area: area ? area.split(',').map(s => s.trim()).filter(Boolean) : [],
        salary: document.getElementById('s-salary').value.trim(),
        experience: document.getElementById('s-experience').value,
        onlyWithSalary: document.getElementById('s-salary-only').checked,
        pages: parseInt(document.getElementById('s-pages').value) || 3,
        searchField: getChecked('.sf-field'),
        workFormat: getChecked('.sf-wformat'),
        employmentForm: getChecked('.sf-empform'),
        workScheduleByDays: getChecked('.sf-sched'),
        workingHours: getChecked('.sf-hours'),
        education: document.getElementById('s-education').value,
        label: getChecked('.sf-label'),
        inclusivenessTypes: getChecked('.sf-incl'),
        salaryMode: document.getElementById('s-salary-mode').value,
        currencyCode: document.getElementById('s-currency').value,
        acceptTemporary: document.getElementById('s-accept-temporary').checked,
        excludedText: document.getElementById('s-exclude').value.trim(),
        searchPeriod: document.getElementById('s-period').value,
        orderBy: document.getElementById('s-order').value,
    };
}

function collectClientFilters() {
    const excl = document.getElementById('s-exclude').value.trim();
    return {
        salaryMax: parseInt(document.getElementById('s-salary-max').value) || 0,
        excludeWords: excl ? excl.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [],
        minRating: parseFloat(document.getElementById('s-min-rating').value) || 0,
        minReviews: parseInt(document.getElementById('s-min-reviews').value) || 0,
        hideResponded: document.getElementById('s-hide-responded').checked,
    };
}

function applyClientFilters(cards, f) {
    let filtered = cards;
    if (f.hideResponded) filtered = filtered.filter(v => !v.responded);
    if (f.salaryMax) {
        filtered = filtered.filter(v => {
            const s = parseSalaryNum(v.salary);
            return s !== null && s <= f.salaryMax;
        });
    }
    if (f.minRating) {
        filtered = filtered.filter(v => parseFloat(v.rating) >= f.minRating);
    }
    if (f.minReviews) {
        filtered = filtered.filter(v => parseReviewsNum(v.reviews) >= f.minReviews);
    }
    if (f.excludeWords.length) {
        filtered = filtered.filter(v => {
            const title = (v.title || '').toLowerCase();
            const emp = (v.employer || '').toLowerCase();
            return !f.excludeWords.some(w => title.includes(w) || emp.includes(w));
        });
    }
    return filtered;
}

function sortCards(cards, mode) {
    if (mode === 'default') return cards;
    const arr = [...cards];
    if (mode === 'salary-desc') {
        arr.sort((a, b) => (parseSalaryNum(b.salary) || -1) - (parseSalaryNum(a.salary) || -1));
    } else if (mode === 'salary-asc') {
        arr.sort((a, b) => (parseSalaryNum(a.salary) ?? 1e15) - (parseSalaryNum(b.salary) ?? 1e15));
    } else if (mode === 'rating-desc') {
        arr.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
    } else if (mode === 'title') {
        arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
    } else if (mode === 'employer') {
        arr.sort((a, b) => (a.employer || '').localeCompare(b.employer || '', 'ru'));
    }
    return arr;
}

function highlightEsc(text, words) {
    if (!text) return '';
    const escaped = esc(text);
    if (!words || !words.length) return escaped;
    const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (!pattern) return escaped;
    return escaped.replace(new RegExp('(' + pattern + ')', 'gi'), '<mark>$1</mark>');
}

function getSearchHighlightWords() {
    const text = document.getElementById('s-text').value.trim();
    return text ? text.split(/\s+/).filter(w => w.length > 1) : [];
}

// --- render ---
function scheduleSearchRender() {
    if (_searchRenderRaf) return;
    _searchRenderRaf = true;
    requestAnimationFrame(renderVacancies);
}

function renderVacancies() {
    _searchRenderRaf = false;
    if (!_allCards.length) return;
    const filters = _searchState.clientFilters;
    const filtered = applyClientFilters(_allCards, filters);
    const sorted = sortCards(filtered, _sortMode);
    const hlWords = getSearchHighlightWords();

    searchResults.innerHTML = '';
    const frag = document.createDocumentFragment();
    sorted.forEach(v => frag.appendChild(buildVacancyCard(v, hlWords)));
    searchResults.appendChild(frag);

    const totalLoaded = _allCards.length;
    if (filtered.length !== totalLoaded) {
        searchFiltered.style.display = '';
        searchFiltered.textContent = `показано ${filtered.length} из ${totalLoaded}`;
    } else {
        searchFiltered.style.display = 'none';
    }

    if (!sorted.length) {
        searchEmpty.style.display = 'flex';
        searchEmpty.querySelector('div:last-child').textContent = 'Под фильтры ничего не подошло';
    } else {
        searchEmpty.style.display = 'none';
    }
}

function buildVacancyCard(v, hlWords) {
    const card = document.createElement('div');
    card.className = 'vacancy-card' + (v.responded ? ' responded' : '');

    const badges = [
        v.salary     && `<span class="badge badge-salary">${esc(v.salary)}</span>`,
        v.experience && `<span class="badge badge-exp">${esc(v.experience)}</span>`,
        v.metro      && `<span class="badge badge-metro">м ${esc(v.metro)}</span>`,
        v.address    && `<span class="badge badge-addr">📍 ${esc(v.address)}</span>`,
        v.rating     && `<span class="badge badge-rating">⭐ ${esc(v.rating)} ${v.reviews ? '· '+esc(v.reviews) : ''}</span>`,
    ].filter(Boolean).join('');

    const snippet = [
        v.responsibility && `<span>${esc(v.responsibility)}</span>`,
        v.requirement    && `<span style="color:var(--text3)"> · ${esc(v.requirement)}</span>`
    ].filter(Boolean).join('');

    const actionBtn = v.responded
        ? `<span class="vc-responded-badge"><svg class="icon icon-sm" aria-hidden="true"><use href="#icon-check"/></svg> Отклик отправлен</span>`
        : (v.canRespond
            ? `<button class="btn-apply" data-id="${esc(v.id)}" data-url="${esc(v.url)}"><svg class="icon icon-sm" aria-hidden="true"><use href="#icon-send"/></svg> Откликнуться</button>`
            : `<button class="btn-apply" disabled>Недоступно</button>`);

    card.innerHTML = `
      <div class="vc-header">
        <div class="vc-title-block">
          <a class="vc-title" href="#" data-url="${esc(v.url)}">${highlightEsc(v.title, hlWords)}</a>
          <div class="vc-employer">
            <a href="#" data-url="${esc(v.employerUrl)}">${highlightEsc(v.employer, hlWords)}</a>
          </div>
        </div>
      </div>
      ${badges ? `<div class="vc-badges">${badges}</div>` : ''}
      ${snippet ? `<div class="vc-snippet">${snippet}</div>` : ''}
      <div class="vc-actions">${actionBtn}</div>
    `;

    card.querySelectorAll('[data-url]').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            const url = el.dataset.url;
            if (url) window.api.openUrl(url);
        });
    });

    const applyBtn = card.querySelector('.btn-apply:not([disabled])');
    if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-send"/></svg> <span>Отправляем...</span>';
            const r = await window.api.vacanciesApply({ vacancyId: v.id, vacancyUrl: v.url });
            if (r.ok) {
                applyBtn.className = 'btn-apply done';
                applyBtn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-check"/></svg> <span>Отклик отправлен</span>';
            } else {
                applyBtn.disabled = false;
                if (r.reason === 'already_responded') {
                    applyBtn.className = 'btn-apply done';
                    applyBtn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-check"/></svg> <span>Уже откликались</span>';
                } else {
                    applyBtn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-x"/></svg> <span>Ошибка</span>';
                }
            }
        });
    }

    return card;
}

// --- search ---
searchBtn.addEventListener('click', () => doSearch(1));
searchPrev.addEventListener('click', () => doSearch(_searchState.page - 1));
searchNext.addEventListener('click', () => doSearch(_searchState.page + 1));

searchSort.addEventListener('change', () => {
    _sortMode = searchSort.value;
    scheduleSearchRender();
});

// Live re-filter when client-side filter inputs change
['s-salary-max', 's-exclude', 's-min-rating', 's-min-reviews', 's-hide-responded'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
        if (!_allCards.length) return;
        _searchState.clientFilters = collectClientFilters();
        scheduleSearchRender();
    });
    el.addEventListener('change', () => {
        if (!_allCards.length) return;
        _searchState.clientFilters = collectClientFilters();
        scheduleSearchRender();
    });
});

// Advanced toggle
searchAdvToggle.addEventListener('click', () => {
    const open = searchAdvanced.style.display !== 'none';
    searchAdvanced.style.display = open ? 'none' : 'flex';
    searchAdvToggle.classList.toggle('open', !open);
});

// Reset filters
resetFiltersBtn.addEventListener('click', () => {
    document.querySelectorAll('#searchAdvanced input[type="checkbox"]').forEach(el => {
        if (!el.classList.contains('sf-field') || el.value !== 'name') el.checked = false;
        else el.checked = true;
    });
    document.querySelectorAll('#searchAdvanced input[type="text"], #searchAdvanced input[type="number"]').forEach(el => el.value = '');
    document.querySelectorAll('#searchAdvanced select').forEach(el => {
        el.value = el.id === 's-currency' ? 'RUR' : el.querySelector('option')?.value || '';
    });
    _searchState.clientFilters = collectClientFilters();
    if (_allCards.length) scheduleSearchRender();
});

async function doSearch(page) {
    const serverParams = collectServerParams();
    const clientFilters = collectClientFilters();

    if (!serverParams.text && !serverParams.area.length) {
        alert('Введите запрос или выберите регион');
        return;
    }

    _searchState.serverParams = serverParams;
    _searchState.clientFilters = clientFilters;
    _allCards = [];

    searchBtn.disabled = true;
    searchBtn.classList.add('loading');
    searchResults.innerHTML = '';
    searchEmpty.style.display = 'none';
    searchMeta.style.display = 'none';

    const res = await window.api.vacanciesSearch({ ...serverParams, page });

    searchBtn.disabled = false;
    searchBtn.classList.remove('loading');

    if (!res.ok) {
        searchEmpty.style.display = 'flex';
        searchEmpty.querySelector('div:last-child').textContent = `Ошибка: ${res.error}`;
        searchMeta.style.display = 'none';
        return;
    }

    const { cards, total, totalPages, currentPage } = res.data;
    _allCards = cards;
    _searchState.page = currentPage;
    _searchState.totalPages = totalPages;

    searchMeta.style.display = 'flex';
    searchTotal.textContent = `Найдено: ${total}`;
    searchPageEl.textContent = `${currentPage} / ${totalPages}`;
    searchPrev.disabled = currentPage <= 1;
    searchNext.disabled = currentPage >= totalPages;

    if (!cards.length) {
        searchEmpty.style.display = 'flex';
        searchEmpty.querySelector('div:last-child').textContent = 'Вакансии не найдены';
        return;
    }

    renderVacancies();
}

// --- Saved searches (localStorage) ---
const SAVED_KEY = 'hh_saved_searches';

function loadSavedSearches() {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
    catch { return []; }
}

function saveSavedSearches(list) {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
}

function renderSavedSearches() {
    const list = loadSavedSearches();
    if (!list.length) { savedSearchesEl.style.display = 'none'; return; }
    savedSearchesEl.style.display = 'flex';
    savedSearchesEl.innerHTML = '';
    list.forEach((s, i) => {
        const chip = document.createElement('div');
        chip.className = 'saved-search-chip';
        chip.innerHTML = `<span>${esc(s.name)}</span><span class="chip-remove" data-idx="${i}">×</span>`;
        chip.addEventListener('click', e => {
            if (e.target.classList.contains('chip-remove')) {
                const idx = parseInt(e.target.dataset.idx);
                const updated = loadSavedSearches().filter((_, j) => j !== idx);
                saveSavedSearches(updated);
                renderSavedSearches();
                return;
            }
            restoreSavedSearch(s);
        });
        savedSearchesEl.appendChild(chip);
    });
}

function restoreSavedSearch(saved) {
    const p = saved.serverParams;
    document.getElementById('s-text').value = p.text || '';
    document.getElementById('s-area').value = (p.area || []).join(', ');
    document.getElementById('s-salary').value = p.salary || '';
    document.getElementById('s-experience').value = p.experience || '';
    document.getElementById('s-salary-only').checked = !!p.onlyWithSalary;
    document.getElementById('s-pages').value = p.pages || 3;
    document.getElementById('s-period').value = p.searchPeriod || '';
    document.getElementById('s-order').value = p.orderBy || 'relevance';
    document.getElementById('s-salary-mode').value = p.salaryMode || 'MONTH';
    document.getElementById('s-currency').value = p.currencyCode || 'RUR';
    document.getElementById('s-education').value = p.education || '';
    document.getElementById('s-accept-temporary').checked = !!p.acceptTemporary;
    document.getElementById('s-exclude').value = p.excludedText || '';

    const setChecked = (selector, values) => {
        document.querySelectorAll(selector).forEach(el => {
            el.checked = values.includes(el.value);
        });
    };
    setChecked('.sf-field', p.searchField || []);
    setChecked('.sf-wformat', p.workFormat || []);
    setChecked('.sf-empform', p.employmentForm || []);
    setChecked('.sf-sched', p.workScheduleByDays || []);
    setChecked('.sf-hours', p.workingHours || []);
    setChecked('.sf-label', p.label || []);
    setChecked('.sf-incl', p.inclusivenessTypes || []);

    const cf = saved.clientFilters;
    document.getElementById('s-salary-max').value = cf.salaryMax || '';
    document.getElementById('s-min-rating').value = cf.minRating || '';
    document.getElementById('s-min-reviews').value = cf.minReviews || '';
    document.getElementById('s-hide-responded').checked = !!cf.hideResponded;
    if (cf.excludeWords) document.getElementById('s-exclude').value = cf.excludeWords.join(', ');

    doSearch(1);
}

saveSearchBtn.addEventListener('click', () => {
    const serverParams = collectServerParams();
    const clientFilters = collectClientFilters();
    if (!serverParams.text && !serverParams.area.length) {
        alert('Заполните хотя бы запрос или регион перед сохранением');
        return;
    }
    const name = serverParams.text || (serverParams.area || [])[0] || 'Поиск';
    const list = loadSavedSearches();
    list.push({ name, serverParams, clientFilters, createdAt: Date.now() });
    saveSavedSearches(list);
    renderSavedSearches();
});

renderSavedSearches();

// ===================== AUTO-APPLY TAB =====================
const aaStartBtn = document.getElementById('aaStartBtn');
const aaStopBtn  = document.getElementById('aaStopBtn');
const aaLogCard  = document.getElementById('aaLogCard');
const aaStats    = document.getElementById('aaStats');
const clearAaLog = document.getElementById('clearAaLog');
const aaAddTemplate = document.getElementById('aaAddTemplate');
const aaTemplatesEl = document.getElementById('aaTemplates');
const aaScheduleStatus = document.getElementById('aaScheduleStatus');

let aaRunning = false;

// --- Cover letter templates ---
function getTemplates() {
    return Array.from(aaTemplatesEl.querySelectorAll('.aa-template textarea'))
        .map(t => t.value)
        .filter(v => v.trim());
}

function addTemplateRow(value = '') {
    const row = document.createElement('div');
    row.className = 'aa-template';
    const idx = aaTemplatesEl.children.length + 1;
    row.innerHTML = `
      <div class="aa-template-head">
        <span class="tpl-num">Шаблон ${idx}</span>
        <button class="btn-icon-mini" title="Удалить">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-trash"/></svg>
        </button>
      </div>
      <textarea placeholder="Добрый день! Меня заинтересовала вакансия {title} в компании {employer}..."></textarea>
    `;
    row.querySelector('textarea').value = value;
    row.querySelector('.btn-icon-mini').addEventListener('click', () => {
        row.remove();
        renumberTemplates();
    });
    aaTemplatesEl.appendChild(row);
}

function renumberTemplates() {
    aaTemplatesEl.querySelectorAll('.aa-template').forEach((row, i) => {
        row.querySelector('.tpl-num').textContent = `Шаблон ${i + 1}`;
    });
}

addTemplateRow('Добрый день! Меня заинтересовала вакансия «{title}» в компании {employer}. Буду рад обсудить детали.');
aaAddTemplate.addEventListener('click', () => addTemplateRow());

clearAaLog.addEventListener('click', () => { document.getElementById('aaLog').innerHTML = ''; });

function aaGetChecked(selector) {
    return Array.from(document.querySelectorAll(selector + ':checked')).map(el => el.value);
}

function collectAutoApplyConfig() {
    const kwRaw = document.getElementById('aa-keywords').value.trim();
    const exclRaw = document.getElementById('aa-exclude').value.trim();
    const wlRaw = document.getElementById('aa-whitelist').value.trim();
    const area = document.getElementById('aa-area').value.trim();

    return {
        searchParams: {
            text: document.getElementById('aa-text').value.trim(),
            area: area ? area.split(',').map(s => s.trim()).filter(Boolean) : [],
            experience: document.getElementById('aa-experience').value,
            searchPeriod: document.getElementById('aa-period').value,
            orderBy: document.getElementById('aa-order').value,
            workFormat: aaGetChecked('.aa-wformat'),
            employmentForm: aaGetChecked('.aa-empform'),
            education: document.getElementById('aa-education').value,
            label: aaGetChecked('.aa-label'),
        },
        filters: {
            minSalary: parseInt(document.getElementById('aa-min-salary').value) || 0,
            maxSalary: parseInt(document.getElementById('aa-max-salary').value) || 0,
            onlyWithSalary: document.getElementById('aa-only-salary').checked,
            minRating: parseFloat(document.getElementById('aa-min-rating').value) || 0,
            minReviews: parseInt(document.getElementById('aa-min-reviews').value) || 0,
            keywords: kwRaw ? kwRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
            keywordMode: document.getElementById('aa-keyword-mode').value,
            excludeWords: exclRaw ? exclRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [],
            whitelist: wlRaw ? wlRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
        },
        coverLetters: getTemplates(),
        maxApply: parseInt(document.getElementById('aa-max').value) || 20,
        maxPages: parseInt(document.getElementById('aa-max-pages').value) || 10,
        maxErrors: parseInt(document.getElementById('aa-max-errors').value) || 5,
        retryAttempts: parseInt(document.getElementById('aa-retry').value) || 1,
        dryRun: document.getElementById('aa-dry-run').checked,
        scheduleEnabled: document.getElementById('aa-schedule-enabled').checked,
        scheduleInterval: parseInt(document.getElementById('aa-schedule-interval').value) || 6,
    };
}

aaStartBtn.addEventListener('click', async () => {
    if (aaRunning) return;
    const config = collectAutoApplyConfig();
    if (!config.searchParams.text) { alert('Введите запрос для поиска'); return; }

    const r = await window.api.autoApplyStart(config);
    if (!r.ok) { alert(r.error); return; }

    aaRunning = true;
    aaStartBtn.style.display = 'none';
    aaStopBtn.style.display  = '';
    aaLogCard.style.display  = '';
    aaStats.style.display    = 'flex';
    if (config.scheduleEnabled) {
        aaScheduleStatus.style.display = '';
        aaScheduleStatus.textContent = `Расписание активно: каждые ${config.scheduleInterval}ч`;
    } else {
        aaScheduleStatus.style.display = 'none';
    }
});

aaStopBtn.addEventListener('click', async () => {
    await window.api.autoApplyStop();
    aaStopBtn.disabled = true;
});

window.api.onAutoApplyLog(m => appendLog('aaLog', m));

let _aaStats = null, _aaStatsRaf = false;
window.api.onAutoApplyProgress(({ applied, skipped, errors, page }) => {
    _aaStats = { applied, skipped, errors, page };
    if (_aaStatsRaf) return;
    _aaStatsRaf = true;
    requestAnimationFrame(() => {
        _aaStatsRaf = false;
        if (!_aaStats) return;
        document.getElementById('aa-applied').textContent = _aaStats.applied;
        document.getElementById('aa-skipped').textContent = _aaStats.skipped;
        document.getElementById('aa-errors').textContent  = _aaStats.errors;
        document.getElementById('aa-page').textContent     = _aaStats.page || 0;
    });
});
window.api.onAutoApplyDone(({ success, message }) => {
    appendLog('aaLog', success ? `✅ ${message}` : `❌ ${message}`);
    aaRunning = false;
    aaStartBtn.style.display = '';
    aaStopBtn.style.display  = 'none';
    aaStopBtn.disabled = false;
    aaScheduleStatus.style.display = 'none';
});

// ===================== NEGOTIATIONS TAB =====================
const negoRefreshBtn = document.getElementById('negoRefreshBtn');
const negoLoading    = document.getElementById('negoLoading');
const negoList       = document.getElementById('negoList');
const negoEmpty      = document.getElementById('negoEmpty');
const negoStats      = document.getElementById('negoStats');
const negoToolbar    = document.getElementById('negoToolbar');
const negoSearch     = document.getElementById('negoSearch');
const negoSort       = document.getElementById('negoSort');
const negoFilterBtns = document.querySelectorAll('.nego-filter-btn');

let _negoItems  = [];
let _negoLoaded = false;
let _negoCounts = { total: 0, invite: 0, reject: 0, viewed: 0, new: 0 };
let _negoFilter = 'all';
let _negoSearchText = '';
let _negoSortMode   = 'default';
let _negoStatsRaf = false;
let _negoListRaf  = false;

function flushNegoStats() {
    _negoStatsRaf = false;
    document.getElementById('ns-total').textContent   = _negoCounts.total;
    document.getElementById('ns-invite').textContent  = _negoCounts.invite;
    document.getElementById('ns-reject').textContent  = _negoCounts.reject;
    document.getElementById('ns-viewed').textContent  = _negoCounts.viewed;
    document.getElementById('ns-new').textContent     = _negoCounts.new;
    document.getElementById('fc-all').textContent     = _negoCounts.total;
    document.getElementById('fc-invite').textContent  = _negoCounts.invite;
    document.getElementById('fc-reject').textContent  = _negoCounts.reject;
    document.getElementById('fc-viewed').textContent  = _negoCounts.viewed;
    document.getElementById('fc-new').textContent     = _negoCounts.new;
}

function scheduleNegoStatsFlush() {
    if (_negoStatsRaf) return;
    _negoStatsRaf = true;
    requestAnimationFrame(flushNegoStats);
}

const STATUS_WEIGHT = { invite: 0, new: 1, viewed: 2, reject: 3 };

function getFilteredNego() {
    let list = _negoItems;
    if (_negoFilter !== 'all') {
        list = list.filter(n => getStatusClass(n.status) === _negoFilter);
    }
    if (_negoSearchText) {
        const q = _negoSearchText;
        list = list.filter(n =>
            (n.title && n.title.toLowerCase().includes(q)) ||
            (n.employer && n.employer.toLowerCase().includes(q))
        );
    }
    if (_negoSortMode === 'invite-first') {
        list = [...list].sort((a, b) => STATUS_WEIGHT[getStatusClass(a.status)] - STATUS_WEIGHT[getStatusClass(b.status)]);
    } else if (_negoSortMode === 'reject-last') {
        list = [...list].sort((a, b) => {
            const ar = getStatusClass(a.status) === 'reject';
            const br = getStatusClass(b.status) === 'reject';
            return (ar === br) ? 0 : ar ? 1 : -1;
        });
    } else if (_negoSortMode === 'title') {
        list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
    }
    return list;
}

function renderNegoList() {
    _negoListRaf = false;
    const filtered = getFilteredNego();
    const frag = document.createDocumentFragment();
    filtered.forEach(n => frag.appendChild(renderNegoCard(n)));
    negoList.innerHTML = '';
    negoList.appendChild(frag);
}

function scheduleNegoRender() {
    if (_negoListRaf) return;
    _negoListRaf = true;
    requestAnimationFrame(renderNegoList);
}

negoRefreshBtn.addEventListener('click', loadNegotiations);

negoFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        negoFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _negoFilter = btn.dataset.filter;
        scheduleNegoRender();
    });
});

negoSearch.addEventListener('input', () => {
    _negoSearchText = negoSearch.value.trim().toLowerCase();
    scheduleNegoRender();
});

negoSort.addEventListener('change', () => {
    _negoSortMode = negoSort.value;
    scheduleNegoRender();
});

// Registered once: main process pushes each scraped page's items as soon as
// it's ready, so cards appear progressively instead of after the whole
// (paginated, potentially 10+ request) scrape finishes.
window.api.onNegotiationsPage(items => {
    negoEmpty.style.display = 'none';
    negoStats.style.display = 'flex';
    negoToolbar.style.display = 'flex';
    items.forEach(n => {
        const cls = getStatusClass(n.status);
        _negoCounts.total++;
        _negoCounts[cls]++;
        _negoItems.push(n);
    });
    scheduleNegoStatsFlush();
    scheduleNegoRender();
});

function renderNegoCard(n) {
    const card = document.createElement('div');
    card.className = 'nego-card';

    const statusClass = getStatusClass(n.status);
    const statusLabel = n.status || 'Неизвестно';

    card.innerHTML = `
      <div class="nego-info">
        <div class="nego-title" ${n.url ? `data-url="${esc(n.url)}"` : ''}>${esc(n.title)}</div>
        ${n.employer ? `<div class="nego-employer">${esc(n.employer)}</div>` : ''}
      </div>
      ${n.date ? `<div class="nego-date">${esc(n.date)}</div>` : ''}
      <div class="nego-status ${statusClass}">${esc(statusLabel)}</div>
    `;

    if (n.url) {
        card.querySelector('.nego-title').style.cursor = 'pointer';
        card.querySelector('.nego-title').addEventListener('click', () => window.api.openUrl(n.url));
    }

    return card;
}

async function loadNegotiations() {
    negoLoading.style.display = 'flex';
    negoList.innerHTML = '';
    negoEmpty.style.display = 'none';
    negoStats.style.display = 'none';
    negoToolbar.style.display = 'none';
    _negoItems = [];
    _negoCounts = { total: 0, invite: 0, reject: 0, viewed: 0, new: 0 };
    _negoFilter = 'all';
    _negoSearchText = '';
    _negoSortMode = 'default';
    negoSearch.value = '';
    negoSort.value = 'default';
    negoFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
    flushNegoStats();

    const res = await window.api.negotiationsLoad();
    negoLoading.style.display = 'none';

    // Cards were already appended live via onNegotiationsPage above, so
    // res.data here is only used to detect an empty/errored result.
    if (!res.ok) {
        negoEmpty.style.display = 'flex';
        negoStats.style.display = 'none';
        negoToolbar.style.display = 'none';
        negoEmpty.querySelector('div:last-child').textContent = `Ошибка: ${res.error}`;
        return;
    }
    if (!_negoItems.length) {
        negoEmpty.style.display = 'flex';
        negoStats.style.display = 'none';
        negoToolbar.style.display = 'none';
    }
    _negoLoaded = true;
}

function getStatusClass(status) {
    if (!status) return 'viewed';
    const s = status.toLowerCase();
    if (s.includes('приглаш') || s.includes('интервью')) return 'invite';
    if (s.includes('отказ'))                              return 'reject';
    if (s.includes('просмотр') || s.includes('прочитан')) return 'viewed';
    return 'new';
}

// ===================== SETTINGS TAB =====================
const loadResumesBtn  = document.getElementById('loadResumesBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsSaved   = document.getElementById('settingsSaved');
const setAddTemplate  = document.getElementById('setAddTemplate');
const setTemplatesEl  = document.getElementById('setTemplates');
const setLogoutBtn    = document.getElementById('setLogoutBtn');
const setAutoLaunch   = document.getElementById('setAutoLaunch');
const setTray         = document.getElementById('setTray');
const setCheckUpdates = document.getElementById('setCheckUpdates');
const setUpdateStatus = document.getElementById('setUpdateStatus');
const setClearCache   = document.getElementById('setClearCache');
const setDataPath     = document.getElementById('setDataPath');
const setOpenDataPath = document.getElementById('setOpenDataPath');
const setVersion      = document.getElementById('setVersion');
const setGithubLink   = document.getElementById('setGithubLink');

let selectedResumeIndex = 0;
let resumesData = [];

// --- Templates ---
function getSettingsTemplates() {
    return Array.from(setTemplatesEl.querySelectorAll('.aa-template textarea'))
        .map(t => t.value)
        .filter(v => v.trim());
}

function addSettingsTemplateRow(value = '') {
    const row = document.createElement('div');
    row.className = 'aa-template';
    const idx = setTemplatesEl.children.length + 1;
    row.innerHTML = `
      <div class="aa-template-head">
        <span class="tpl-num">Шаблон ${idx}</span>
        <button class="btn-icon-mini" title="Удалить">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#icon-trash"/></svg>
        </button>
      </div>
      <textarea placeholder="Добрый день! Меня заинтересовала вакансия {title} в {employer}..."></textarea>
    `;
    row.querySelector('textarea').value = value;
    row.querySelector('.btn-icon-mini').addEventListener('click', () => {
        row.remove();
        setTemplatesEl.querySelectorAll('.aa-template').forEach((r, i) => {
            r.querySelector('.tpl-num').textContent = `Шаблон ${i + 1}`;
        });
    });
    setTemplatesEl.appendChild(row);
}

setAddTemplate.addEventListener('click', () => addSettingsTemplateRow());

// --- Resumes ---
loadResumesBtn.addEventListener('click', async () => {
    loadResumesBtn.disabled = true;
    loadResumesBtn.classList.add('loading');
    const res = await window.api.resumesLoad();
    loadResumesBtn.disabled = false;
    loadResumesBtn.classList.remove('loading');
    if (!res.ok) { alert(`Ошибка: ${res.error}`); return; }
    resumesData = res.data || [];
    renderResumes();
});

function renderResumes() {
    const el = document.getElementById('resumesList');
    if (!resumesData.length) {
        el.innerHTML = '<div class="text-muted">Резюме не найдены</div>';
        return;
    }
    el.innerHTML = '';
    resumesData.forEach((r, i) => {
        const item = document.createElement('div');
        item.className = 'resume-item' + (i === selectedResumeIndex ? ' selected' : '');
        item.innerHTML = `
          <input type="radio" class="resume-radio" name="resume" ${i === selectedResumeIndex ? 'checked' : ''}>
          <span>${esc(r.title)}</span>
        `;
        item.addEventListener('click', () => {
            selectedResumeIndex = i;
            renderResumes();
        });
        el.appendChild(item);
    });
}

// --- Auth status in settings ---
async function refreshSettingsAuth() {
    const { authExists, profileName } = await window.api.authStatus();
    setLogoutBtn.style.display = authExists ? '' : 'none';
    const nameEl = document.getElementById('setProfileName');
    const subEl  = document.getElementById('setProfileSub');
    if (!authExists) {
        if (nameEl) nameEl.textContent = 'Нет сессии';
        if (subEl)  subEl.textContent  = 'Войдите в аккаунт hh.ru';
    } else if (profileName) {
        if (nameEl) nameEl.textContent = profileName;
    } else {
        if (nameEl) nameEl.textContent = 'Сессия активна';
        if (subEl)  subEl.textContent  = 'Загружаем профиль…';
        fetchAndShowProfile();
    }
}

setLogoutBtn.addEventListener('click', async () => {
    if (!confirm('Выйти из аккаунта hh.ru? Сохранённая сессия будет удалена.')) return;
    await window.api.authLogout();
    await refreshSettingsAuth();
});

// --- App info ---
async function loadAppInfo() {
    const version = await window.api.appVersion();
    setVersion.textContent = version || 'dev';
    const dp = await window.api.appDataPath();
    setDataPath.textContent = dp;
    setGithubLink.href = 'https://github.com/lonestill/hruhru/releases';
    const autoLaunch = await window.api.appGetAutoLaunch();
    setAutoLaunch.checked = autoLaunch;
}

setOpenDataPath.addEventListener('click', () => window.api.appOpenDataPath());

setClearCache.addEventListener('click', async () => {
    if (!confirm('Очистить кэш профиля? Имя будет пересобрано при следующем запуске.')) return;
    await window.api.appClearCache();
    setClearCache.querySelector('.btn-text').textContent = 'Очищено';
    setTimeout(() => setClearCache.querySelector('.btn-text').textContent = 'Очистить', 2000);
});

setCheckUpdates.addEventListener('click', async () => {
    setCheckUpdates.disabled = true;
    setCheckUpdates.classList.add('loading');
    setUpdateStatus.textContent = 'Проверяем…';
    const res = await window.api.appCheckUpdates();
    setCheckUpdates.disabled = false;
    setCheckUpdates.classList.remove('loading');
    if (!res.ok) {
        setUpdateStatus.textContent = `Ошибка: ${res.error}`;
        return;
    }
    if (res.hasUpdate) {
        setUpdateStatus.innerHTML = `Доступна новая версия <a href="#" style="color:var(--accent2)" id="updateLink">${res.latest}</a>`;
        document.getElementById('updateLink').addEventListener('click', (e) => {
            e.preventDefault();
            window.api.openUrl(res.url);
        });
    } else {
        setUpdateStatus.textContent = `Актуальная версия: ${res.latest || res.current}`;
    }
});

// --- Load/save ---
async function loadSettings() {
    const res = await window.api.settingsLoad();
    if (!res.ok) return;
    const s = res.data || {};
    if (s.resumeIndex !== undefined) selectedResumeIndex = s.resumeIndex;
    if (s.delayMin) document.getElementById('cfg-delay-min').value = s.delayMin;
    if (s.delayMax) document.getElementById('cfg-delay-max').value = s.delayMax;
    if (s.blacklist) document.getElementById('cfg-blacklist').value = (s.blacklist || []).join('\n');
    if (s.whitelist) document.getElementById('cfg-whitelist').value = (s.whitelist || []).join('\n');
    setTray.checked = !!s.closeToTray;
    setAutoLaunch.checked = !!s.autoLaunch;
    // Templates
    setTemplatesEl.innerHTML = '';
    const tpls = s.coverLetters || [];
    if (tpls.length) tpls.forEach(t => addSettingsTemplateRow(t));
    else addSettingsTemplateRow('Добрый день! Меня заинтересовала вакансия «{title}» в компании {employer}. Буду рад обсудить детали.');
    renderResumes();
    refreshSettingsAuth();
    loadAppInfo();
}

saveSettingsBtn.addEventListener('click', async () => {
    const blacklistRaw = document.getElementById('cfg-blacklist').value.trim();
    const whitelistRaw = document.getElementById('cfg-whitelist').value.trim();
    const data = {
        resumeIndex:   selectedResumeIndex,
        delayMin:      parseInt(document.getElementById('cfg-delay-min').value) || 8,
        delayMax:      parseInt(document.getElementById('cfg-delay-max').value) || 15,
        blacklist:     blacklistRaw ? blacklistRaw.split('\n').map(s => s.trim()).filter(Boolean) : [],
        whitelist:     whitelistRaw ? whitelistRaw.split('\n').map(s => s.trim()).filter(Boolean) : [],
        coverLetters:  getSettingsTemplates(),
        closeToTray:   setTray.checked,
        autoLaunch:    setAutoLaunch.checked,
    };
    await window.api.settingsSave(data);
    settingsSaved.style.display = '';
    setTimeout(() => { settingsSaved.style.display = 'none'; }, 2500);
});

// ===================== CRAWLER TAB =====================
const crawlStartBtn = document.getElementById('crawlStartBtn');
const crawlStopBtn  = document.getElementById('crawlStopBtn');
const clearCrawlLog = document.getElementById('clearCrawlLog');

let crawlRunning = false;

clearCrawlLog.addEventListener('click', () => { document.getElementById('crawlLog').innerHTML = ''; });

crawlStartBtn.addEventListener('click', async () => {
    if (crawlRunning) return;
    const r = await window.api.crawlStart();
    if (!r.ok) { appendLog('crawlLog', `❌ ${r.error}`); return; }
    crawlRunning = true;
    crawlStartBtn.style.display = 'none';
    crawlStopBtn.style.display  = '';
    appendLog('crawlLog', '🚀 Краулер запущен...');
});

crawlStopBtn.addEventListener('click', async () => {
    await window.api.crawlStop();
    crawlStopBtn.disabled = true;
    appendLog('crawlLog', '⏹ Сигнал остановки отправлен...');
});

window.api.onCrawlLog(m => appendLog('crawlLog', m));

let _crawlStats = null, _crawlStatsRaf = false;
window.api.onCrawlProgress(({ visited, queue, vacancies, processed }) => {
    _crawlStats = { visited, queue, vacancies, processed };
    if (_crawlStatsRaf) return;
    _crawlStatsRaf = true;
    requestAnimationFrame(() => {
        _crawlStatsRaf = false;
        if (!_crawlStats) return;
        document.getElementById('st-visited').textContent   = _crawlStats.visited;
        document.getElementById('st-queue').textContent     = _crawlStats.queue;
        document.getElementById('st-vacancies').textContent = _crawlStats.vacancies;
        document.getElementById('st-processed').textContent = _crawlStats.processed;
    });
});
window.api.onCrawlPageScan(({ name }) => {
    document.getElementById('crawlCurrentPage').textContent = name;
});
window.api.onCrawlDone(({ success, message }) => {
    appendLog('crawlLog', success ? `✅ ${message}` : `❌ ${message}`);
    document.getElementById('crawlCurrentPage').textContent = '';
    crawlRunning = false;
    crawlStartBtn.style.display = '';
    crawlStopBtn.style.display  = 'none';
    crawlStopBtn.disabled = false;
});
