const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { scrapeProfileName, saveProfileCache, clearProfileCache } = require('./profile');
const { BROWSER, HH, TIMEOUT } = require('./config');

chromium.use(stealth);

const DATA_DIR = path.join(__dirname, '..', '..');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

class AuthFlow extends EventEmitter {
    constructor(login, password) {
        super();
        this.login = login;
        this.password = password;
        this._otpResolve = null;
        this._browser = null;
        this._cancelled = false;
    }

    log(msg) {
        this.emit('log', msg);
    }

    submitOtp(code) {
        if (this._otpResolve) {
            this._otpResolve(code);
            this._otpResolve = null;
        }
    }

    cancel() {
        this._cancelled = true;
        if (this._browser) this._browser.close().catch(() => {});
    }

    // Modal path: resolves when the user submits the code through the app's
    // own OTP dialog (renderer -> auth:otp -> submitOtp).
    async _waitForOtp() {
        return new Promise((resolve) => {
            this._otpResolve = resolve;
            this.emit('otp-required');
        });
    }

    // Browser path: resolves once the OTP screen is no longer shown — i.e. the
    // user finished it manually in the browser window (or our typed code was
    // accepted) and hh.ru navigated off the login flow. Poll-based so it works
    // no matter how the code was entered. Safe against the page/browser being
    // closed on cancel.
    async _waitForOtpCleared(otpWrapper, page) {
        for (;;) {
            if (this._cancelled) return;
            let visible;
            try {
                visible = await otpWrapper.isVisible();
            } catch {
                return; // page/browser gone
            }
            if (!visible && !/\/account\/(login|signup)/.test(page.url())) return;
            await page.waitForTimeout(800).catch(() => {});
        }
    }

    async run() {
        if (!this.login || !this.password) {
            this.emit('done', false, 'Введите логин и пароль');
            return;
        }

        this.log('🚀 Запуск браузера...');

        let browser, context, page;
        try {
            browser = await chromium.launch({
                headless: false,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            this._browser = browser;

            context = await browser.newContext({
                userAgent: BROWSER.userAgent,
                viewport: BROWSER.viewport
            });

            page = await context.newPage();

            this.log('🔑 Открываем страницу авторизации hh.ru...');
            await page.goto(HH.login, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            if (this._cancelled) return;

            // Шаг 1: Обход стартового экрана
            const roleCards = page.locator('[data-qa="account-type-cards"]');
            if (await roleCards.isVisible()) {
                await page.locator('[data-qa="submit-button"]').first().click();
                await page.waitForTimeout(2000);
            }

            if (this._cancelled) return;

            // Шаг 2: Ввод логина
            const isEmail = this.login.includes('@');
            if (isEmail) {
                this.log('📧 Переключаемся на вкладку Email...');
                const emailTab = page.locator('[data-qa="credential-type-EMAIL"]');
                if (await emailTab.isVisible()) {
                    await emailTab.click();
                    await page.waitForTimeout(1000);
                }
                const emailInput = page.locator('input[type="email"], input[name="login"], [data-qa="login-input-username"]').first();
                await emailInput.click();
                await page.keyboard.type(this.login, { delay: 100 });
            } else {
                this.log('📱 Вводим номер телефона...');
                const phoneInput = page.locator('[data-qa="magritte-phone-input-national-number-input"]').first();
                await phoneInput.waitFor({ state: 'visible', timeout: TIMEOUT.short });
                await phoneInput.click();
                await page.keyboard.type(this.login, { delay: 150 });
            }

            await page.waitForTimeout(1000);
            this.log('🖱️ Кликаем "Дальше"...');
            await page.locator('[data-qa="submit-button"]').first().click();

            // Шаг 2.5: Проверка капчи
            this.log('🔄 Проверяем на капчу...');
            await page.waitForTimeout(2500);

            if (this._cancelled) return;

            const modal = page.locator('.bloko-modal, [data-qa="modal"]');
            const iframeCaptcha = page.locator('iframe[src*="recaptcha"], iframe[title*="Cloudflare"]');

            if (await modal.count() > 0 && await modal.first().isVisible()) {
                const modalText = await modal.first().innerText();
                this.emit('done', false, `Капча/блокировка: ${modalText.slice(0, 100)}`);
                return;
            }
            if (await iframeCaptcha.count() > 0 && await iframeCaptcha.first().isVisible()) {
                this.emit('done', false, 'Обнаружена iframe-капча (Cloudflare/reCAPTCHA)');
                return;
            }

            // Шаг 3: Определение следующего экрана
            const passwordInput = page.locator('[data-qa="applicant-login-input-password"], input[name="password"]').first();
            const otpWrapper = page.locator('[data-qa="applicant-login-input-otp"], [data-qa="magritte-pincode-input-wrapper"], [data-qa="otp-code-input"]').first();

            let nextScreen = 'unknown';
            for (let i = 0; i < 8; i++) {
                if (this._cancelled) return;
                if (await otpWrapper.isVisible()) { nextScreen = 'otp'; break; }
                if (await passwordInput.isVisible()) { nextScreen = 'password'; break; }
                await page.waitForTimeout(1000);
            }

            const handleOtp = async () => {
                this.log('🔔 Нужен СМС-код. Введите его в приложении или прямо в окне браузера.');

                // Race two ways of finishing OTP:
                //  (a) user submits the code via the app's OTP modal
                //  (b) user types the code straight into the browser window
                //      (we detect it by the OTP screen going away)
                // Whichever wins moves the flow forward, so the app never hangs
                // when the code is entered manually in the browser.
                const viaModal   = this._waitForOtp().then(code => ({ code }));
                const viaBrowser = this._waitForOtpCleared(otpWrapper, page).then(() => ({ manual: true }));

                const winner = await Promise.race([viaModal, viaBrowser]);

                // Stop the modal path from dangling if the browser path won.
                this._otpResolve = null;
                if (this._cancelled) return;

                if (winner && winner.manual) {
                    this.log('✅ Код принят в окне браузера.');
                    return;
                }

                this.log('📨 Отправляем код...');
                await otpWrapper.click();
                await page.keyboard.type(winner.code, { delay: 150 });
                const otpSubmitBtn = page.locator('[data-qa="otp-submit-button"], [data-qa="submit-button"]').first();
                if (await otpSubmitBtn.isVisible() && await otpSubmitBtn.isEnabled()) {
                    await otpSubmitBtn.click();
                }
                // Give hh.ru a moment to validate and navigate off the login flow.
                await this._waitForOtpCleared(otpWrapper, page);
            };

            if (nextScreen === 'otp') {
                await handleOtp();
            } else if (nextScreen === 'password') {
                this.log('⌨️ Вводим пароль...');
                await passwordInput.click();
                await page.keyboard.type(this.password, { delay: 100 });
                await page.waitForTimeout(500);
                await page.locator('[data-qa="submit-button"]').first().click();
                await page.waitForTimeout(3000);

                if (await otpWrapper.isVisible()) {
                    await handleOtp();
                }
            } else {
                this.emit('done', false, 'Неизвестный экран после ввода логина');
                return;
            }

            if (this._cancelled) return;

            // Шаг 4: Сохранение сессии
            this.log('✅ Авторизация пройдена! Переходим в личный кабинет...');
            await page.goto(HH.resumes, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500);

            // If hh.ru bounced us back to the login flow, the session isn't valid —
            // don't save a broken auth.json.
            if (/\/account\/(login|signup)/.test(page.url())) {
                this.emit('done', false, 'Не удалось войти — hh.ru вернул на страницу входа. Проверьте код/данные.');
                return;
            }

            await context.storageState({ path: AUTH_FILE });
            this.log('💾 Сессия сохранена в auth.json');

            // Resume list is a nice-to-have; its absence must not fail a valid login
            // (e.g. an account with no resumes yet).
            let resumes = [];
            try {
                await page.waitForSelector('[data-qa="resume-title"]', { timeout: 8000 });
                resumes = await page.$$eval('[data-qa="resume-title"]', els =>
                    els.map(el => el.innerText.trim())
                );
            } catch {
                this.log('ℹ️ Резюме не найдены (или страница не успела прогрузиться).');
            }

            this.log(`📄 Найдено резюме: ${resumes.length}`);
            resumes.forEach((r, i) => this.log(`   [${i + 1}] ${r}`));

            const name = await scrapeProfileName(page).catch(() => null);
            if (name) {
                saveProfileCache(name);
                this.log(`👤 Вход выполнен как: ${name}`);
            } else {
                clearProfileCache();
            }

            this.emit('done', true, `Авторизация успешна. Резюме: ${resumes.length}`);

        } catch (err) {
            if (!this._cancelled) {
                this.emit('done', false, `Ошибка: ${err.message}`);
            }
        } finally {
            if (browser) await browser.close().catch(() => {});
            this._browser = null;
        }
    }
}

module.exports = AuthFlow;
