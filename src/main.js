const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');

const AuthFlow    = require('./lib/auth');
const Crawler     = require('./lib/crawler');
const { searchVacancies, applyToVacancy, AutoApply } = require('./lib/vacancies');
const { getNegotiations, getResumes } = require('./lib/negotiations');
const { getProfile, clearProfileCache, loadProfileCache } = require('./lib/profile');
const { DATA_DIR } = require('./lib/config');

const AUTH_FILE   = path.join(DATA_DIR, 'auth.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

let mainWindow = null;
let authFlow   = null;
let crawler    = null;
let autoApply  = null;
let tray       = null;
let closeToTray = false;

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); }
    catch { return {}; }
}

function saveSettings(data) {
    const current = loadSettings();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ ...current, ...data }, null, 2), 'utf-8');
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0a0a0c',
        title: 'HH Job Tool',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('close', (e) => {
        if (closeToTray && !app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

function setupTray() {
    if (tray) { tray.destroy(); tray = null; }
    if (!closeToTray) return;
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Показать', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
        { type: 'separator' },
        { label: 'Выход', click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip('HH Job Tool');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } });
}

// ---- First-launch Chromium downloader ----
// Playwright needs a Chromium binary (~150MB). To keep the installer small
// we don't bundle it; instead we download it on first launch with a progress
// window so the user knows what's happening.
function isChromiumInstalled() {
    try {
        const { chromium } = require('playwright');
        const p = chromium.executablePath();
        return !!p && fs.existsSync(p);
    } catch { return false; }
}

function createInstallWindow() {
    const win = new BrowserWindow({
        width: 460, height: 320,
        resizable: false, minimizable: false, maximizable: false,
        backgroundColor: '#0a0a0c',
        title: 'HH Job Tool — установка браузера',
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: false, nodeIntegration: true }
    });
    win.setMenuBarVisibility(false);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,Segoe UI,system-ui,sans-serif;background:#0a0a0c;color:#f4f4f5;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center}
.icon{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;margin-bottom:18px;box-shadow:0 8px 24px rgba(99,102,241,.4)}
h1{font-size:16px;font-weight:600;margin-bottom:10px;letter-spacing:-.2px}
p{font-size:12.5px;color:#a1a1aa;line-height:1.55;max-width:340px;margin-bottom:22px}
.bar{width:100%;max-width:360px;height:8px;background:#1c1c22;border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,.06)}
.fill{height:100%;background:linear-gradient(90deg,#6366f1,#818cf8);border-radius:4px;width:0%;transition:width .3s ease}
.status{margin-top:12px;font-size:12px;color:#71717a;font-variant-numeric:tabular-nums}
.err{color:#f87171}
</style></head><body>
<div class="icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
<h1>Скачиваем браузер Chromium</h1>
<p>HH Job Tool использует встроенный браузер для авторизации на hh.ru и поиска вакансий. Это разовая загрузка — при следующих запусках всё будет готово.</p>
<div class="bar"><div class="fill" id="f"></div></div>
<div class="status" id="s">Подготовка…</div>
<script>
const { ipcRenderer } = require('electron');
const f = document.getElementById('f');
const s = document.getElementById('s');
ipcRenderer.on('install:progress', (_e, pct) => {
  f.style.width = pct + '%';
  s.textContent = pct + '%';
});
ipcRenderer.on('install:log', (_e, msg) => { s.textContent = msg; });
ipcRenderer.on('install:error', (_e, msg) => {
  s.textContent = 'Ошибка: ' + msg;
  s.classList.add('err');
});
ipcRenderer.on('install:done', () => { s.textContent = 'Готово!'; });
</script>
</body></html>`;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return win;
}

function installChromium() {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'lib', 'install-browser.js');
        const child = spawn(process.execPath, [scriptPath], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let lastLine = '';
        child.stdout.setEncoding('utf-8');
        child.stderr.setEncoding('utf-8');
        child.stdout.on('data', (d) => {
            const lines = d.split('\n').filter(Boolean);
            for (const line of lines) {
                lastLine = line;
                if (line.startsWith('progress=')) {
                    const pct = parseInt(line.slice(9));
                    if (installWin && !installWin.isDestroyed()) installWin.webContents.send('install:progress', pct);
                } else if (line === 'DONE') {
                    if (installWin && !installWin.isDestroyed()) installWin.webContents.send('install:done');
                } else if (line.startsWith('ERROR:')) {
                    if (installWin && !installWin.isDestroyed()) installWin.webContents.send('install:error', line.slice(6));
                }
            }
        });
        child.stderr.on('data', (d) => { lastLine += d; });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(lastLine || `install exited with ${code}`));
        });
    });
}

let installWin = null;

app.whenReady().then(async () => {
    if (!isChromiumInstalled()) {
        installWin = createInstallWindow();
        try {
            await installChromium();
        } catch (err) {
            if (installWin && !installWin.isDestroyed()) installWin.webContents.send('install:error', err.message);
            // Wait a bit so the user can read the error before the app quits.
            setTimeout(() => app.quit(), 4000);
            return;
        }
        if (installWin && !installWin.isDestroyed()) {
            installWin.close();
            installWin = null;
        }
    }
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (authFlow)  authFlow.cancel();
    if (crawler)   crawler.stop();
    if (autoApply) autoApply.stop();
    if (process.platform !== 'darwin') app.quit();
});

const send = (channel, ...args) => {
    if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send(channel, ...args);
};

// ===================== AUTH =====================
ipcMain.handle('auth:start', async (_e, { login, password }) => {
    if (authFlow) return { ok: false, error: 'Авторизация уже запущена' };
    authFlow = new AuthFlow(login, password);
    authFlow.on('log',          msg => send('auth:log', msg));
    authFlow.on('otp-required', ()  => send('auth:otp-required'));
    authFlow.on('done', (ok, msg)   => { send('auth:done', { success: ok, message: msg }); authFlow = null; });
    authFlow.run();
    return { ok: true };
});

ipcMain.handle('auth:otp', (_e, code) => { if (authFlow) authFlow.submitOtp(code); return { ok: true }; });
ipcMain.handle('auth:cancel', () => { if (authFlow) { authFlow.cancel(); authFlow = null; } return { ok: true }; });
ipcMain.handle('auth:status', async () => {
    const authExists = fs.existsSync(AUTH_FILE);
    if (!authExists) return { authExists: false, profileName: null, profile: null };
    const cached = loadProfileCache();
    return { authExists: true, profileName: cached ? cached.name : null, profile: cached };
});
ipcMain.handle('auth:fetchProfile', async () => {
    const profile = await getProfile().catch(() => null);
    return profile || null;
});
ipcMain.handle('auth:logout', () => {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
    clearProfileCache();
    return { ok: true };
});

// ===================== CRAWL =====================
ipcMain.handle('crawl:start', async () => {
    if (crawler) return { ok: false, error: 'Краулер уже запущен' };
    crawler = new Crawler();
    crawler.on('log',       msg  => send('crawl:log', msg));
    crawler.on('progress',  s    => send('crawl:progress', s));
    crawler.on('page-scan', info => send('crawl:page-scan', info));
    crawler.on('done', (ok, msg) => { send('crawl:done', { success: ok, message: msg }); crawler = null; });
    crawler.run();
    return { ok: true };
});

ipcMain.handle('crawl:stop', () => { if (crawler) crawler.stop(); return { ok: true }; });

// ===================== VACANCIES SEARCH =====================
ipcMain.handle('vacancies:search', async (_e, params) => {
    try {
        return { ok: true, data: await searchVacancies(params) };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('vacancies:apply', async (_e, params) => {
    const settings = loadSettings();
    try {
        const res = await applyToVacancy({
            ...params,
            resumeIndex: settings.resumeIndex || 0
        });
        return { ok: res.ok, reason: res.reason };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

// ===================== AUTO-APPLY =====================
ipcMain.handle('autoapply:start', async (_e, config) => {
    if (autoApply) return { ok: false, error: 'Автоотклик уже запущен' };
    const settings = loadSettings();
    autoApply = new AutoApply({
        ...config,
        resumeIndex: settings.resumeIndex || 0,
        delayMin: (settings.delayMin || 8) * 1000,
        delayMax: (settings.delayMax || 15) * 1000,
        filters: {
            ...config.filters,
            blacklist: settings.blacklist || []
        }
    });
    autoApply.on('log',      msg  => send('autoapply:log', msg));
    autoApply.on('progress', s    => send('autoapply:progress', s));
    autoApply.on('done', (ok, msg)=> { send('autoapply:done', { success: ok, message: msg }); if (!config.scheduleEnabled) autoApply = null; });
    autoApply.run();
    return { ok: true };
});

ipcMain.handle('autoapply:stop', () => {
    if (autoApply) { autoApply.stop(); autoApply = null; }
    return { ok: true };
});

// ===================== NEGOTIATIONS =====================
ipcMain.handle('negotiations:load', async () => {
    try {
        const data = await getNegotiations(pageItems => send('negotiations:page', pageItems));
        return { ok: true, data };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

// ===================== RESUMES =====================
ipcMain.handle('resumes:load', async () => {
    try {
        return { ok: true, data: await getResumes() };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

// ===================== SETTINGS =====================
ipcMain.handle('settings:load', () => ({ ok: true, data: loadSettings() }));
ipcMain.handle('settings:save', (_e, data) => {
    saveSettings(data);
    if (data.closeToTray !== undefined) {
        closeToTray = !!data.closeToTray;
        setupTray();
    }
    if (data.autoLaunch !== undefined) {
        app.setLoginItemSettings({ openAtLogin: !!data.autoLaunch });
    }
    return { ok: true };
});

ipcMain.handle('settings:blacklist-add', (_e, name) => {
    const s = loadSettings();
    if (!Array.isArray(s.blacklist)) s.blacklist = [];
    name = (name || '').trim();
    if (name && !s.blacklist.some(b => b.toLowerCase() === name.toLowerCase())) {
        s.blacklist.push(name);
        saveSettings(s);
    }
    return { ok: true, blacklist: s.blacklist };
});

// ===================== APP =====================
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:dataPath', () => DATA_DIR);

ipcMain.handle('app:clearCache', () => {
    clearProfileCache();
    return { ok: true };
});

ipcMain.handle('app:openDataPath', () => {
    shell.openPath(DATA_DIR);
    return { ok: true };
});

ipcMain.handle('app:getAutoLaunch', () => {
    return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('app:checkUpdates', async () => {
    return new Promise((resolve) => {
        const opts = {
            hostname: 'api.github.com',
            path: '/repos/lonestill/hruhru/releases/latest',
            headers: { 'User-Agent': 'hh-job-tool' },
            timeout: 15000,
        };
        https.get(opts, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    resolve({ ok: false, error: `GitHub API ${res.statusCode}` });
                    return;
                }
                try {
                    const r = JSON.parse(body);
                    const current = app.getVersion();
                    const latest = r.tag_name || '';
                    const hasUpdate = latest && latest !== current &&
                        latest.localeCompare(current, undefined, { numeric: true }) > 0;
                    resolve({
                        ok: true,
                        current,
                        latest: latest,
                        hasUpdate,
                        url: r.html_url,
                        publishedAt: r.published_at,
                    });
                } catch (e) {
                    resolve({ ok: false, error: e.message });
                }
            });
        }).on('error', (e) => resolve({ ok: false, error: e.message }))
          .on('timeout', function() { this.destroy(); resolve({ ok: false, error: 'timeout' }); });
    });
});

// ===================== SHELL =====================
ipcMain.handle('shell:openUrl', (_e, url) => { shell.openExternal(url); return { ok: true }; });

// ===================== RESULTS =====================
ipcMain.handle('results:load', () => {
    const read = (name, fb) => {
        const f = path.join(DATA_DIR, name);
        if (!fs.existsSync(f)) return fb;
        try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return fb; }
    };
    const state = read('crawl_state.json', { visited: {}, queue: [], vacancyIds: [] });
    const globalMap = read('hh_global_elements_map.json', {});
    const pages = Object.values(globalMap).map(p => ({
        name: p.name, url: p.url,
        elementCount: p.elementCount || (p.elements ? p.elements.length : 0),
        scrapedAt: p.scrapedAt
    })).sort((a, b) => (b.scrapedAt || '').localeCompare(a.scrapedAt || ''));
    return {
        stats: {
            visited: Object.keys(state.visited || {}).length,
            queue:   (state.queue || []).length,
            vacancies: (state.vacancyIds || []).length,
            totalElements: pages.reduce((s, p) => s + p.elementCount, 0)
        },
        vacancyIds: state.vacancyIds || [],
        pages
    };
});

ipcMain.handle('results:page', (_e, url) => {
    const f = path.join(DATA_DIR, 'hh_global_elements_map.json');
    if (!fs.existsSync(f)) return null;
    try {
        const map = JSON.parse(fs.readFileSync(f, 'utf-8'));
        return map[url] || null;
    } catch { return null; }
});
