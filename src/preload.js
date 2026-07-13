const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Auth
    authStart:        (c)    => ipcRenderer.invoke('auth:start', c),
    authOtp:          (code) => ipcRenderer.invoke('auth:otp', code),
    authCancel:       ()     => ipcRenderer.invoke('auth:cancel'),
    authStatus:       ()     => ipcRenderer.invoke('auth:status'),
    authFetchProfile: ()     => ipcRenderer.invoke('auth:fetchProfile'),
    authLogout:       ()     => ipcRenderer.invoke('auth:logout'),
    onAuthLog:        (cb)   => ipcRenderer.on('auth:log',          (_e, m) => cb(m)),
    onAuthOtpRequired:(cb)   => ipcRenderer.on('auth:otp-required', ()      => cb()),
    onAuthDone:       (cb)   => ipcRenderer.on('auth:done',         (_e, r) => cb(r)),

    // Crawl
    crawlStart:       ()     => ipcRenderer.invoke('crawl:start'),
    crawlStop:        ()     => ipcRenderer.invoke('crawl:stop'),
    onCrawlLog:       (cb)   => ipcRenderer.on('crawl:log',       (_e, m) => cb(m)),
    onCrawlProgress:  (cb)   => ipcRenderer.on('crawl:progress',  (_e, s) => cb(s)),
    onCrawlPageScan:  (cb)   => ipcRenderer.on('crawl:page-scan', (_e, i) => cb(i)),
    onCrawlDone:      (cb)   => ipcRenderer.on('crawl:done',      (_e, r) => cb(r)),

    // Vacancy search
    vacanciesSearch:  (p)    => ipcRenderer.invoke('vacancies:search', p),
    vacanciesApply:   (p)    => ipcRenderer.invoke('vacancies:apply', p),

    // Auto-apply
    autoApplyStart:   (c)    => ipcRenderer.invoke('autoapply:start', c),
    autoApplyStop:    ()     => ipcRenderer.invoke('autoapply:stop'),
    onAutoApplyLog:   (cb)   => ipcRenderer.on('autoapply:log',      (_e, m) => cb(m)),
    onAutoApplyProgress:(cb) => ipcRenderer.on('autoapply:progress', (_e, s) => cb(s)),
    onAutoApplyDone:  (cb)   => ipcRenderer.on('autoapply:done',     (_e, r) => cb(r)),

    // Negotiations
    negotiationsLoad:   ()   => ipcRenderer.invoke('negotiations:load'),
    onNegotiationsPage: (cb) => ipcRenderer.on('negotiations:page', (_e, items) => cb(items)),

    // Resumes
    resumesLoad:      ()     => ipcRenderer.invoke('resumes:load'),

    // Settings
    settingsLoad:     ()     => ipcRenderer.invoke('settings:load'),
    settingsSave:     (d)    => ipcRenderer.invoke('settings:save', d),

    // Shell
    openUrl:          (url)  => ipcRenderer.invoke('shell:openUrl', url),

    // Results (crawler data)
    resultsLoad:      ()     => ipcRenderer.invoke('results:load'),
    resultsPage:      (url)  => ipcRenderer.invoke('results:page', url),
});
