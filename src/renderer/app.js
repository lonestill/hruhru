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
        if (t === 'dashboard') renderDashboard();
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

const SKELETON_COUNT = 6;

function buildVacancySkeleton() {
    const card = document.createElement('div');
    card.className = 'vacancy-card skel';
    card.innerHTML = `
      <div class="vc-header">
        <div class="vc-title-block">
          <div class="sk-row sk-title-sp"></div>
          <div class="sk-row sk-employer-sp"></div>
        </div>
      </div>
      <div class="sk-badges-sp">
        <div class="sk-row sk-badge-sp"></div>
        <div class="sk-row sk-badge-sp b2"></div>
        <div class="sk-row sk-badge-sp b3"></div>
      </div>
      <div class="sk-row sk-snippet-sp"></div>
      <div class="sk-row sk-snippet-sp s2"></div>
      <div class="sk-actions-sp">
        <div class="sk-row sk-btn-sp"></div>
      </div>`;
    return card;
}

function showVacancySkeletons(n = SKELETON_COUNT) {
    searchResults.innerHTML = '';
    searchEmpty.style.display = 'none';
    searchMeta.style.display = 'none';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) frag.appendChild(buildVacancySkeleton());
    searchResults.appendChild(frag);
}

function buildNegoSkeleton() {
    const card = document.createElement('div');
    card.className = 'nego-card skel';
    card.innerHTML = `
      <div class="sk-row sk-logo-sp"></div>
      <div class="nego-info">
        <div class="sk-row sk-nego-title"></div>
        <div class="sk-row sk-nego-empl"></div>
      </div>
      <div class="sk-row sk-nego-status"></div>
      <div class="sk-row sk-nego-date"></div>`;
    return card;
}

function showNegoSkeletons(n = SKELETON_COUNT) {
    negoList.innerHTML = '';
    negoEmpty.style.display = 'none';
    negoLoading.style.display = 'none';
    negoStats.style.display = 'none';
    negoToolbar.style.display = 'none';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) frag.appendChild(buildNegoSkeleton());
    negoList.appendChild(frag);
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

        restoreLastSearch();

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
    filtered = filtered.filter(v => !isVacancyHidden(v.id));
    if (f && f.hideResponded) filtered = filtered.filter(v => !v.responded);
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

    _visibleSorted = sorted;
    _visibleCount = Math.min(sorted.length, VISIBLE_CHUNK);
    searchResults.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < _visibleCount; i++) {
        frag.appendChild(buildVacancyCard(sorted[i], hlWords));
    }
    if (sorted.length > _visibleCount) {
        const sentinel = document.createElement('div');
        sentinel.id = 'searchScrollSentinel';
        sentinel.style.minHeight = '400px';
        frag.appendChild(sentinel);
    }
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

const VISIBLE_CHUNK = 60;
let _visibleSorted = [];
let _visibleCount = 0;
let _searchScrollRaf = false;

function onSearchScroll() {
    if (_searchScrollRaf) return;
    _searchScrollRaf = true;
    requestAnimationFrame(() => {
        _searchScrollRaf = false;
        if (_visibleCount >= _visibleSorted.length) return;
        const sentinel = document.getElementById('searchScrollSentinel');
        if (!sentinel) return;
        const rect = sentinel.getBoundingClientRect();
        const trigger = window.innerHeight + 600;
        if (rect.top < trigger) {
            const hlWords = getSearchHighlightWords();
            const start = _visibleCount;
            const end = Math.min(_visibleSorted.length, start + VISIBLE_CHUNK);
            const frag = document.createDocumentFragment();
            for (let i = start; i < end; i++) {
                frag.appendChild(buildVacancyCard(_visibleSorted[i], hlWords));
            }
            sentinel.remove();
            searchResults.appendChild(frag);
            _visibleCount = end;
            if (_visibleSorted.length > _visibleCount) {
                searchResults.appendChild(sentinel);
            }
        }
    });
}
document.addEventListener('scroll', onSearchScroll, { passive: true, capture: true });
window.addEventListener('resize', onSearchScroll, { passive: true });

function buildVacancyCard(v, hlWords) {
    const card = document.createElement('div');
    card.className = 'vacancy-card' + (v.responded ? ' responded' : '') + (isVacancyHidden(v.id) ? ' hidden' : '') + (_compareIds.has(String(v.id)) ? ' selected-for-compare' : '');
    card.dataset.vacancyId = v.id || '';
    card.dataset.vacancyUrl = v.url || '';
    card.dataset.vacancyTitle = v.title || '';
    card.dataset.vacancyEmployer = v.employer || '';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'vc-compare-check';
    check.title = 'Добавить к сравнению';
    check.checked = _compareIds.has(String(v.id));
    check.addEventListener('click', e => e.stopPropagation());
    check.addEventListener('change', () => toggleCompare(v.id));
    card.appendChild(check);

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
    showVacancySkeletons();

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

    cacheSearchResult(serverParams, cards, total, totalPages, currentPage);

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
    negoList.innerHTML = '';
    const frag = document.createDocumentFragment();
    const n = Math.min(filtered.length, NEGO_VISIBLE_CHUNK);
    for (let i = 0; i < n; i++) frag.appendChild(renderNegoCard(filtered[i]));
    if (filtered.length > n) {
        const s = document.createElement('div');
        s.id = 'negoScrollSentinel';
        s.style.minHeight = '300px';
        s.dataset.total = filtered.length;
        s.dataset.loaded = n;
        frag.appendChild(s);
    }
    negoList.appendChild(frag);
}

function scheduleNegoRender() {
    if (_negoListRaf) return;
    _negoListRaf = true;
    requestAnimationFrame(renderNegoList);
}

negoRefreshBtn.addEventListener('click', loadNegotiations);

const NEGO_VISIBLE_CHUNK = 60;
let _negoScrollRaf = false;
function onNegoScroll() {
    if (_negoScrollRaf) return;
    _negoScrollRaf = true;
    requestAnimationFrame(() => {
        _negoScrollRaf = false;
        const s = document.getElementById('negoScrollSentinel');
        if (!s) return;
        const rect = s.getBoundingClientRect();
        if (rect.top >= window.innerHeight + 400) return;
        const total = +s.dataset.total;
        const loaded = +s.dataset.loaded;
        if (!total || !loaded) return;
        const filtered = getFilteredNego();
        const frag = document.createDocumentFragment();
        const end = Math.min(filtered.length, loaded + NEGO_VISIBLE_CHUNK);
        for (let i = loaded; i < end; i++) frag.appendChild(renderNegoCard(filtered[i]));
        s.remove();
        negoList.appendChild(frag);
        if (filtered.length > end) {
            const ns = document.createElement('div');
            ns.id = 'negoScrollSentinel';
            ns.style.minHeight = '300px';
            ns.dataset.total = filtered.length;
            ns.dataset.loaded = end;
            negoList.appendChild(ns);
        }
    });
}
document.addEventListener('scroll', onNegoScroll, { passive: true, capture: true });
window.addEventListener('resize', onNegoScroll, { passive: true });

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
    card.dataset.negoUrl = n.vacancyUrl || n.url || '';
    card.dataset.negoTitle = n.vacancyTitle || n.title || '';

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
    showNegoSkeletons();
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
        negoList.innerHTML = '';
        negoEmpty.style.display = 'flex';
        negoStats.style.display = 'none';
        negoToolbar.style.display = 'none';
        negoEmpty.querySelector('div:last-child').textContent = `Ошибка: ${res.error}`;
        return;
    }
    if (!_negoItems.length) {
        negoList.innerHTML = '';
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

// ===================== COMMAND PALETTE ====================
const cmdPalette = document.getElementById('cmdPalette');
const cmdInput   = document.getElementById('cmdInput');
const cmdResults = document.getElementById('cmdResults');
let _cmdItems = [];
let _cmdSelected = 0;

function cmdOpen() {
    cmdPalette.style.display = 'flex';
    cmdInput.value = '';
    _cmdSelected = 0;
    cmdRefresh('');
    setTimeout(() => cmdInput.focus(), 10);
}
function cmdClose() { cmdPalette.style.display = 'none'; }

function cmdHl(s, q) {
    if (!q) return esc(s);
    const i = String(s).toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
}

function cmdBuildItems(q) {
    const items = [];
    const ql = q.toLowerCase();

    // Tabs
    const tabsList = [
        { id: 'search',       label: 'Поиск',          icon: '#icon-search' },
        { id: 'autoapply',    label: 'Автоотклик',      icon: '#icon-bolt' },
        { id: 'negotiations', label: 'Мои отклики',     icon: '#icon-inbox' },
        { id: 'settings',     label: 'Настройки',       icon: '#icon-settings' },
    ];
    tabsList.forEach(t => {
        if (!q || t.label.toLowerCase().includes(ql)) {
            items.push({ type: 'tab', group: 'Вкладки', icon: t.icon, title: t.label, sub: 'Перейти во вкладку', action: () => switchTab(t.id) });
        }
    });

    // Actions
    const actions = [
{ label: 'Запустить автоотклик',  icon: '#icon-bolt',   show: !aaRunning,     action: () => { switchTab('autoapply'); aaStartBtn.click(); } },
        { label: 'Остановить автоотклик', icon: '#icon-stop',   show: !!aaRunning,    action: () => { switchTab('autoapply'); aaStopBtn.click(); } },
        { label: 'Обновить отклики',      icon: '#icon-refresh',show: true,            action: () => { switchTab('negotiations'); _negoLoaded = false; loadNegotiations(); } },
        { label: 'Проверить обновления',  icon: '#icon-target', show: true,            action: () => { switchTab('settings'); setCheckUpdates.click(); } },
        { label: 'Сохранить настройки',    icon: '#icon-save',   show: true,            action: () => { switchTab('settings'); saveSettingsBtn.click(); } },
        { label: 'Открыть папку данных',   icon: '#icon-file',   show: true,            action: () => { switchTab('settings'); setOpenDataPath.click(); } },
        { label: 'Очистить кэш профиля',   icon: '#icon-trash',  show: true,            action: () => { switchTab('settings'); setClearCache.click(); } },
        { label: 'Выйти из аккаунта',     icon: '#icon-logout', show: logoutBtn.style.display !== 'none', action: () => logoutBtn.click() },
    ];
    actions.forEach(a => {
        if (!a.show) return;
        if (!q || a.label.toLowerCase().includes(ql)) {
            items.push({ type: 'action', group: 'Действия', icon: a.icon, title: a.label, sub: '', action: a.action });
        }
    });

    // Vacancies (from current search results)
    if (_allCards && _allCards.length) {
        _allCards.forEach(v => {
            const title = v.title || '';
            const employer = v.employer || '';
            const haystack = (title + ' ' + employer).toLowerCase();
            if (!q || haystack.includes(ql)) {
                items.push({
                    type: 'vacancy', group: 'Вакансии',
                    icon: '#icon-search',
                    title: title, sub: employer,
                    action: () => {
                        switchTab('search');
                        if (v.url) window.api.openUrl(v.url);
                    }
                });
            }
        });
    }

    // Negotiations
    if (_negoItems && _negoItems.length) {
        _negoItems.forEach(n => {
            const title = n.vacancyTitle || n.title || '';
            const employer = n.employerName || n.employer || '';
            const haystack = (title + ' ' + employer).toLowerCase();
            if (!q || haystack.includes(ql)) {
                items.push({
                    type: 'nego', group: 'Отклики',
                    icon: '#icon-inbox',
                    title: title, sub: employer,
                    action: () => {
                        switchTab('negotiations');
                        const url = n.vacancyUrl || n.url;
                        if (url) window.api.openUrl(url);
                    }
                });
            }
        });
    }

    return items;
}

function switchTab(id) {
    const btn = document.querySelector(`.nav-item[data-tab="${id}"]`);
    if (btn) btn.click();
}

function cmdRefresh(q) {
    _cmdItems = cmdBuildItems(q);
    _cmdSelected = 0;
    cmdRender();
}

function cmdRender() {
    if (!_cmdItems.length) {
        cmdResults.innerHTML = '<div class="cmd-empty">Ничего не найдено</div>';
        return;
    }
    const groups = new Map();
    _cmdItems.forEach((it, i) => {
        if (!groups.has(it.group)) groups.set(it.group, []);
        groups.get(it.group).push({ it, i });
    });
    let html = '';
    for (const [g, list] of groups) {
        html += `<div class="cmd-group-title">${esc(g)}</div>`;
        for (const { it, i } of list) {
            const cls = i === _cmdSelected ? 'cmd-item selected' : 'cmd-item';
            const q = cmdInput.value;
            html += `<div class="${cls}" data-idx="${i}">
                <div class="cmd-item-icon"><svg class="icon icon-sm" aria-hidden="true"><use href="${it.icon}"/></svg></div>
                <div class="cmd-item-text">
                    <div class="cmd-item-title">${cmdHl(it.title, q)}</div>
                    ${it.sub ? `<div class="cmd-item-sub">${cmdHl(it.sub, q)}</div>` : ''}
                </div>
            </div>`;
        }
    }
    cmdResults.innerHTML = html;
    cmdResults.querySelectorAll('.cmd-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = +el.dataset.idx;
            const item = _cmdItems[idx];
            if (item) { cmdClose(); item.action(); }
        });
        el.addEventListener('mouseenter', () => {
            _cmdSelected = +el.dataset.idx;
            cmdResults.querySelectorAll('.cmd-item').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
        });
    });
    const sel = cmdResults.querySelector('.cmd-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (cmdPalette.style.display === 'flex') cmdClose();
        else cmdOpen();
    }
    if (e.key === 'Escape' && cmdPalette.style.display === 'flex') {
        cmdClose();
    }
    if (cmdPalette.style.display !== 'flex') return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _cmdSelected = Math.min(_cmdSelected + 1, _cmdItems.length - 1);
        cmdRender();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _cmdSelected = Math.max(_cmdSelected - 1, 0);
        cmdRender();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = _cmdItems[_cmdSelected];
        if (item) { cmdClose(); item.action(); }
    }
});

cmdInput.addEventListener('input', () => cmdRefresh(cmdInput.value));
cmdPalette.addEventListener('click', e => { if (e.target === cmdPalette) cmdClose(); });

// ===================== CONTEXT MENU ====================
const HIDDEN_KEY = 'hh_hidden_vacancies';
function getHiddenVacancies() {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); }
    catch { return new Set(); }
}
function isVacancyHidden(id) { return id ? getHiddenVacancies().has(String(id)) : false; }
function hideVacancy(id) {
    if (!id) return;
    const s = getHiddenVacancies();
    s.add(String(id));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
}
function unhideVacancy(id) {
    if (!id) return;
    const s = getHiddenVacancies();
    s.delete(String(id));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
}

const ctxMenu = document.createElement('div');
ctxMenu.className = 'ctx-menu';
document.body.appendChild(ctxMenu);

function ctxShow(x, y, items) {
    ctxMenu.innerHTML = '';
    items.forEach((it, i) => {
        if (it.sep) { ctxMenu.appendChild(document.createElement('div')).className = 'ctx-sep'; return; }
        const el = document.createElement('div');
        el.className = 'ctx-item' + (it.danger ? ' danger' : '');
        el.innerHTML = `<svg class="icon icon-sm" aria-hidden="true"><use href="${it.icon || '#icon-file'}"/></svg><span>${esc(it.label)}</span>`;
        el.addEventListener('click', () => { ctxHide(); it.action && it.action(); });
        ctxMenu.appendChild(el);
    });
    ctxMenu.classList.add('open');
    const rect = ctxMenu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    ctxMenu.style.left = Math.min(x, maxX) + 'px';
    ctxMenu.style.top = Math.min(y, maxY) + 'px';
}
function ctxHide() { ctxMenu.classList.remove('open'); }
document.addEventListener('click', ctxHide);
document.addEventListener('scroll', ctxHide, true);

document.addEventListener('contextmenu', e => {
    const card = e.target.closest('.vacancy-card');
    if (card && !card.classList.contains('skel')) {
        e.preventDefault();
        const id = card.dataset.vacancyId;
        const url = card.dataset.vacancyUrl;
        const title = card.dataset.vacancyTitle || '';
        const employer = card.dataset.vacancyEmployer || '';
        const items = [
            { label: 'Открыть в браузере', icon: '#icon-search', action: () => url && window.api.openUrl(url) },
            { label: 'Скопировать ссылку', icon: '#icon-file', action: () => navigator.clipboard.writeText(url || '') },
{ label: 'Скопировать название', icon: '#icon-file', action: () => navigator.clipboard.writeText(title) },
            { label: 'Добавить компанию в чёрный список', icon: '#icon-ban', danger: true, action: async () => {
                if (!employer) return;
                await window.api.blacklistAdd(employer);
                if (!isVacancyHidden(id)) {
                    hideVacancy(id);
                    card.classList.add('hidden');
                }
                scheduleSearchRender();
            } },
            { label: _compareIds.has(String(id)) ? 'Убрать из сравнения' : 'Добавить к сравнению', icon: '#icon-filter', action: () => toggleCompare(id) },
            { sep: true },
            { label: 'Скрыть вакансию', icon: '#icon-eye-off', danger: true, action: () => {
                hideVacancy(id);
                card.classList.add('hidden');
                scheduleSearchRender();
            } },
        ];
        if (isVacancyHidden(id)) {
            items[items.length - 1].label = 'Показать вакансию';
            items[items.length - 1].action = () => {
                unhideVacancy(id);
                card.classList.remove('hidden');
                scheduleSearchRender();
            };
        }
        ctxShow(e.clientX, e.clientY, items);
        return;
    }
    const ncard = e.target.closest('.nego-card');
    if (ncard && !ncard.classList.contains('skel')) {
        e.preventDefault();
        const url = ncard.dataset.negoUrl;
        const title = ncard.dataset.negoTitle || '';
        const items = [
            { label: 'Открыть переписку', icon: '#icon-inbox', action: () => url && window.api.openUrl(url) },
            { label: 'Скопировать ссылку', icon: '#icon-file', action: () => navigator.clipboard.writeText(url || '') },
            { label: 'Скопировать название', icon: '#icon-file', action: () => navigator.clipboard.writeText(title) },
        ];
        ctxShow(e.clientX, e.clientY, items);
        return;
    }
});

// ===================== COMPARE VACANCIES ====================
const _compareIds = new Set();
const COMPARE_MAX = 4;
const compareModal = document.getElementById('compareModal');
const compareFloat = document.getElementById('compareFloat');
const compareCount = document.getElementById('compareCount');
const compareBody  = document.getElementById('compareBody');
const compareClose = document.getElementById('compareClose');

function toggleCompare(id) {
    if (!id) return;
    id = String(id);
    if (_compareIds.has(id)) {
        _compareIds.delete(id);
    } else {
        if (_compareIds.size >= COMPARE_MAX) {
            alert('Максимум ' + COMPARE_MAX + ' вакансий для сравнения');
            return;
        }
        _compareIds.add(id);
    }
    updateCompareFloat();
    scheduleSearchRender();
}

function updateCompareFloat() {
    const n = _compareIds.size;
    if (n >= 2) {
        compareFloat.style.display = 'inline-flex';
        compareCount.textContent = n;
    } else {
        compareFloat.style.display = 'none';
    }
}

function getCompareVacancies() {
    const out = [];
    _compareIds.forEach(id => {
        const v = _allCards.find(c => String(c.id) === id);
        if (v) out.push(v);
    });
    return out;
}

function openCompareModal() {
    const vacancies = getCompareVacancies();
    if (vacancies.length < 2) return;
    const rows = [
        { label: 'Название',    render: v => `<strong>${esc(v.title || '—')}</strong>` },
        { label: 'Компания',    render: v => esc(v.employer || '—') },
        { label: 'Зарплата',    render: v => v.salary ? `<span class="badge badge-salary">${esc(v.salary)}</span>` : '—' },
        { label: 'Опыт',        render: v => v.experience ? `<span class="badge badge-exp">${esc(v.experience)}</span>` : '—' },
        { label: 'Рейтинг',     render: v => v.rating ? `⭐ ${esc(v.rating)}` + (v.reviews ? ' · ' + esc(v.reviews) : '') : '—' },
        { label: 'Метро',       render: v => v.metro ? 'м ' + esc(v.metro) : '—' },
        { label: 'Адрес',       render: v => v.address ? '📍 ' + esc(v.address) : '—' },
        { label: 'Требования',  render: v => esc(v.requirement || v.responsibility || '—') },
        { label: 'Ссылка',      render: v => v.url ? `<a href="#" class="col-link" data-url="${esc(v.url)}">Открыть ↗</a>` : '—' },
    ];
    let html = '<table class="compare-table"><thead><tr><th></th>';
    vacancies.forEach(v => {
        html += `<th class="col-title">${esc(v.title || '—')}<div style="font-weight:400;color:var(--text2);font-size:11px;margin-top:2px">${esc(v.employer || '')}</div></th>`;
    });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
        html += `<tr><th>${esc(row.label)}</th>`;
        vacancies.forEach(v => { html += '<td>' + row.render(v) + '</td>'; });
        html += '</tr>';
    });
    html += '</tbody></table>';
    compareBody.innerHTML = html;
    compareBody.querySelectorAll('[data-url]').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            if (el.dataset.url) window.api.openUrl(el.dataset.url);
        });
    });
    compareModal.style.display = 'flex';
}

compareFloat.addEventListener('click', openCompareModal);
compareClose.addEventListener('click', () => compareModal.style.display = 'none');
compareModal.addEventListener('click', e => { if (e.target === compareModal) compareModal.style.display = 'none'; });

// ===================== OFFLINE CACHE (IndexedDB) ====================
const _dbPromise = (function() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('hh-cache', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('vacancies')) db.createObjectStore('vacancies', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('searches'))  db.createObjectStore('searches',  { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
})();

async function dbPutCards(cards) {
    if (!cards || !cards.length) return;
    const db = await _dbPromise;
    const tx = db.transaction('vacancies', 'readwrite');
    const store = tx.objectStore('vacancies');
    cards.forEach(c => { if (c && c.id) store.put(c); });
    return new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
}

async function dbGetCard(id) {
    const db = await _dbPromise;
    return new Promise(res => {
        const tx = db.transaction('vacancies', 'readonly');
        const r = tx.objectStore('vacancies').get(id);
        r.onsuccess = () => res(r.result);
        r.onerror   = () => res(null);
    });
}

async function dbPutSearch(key, data) {
    const db = await _dbPromise;
    const tx = db.transaction('searches', 'readwrite');
    tx.objectStore('searches').put({ key, data, ts: Date.now() });
    return new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
}

async function dbGetSearch(key) {
    const db = await _dbPromise;
    return new Promise(res => {
        const tx = db.transaction('searches', 'readonly');
        const r = tx.objectStore('searches').get(key);
        r.onsuccess = () => res(r.result);
        r.onerror   = () => res(null);
    });
}

async function dbGetLastSearch() {
    const db = await _dbPromise;
    return new Promise(res => {
        const tx = db.transaction('searches', 'readonly');
        const store = tx.objectStore('searches');
        const r = store.openCursor(null, 'prev');
        r.onsuccess = () => { const c = r.result; res(c ? c.value : null); };
        r.onerror   = () => res(null);
    });
}

async function cacheSearchResult(serverParams, cards, total, totalPages, currentPage) {
    try {
        await dbPutCards(cards);
        const key = JSON.stringify(serverParams);
        await dbPutSearch(key, { cards: cards.map(c => c.id), total, totalPages, currentPage, serverParams });
    } catch (e) { /* ignore */ }
}

async function restoreLastSearch() {
    try {
        const rec = await dbGetLastSearch();
        if (!rec) return false;
        const data = rec.data;
        const now = Date.now();
        const ageH = (now - rec.ts) / 3600000;
        _allCards = data.cards.slice();
        _searchState.serverParams = data.serverParams;
        _searchState.page = data.currentPage;
        _searchState.totalPages = data.totalPages;
        _searchState.clientFilters = collectClientFilters();
        searchMeta.style.display = 'flex';
        searchTotal.textContent = 'Из кэша: ' + data.total + (ageH < 1 ? ` (${Math.round(ageH*60)} мин назад)` : ` (${Math.round(ageH)} ч назад)`);
        searchPageEl.textContent = data.currentPage + ' / ' + data.totalPages;
        searchPrev.disabled = data.currentPage <= 1;
        searchNext.disabled = data.currentPage >= data.totalPages;
        renderVacancies();
        return true;
    } catch { return false; }
}

// ===================== DASHBOARD ====================
const dashEmpty    = document.getElementById('dashEmpty');
const dashGrid     = document.getElementById('dashGrid');
const dashRefreshBtn = document.getElementById('dashRefreshBtn');

function getNegoDate(n) {
    return n.createdAt || n.date || n.updatedAt || n.created_at || null;
}
function getStatusKey(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('приглашен') || s.includes('invite')) return 'invite';
    if (s.includes('отказан') || s.includes('reject')) return 'reject';
    if (s.includes('просмотрен') || s.includes('viewed')) return 'viewed';
    return 'new';
}

dashRefreshBtn.addEventListener('click', async () => {
    if (!_negoItems.length) {
        dashRefreshBtn.disabled = true;
        _negoLoaded = false;
        await loadNegotiations();
        dashRefreshBtn.disabled = false;
    }
    renderDashboard();
});

function renderDashboard() {
    const items = _negoItems;
    if (!items.length) {
        dashEmpty.style.display = 'flex';
        dashGrid.style.display = 'none';
        return;
    }
    dashEmpty.style.display = 'none';
    dashGrid.style.display = 'flex';

    const counts = { total: items.length, invite: 0, reject: 0, viewed: 0, new: 0 };
    items.forEach(n => counts[getStatusKey(n.status)]++);
    document.getElementById('dk-total').textContent  = counts.total;
    document.getElementById('dk-invite').textContent = counts.invite;
    document.getElementById('dk-reject').textContent = counts.reject;
    document.getElementById('dk-viewed').textContent = counts.viewed;
    document.getElementById('dk-new').textContent    = counts.new;
    const rate = counts.total ? Math.round((counts.invite / counts.total) * 100) : 0;
    document.getElementById('dk-rate').textContent   = rate + '%';

    renderDashTimeline(items);
    renderDashFunnel(counts);
    renderDashStack(items);
    renderDashTop(items);
    renderDashDow(items);
}

function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

const STATUS_COLORS = {
    invite: '#34d399', reject: '#f87171', viewed: '#a1a1aa', new: '#6366f1'
};

function renderDashTimeline(items) {
    const now = Date.now();
    const days = 30;
    const buckets = new Array(days).fill(0);
    items.forEach(n => {
        const d = getNegoDate(n);
        if (!d) return;
        const t = typeof d === 'number' ? d : Date.parse(d);
        if (!t) return;
        const diff = Math.floor((now - t) / (24 * 3600 * 1000));
        if (diff >= 0 && diff < days) buckets[days - 1 - diff]++;
    });
    const max = Math.max(1, ...buckets);
    const w = 600, h = 160, pad = 22;
    const cw = w - pad * 2;
    const ch = h - pad * 2;
    const stepX = cw / Math.max(1, days - 1);
    const points = buckets.map((v, i) => [pad + i * stepX, h - pad - (v / max) * ch]);
    let path = points.length ? 'M' + points[0][0] + ',' + points[0][1] : '';
    for (let i = 1; i < points.length; i++) {
        const [x1, y1] = points[i - 1];
        const [x2, y2] = points[i];
        const mx = (x1 + x2) / 2;
        path += ` C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    }
    let area = path;
    if (points.length) {
        area = 'M' + points[0][0] + ',' + (h - pad) + ' L' + points[0][0] + ',' + points[0][1];
        for (let i = 1; i < points.length; i++) {
            const [x1, y1] = points[i - 1];
            const [x2, y2] = points[i];
            const mx = (x1 + x2) / 2;
            area += ` C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        }
        const last = points[points.length - 1];
        area += ` L${last[0]},${h - pad} Z`;
    }
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, 'preserveAspectRatio': 'xMidYMid meet' });
    // gridlines
    for (let g = 1; g <= 4; g++) {
        const y = pad + (ch / 4) * g;
        svg.appendChild(svgEl('line', { x1: pad, x2: w - pad, y1: y, y2: y, stroke: 'rgba(255,255,255,.04)' }));
    }
    if (area) svg.appendChild(svgEl('path', { d: area, fill: 'rgba(99,102,241,.18)' }));
    if (path) svg.appendChild(svgEl('path', { d: path, fill: 'none', stroke: '#6366f1', 'stroke-width': '2' }));
    points.forEach((p, i) => {
        if (buckets[i] === 0) return;
        svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 2.5, fill: '#818cf8' }));
    });
    document.getElementById('dashTimeline').innerHTML = '';
    document.getElementById('dashTimeline').appendChild(svg);
}

function renderDashFunnel(counts) {
    const steps = [
        { label: 'Всего откликов', val: counts.total,    color: '#6366f1' },
        { label: 'Просмотрены',    val: counts.viewed + counts.invite + counts.reject, color: '#818cf8' },
        { label: 'Приглашения',   val: counts.invite,    color: '#34d399' },
        { label: 'Отказы',        val: counts.reject,    color: '#f87171' },
    ];
    const max = Math.max(1, steps[0].val);
    let html = '';
    steps.forEach(s => {
        const pct = (s.val / max) * 100;
        html += `<div class="dash-funnel-step">
            <div class="dash-funnel-label">${esc(s.label)}</div>
            <div class="dash-funnel-bar-wrap"><div class="dash-funnel-bar" style="width:${pct}%;background:${s.color}"></div></div>
            <div class="dash-funnel-value">${s.val}</div>
        </div>`;
    });
    document.getElementById('dashFunnel').innerHTML = html;
}

function renderDashStack(items) {
    const now = Date.now();
    const days = 14;
    const buckets = new Array(days).fill(null).map(() => ({ new: 0, viewed: 0, invite: 0, reject: 0 }));
    items.forEach(n => {
        const d = getNegoDate(n);
        if (!d) return;
        const t = typeof d === 'number' ? d : Date.parse(d);
        if (!t) return;
        const diff = Math.floor((now - t) / (24 * 3600 * 1000));
        if (diff >= 0 && diff < days) {
            const k = getStatusKey(n.status);
            buckets[days - 1 - diff][k]++;
        }
    });
    const maxTotal = Math.max(1, ...buckets.map(b => b.new + b.viewed + b.invite + b.reject));
    const w = 600, h = 160, pad = 22, cw = w - pad * 2, ch = h - pad * 2;
    const bw = cw / days * 0.7;
    const gap = cw / days * 0.3;
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, 'preserveAspectRatio': 'xMidYMid meet' });
    buckets.forEach((b, i) => {
        const x = pad + i * (cw / days) + (gap / 2);
        let y = h - pad;
        ['new', 'viewed', 'invite', 'reject'].forEach(k => {
            const v = b[k] / maxTotal * ch;
            svg.appendChild(svgEl('rect', {
                x, y: y - v, width: bw, height: v,
                fill: STATUS_COLORS[k], rx: 1
            }));
            y -= v;
        });
    });
    svg.appendChild(svgEl('line', { x1: pad, x2: w - pad, y1: h - pad, y2: h - pad, stroke: 'rgba(255,255,255,.09)' }));
    document.getElementById('dashStack').innerHTML = '';
    document.getElementById('dashStack').appendChild(svg);
}

function renderDashTop(items) {
    const m = new Map();
    items.forEach(n => {
        const e = n.employerName || n.employer || '—';
        m.set(e, (m.get(e) || 0) + 1);
    });
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const max = Math.max(1, ...sorted.map(e => e[1]));
    let html = '';
    sorted.forEach(([name, n]) => {
        const pct = (n / max) * 100;
        html += `<div class="dash-bar-row">
            <div class="dash-bar-label" title="${esc(name)}">${esc(name)}</div>
            <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${pct}%"></div></div>
            <div class="dash-bar-val">${n}</div>
        </div>`;
    });
    document.getElementById('dashTop').innerHTML = html;
}

function renderDashDow(items) {
    const cnt = new Array(7).fill(0);
    items.forEach(n => {
        const d = getNegoDate(n);
        if (!d) return;
        const t = typeof d === 'number' ? d : Date.parse(d);
        if (!t) return;
        const dt = new Date(t);
        const dow = dt.getDay();
        cnt[(dow + 6) % 7]++;
    });
    const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const max = Math.max(1, ...cnt);
    const w = 600, h = 160, pad = 22, cw = w - pad * 2, ch = h - pad * 2;
    const bw = cw / 7 * 0.62;
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, 'preserveAspectRatio': 'xMidYMid meet' });
    for (let g = 1; g <= 4; g++) {
        const y = pad + (ch / 4) * g;
        svg.appendChild(svgEl('line', { x1: pad, x2: w - pad, y1: y, y2: y, stroke: 'rgba(255,255,255,.04)' }));
    }
    cnt.forEach((v, i) => {
        const bh = (v / max) * ch;
        const x = pad + i * (cw / 7) + ((cw / 7) - bw) / 2;
        const fill = (i === 5 || i === 6) ? '#a1a1aa' : '#6366f1';
        svg.appendChild(svgEl('rect', { x, y: h - pad - bh, width: bw, height: bh, rx: 3, fill }));
        svg.appendChild(svgEl('text', { x: x + bw / 2, y: h - pad - bh - 6, fill: 'rgba(255,255,255,.7)', 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'sans-serif' })).textContent = v;
        svg.appendChild(svgEl('text', { x: x + bw / 2, y: h - 4, fill: 'rgba(255,255,255,.5)', 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'sans-serif' })).textContent = labels[i];
    });
    document.getElementById('dowChart').innerHTML = '';
    document.getElementById('dowChart').appendChild(svg);
}

// ===================== SUBSCRIPTIONS ====================
const SUB_KEY = 'hh_subscriptions';

function loadSubscriptions() {
    try { return JSON.parse(localStorage.getItem(SUB_KEY) || '[]'); }
    catch { return []; }
}
function saveSubscriptions(list) {
    localStorage.setItem(SUB_KEY, JSON.stringify(list));
}

const subListEl = document.createElement('div');
subListEl.className = 'saved-searches';
subListEl.id = 'subList';
document.getElementById('savedSearches').after(subListEl);

const subBtn = document.createElement('button');
subBtn.className = 'btn btn-ghost btn-sm';
subBtn.id = 'createSubBtn';
subBtn.style.marginLeft = '10px';
subBtn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-bell"/></svg><span class="btn-text">Создать подписку</span>';
document.getElementById('saveSearchBtn').after(subBtn);

const searchNavItem = document.querySelector('.nav-item[data-tab="search"]');
const navBadge = document.createElement('span');
navBadge.className = 'nav-badge';
navBadge.style.display = 'none';
searchNavItem.appendChild(navBadge);

function renderSubscriptions() {
    const list = loadSubscriptions();
    if (!list.length) { subListEl.style.display = 'none'; navBadge.style.display = 'none'; return; }
    subListEl.style.display = 'flex';
    subListEl.innerHTML = '';
    let totalUnseen = 0;
    list.forEach((s, i) => {
        totalUnseen += (s.unseenCount || 0);
        const chip = document.createElement('div');
        chip.className = 'sub-chip';
        let html = '<span class="sub-chip-bell">🔔</span>';
        html += `<span>${esc(s.name)}</span>`;
        html += `<span class="sub-chip-meta">${s.intervalMin}мин</span>`;
        if (s.unseenCount > 0) {
            html += `<span class="sub-chip-badge">${s.unseenCount}</span>`;
        }
        html += '<span class="sub-chip-remove" data-idx="' + i + '" title="Удалить">×</span>';
        chip.innerHTML = html;
        chip.title = `Каждые ${s.intervalMin} мин` + (s.lastRunAt ? ` · последний: ${new Date(s.lastRunAt).toLocaleTimeString('ru-RU')}` : '');
        chip.addEventListener('click', e => {
            if (e.target.classList.contains('sub-chip-remove')) {
                const idx = parseInt(e.target.dataset.idx);
                const updated = loadSubscriptions().filter((_, j) => j !== idx);
                saveSubscriptions(updated);
                renderSubscriptions();
                return;
            }
            s.unseenCount = 0;
            saveSubscriptions(loadSubscriptions().map((x, j) => j === i ? s : x));
            restoreSavedSearch(s);
            renderSubscriptions();
            doSearch(1).then(() => {});
        });
        subListEl.appendChild(chip);
    });
    navBadge.textContent = totalUnseen > 99 ? '99+' : totalUnseen;
    navBadge.style.display = totalUnseen > 0 ? '' : 'none';
}

subBtn.addEventListener('click', () => {
    const serverParams = collectServerParams();
    if (!serverParams.text && !serverParams.area.length) {
        alert('Введите запрос или выберите регион');
        return;
    }
    const name = prompt('Название подписки:', serverParams.text || 'Поиск');
    if (!name) return;
    const iv = parseInt(prompt('Интервал проверки (минут, минимум 5):', '30') || '0');
    if (!iv || iv < 5) { alert('Интервал должен быть не менее 5 минут'); return; }
    const list = loadSubscriptions();
    list.push({
        id: Date.now().toString(36),
        name, intervalMin: iv,
        serverParams,
        clientFilters: collectClientFilters(),
        lastRunAt: 0,
        seenIds: [],
        unseenCount: 0
    });
    saveSubscriptions(list);
    renderSubscriptions();
});

async function runSubscriptionOnce(sub, idx) {
    try {
        const res = await window.api.vacanciesSearch({ ...sub.serverParams, page: 1 });
        if (!res.ok || !res.data || !res.data.cards) return;
        const seen = new Set(sub.seenIds || []);
        const newCards = res.data.cards.filter(c => c.id && !seen.has(String(c.id)));
        sub.lastRunAt = Date.now();
        if (newCards.length) {
            sub.unseenCount = (sub.unseenCount || 0) + newCards.length;
            sub.seenIds = [...seen, ...newCards.map(c => String(c.id))].slice(-500);
            window.api.appNotify({
                title: '🔔 Новые вакансии: ' + sub.name,
                body: `Найдено ${newCards.length} новых вакансий. Кликни, чтобы посмотреть.`,
                url: 'https://hh.ru/search/vacancy?text=' + encodeURIComponent(sub.serverParams.text || '')
            });
        }
        const list = loadSubscriptions();
        list[idx] = sub;
        saveSubscriptions(list);
    } catch (e) { /* ignore */ }
}

function tickSubscriptions() {
    const list = loadSubscriptions();
    const now = Date.now();
    list.forEach((sub, idx) => {
        if (!sub.lastRunAt || (now - sub.lastRunAt) >= sub.intervalMin * 60 * 1000) {
            runSubscriptionOnce(sub, idx);
        }
    });
    renderSubscriptions();
}

setInterval(tickSubscriptions, 60 * 1000);
renderSubscriptions();
