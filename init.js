const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const readline = require('node:readline/promises');
const fs = require('fs');

chromium.use(stealth);

const AUTH_FILE = 'auth.json';

async function getCredentials() {
    const login = process.env.HH_LOGIN?.trim();
    const password = process.env.HH_PASSWORD?.trim();
    if (login && password) return { login, password };

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const enteredLogin = (await rl.question('Телефон (10 цифр) или email: ')).trim();
        const enteredPassword = (await rl.question('Пароль: ')).trim();
        if (!enteredLogin || !enteredPassword) {
            throw new Error('Логин и пароль обязательны');
        }
        return { login: enteredLogin, password: enteredPassword };
    } finally {
        rl.close();
    }
}

async function run() {
    const { login: HH_LOGIN, password: HH_PASSWORD } = await getCredentials();
    console.log('🚀 Запуск полностью скрытого браузера (headless: true)...');
    
    const browser = await chromium.launch({ 
        headless: false, 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
        console.log('🔑 Открываем страницу авторизации hh.ru...');
        await page.goto('https://hh.ru/account/login', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000); 

        // === ШАГ 1: Обход стартового экрана ===
        const roleCards = page.locator('[data-qa="account-type-cards"]');
        if (await roleCards.isVisible()) {
            await page.locator('[data-qa="submit-button"]').first().click();
            await page.waitForTimeout(2000); 
        }

        // === ШАГ 2: Экран ввода телефона или почты ===
        const isEmail = HH_LOGIN.includes('@');

        if (isEmail) {
            console.log('📧 Переключаемся на вкладку Email...');
            const emailTab = page.locator('[data-qa="credential-type-EMAIL"]');
            if (await emailTab.isVisible()) {
                await emailTab.click();
                await page.waitForTimeout(1000);
            }
            const emailInput = page.locator('input[type="email"], input[name="login"], [data-qa="login-input-username"]').first();
            await emailInput.click();
            await page.keyboard.type(HH_LOGIN, { delay: 100 });
        } else {
            console.log('📱 Ожидание поля ввода номера телефона...');
            const phoneInput = page.locator('[data-qa="magritte-phone-input-national-number-input"]').first();
            
            await phoneInput.waitFor({ state: 'visible', timeout: 5000 });
            await phoneInput.click();
            
            console.log('⌨️ Набираем номер телефона...');
            await page.keyboard.type(HH_LOGIN, { delay: 150 });
        }

        await page.waitForTimeout(1000);
        console.log('🖱️ Кликаем "Дальше"...');
        await page.locator('[data-qa="submit-button"]').first().click();
        
        // === ШАГ 2.5: ПРОВЕРКА НА ВЫПАДЕНИЕ КАПЧИ ===
        console.log('🔄 Проверяем, не вылезла ли капча...');
        await page.waitForTimeout(2500); 

        const modal = page.locator('.bloko-modal, [data-qa="modal"]');
        const iframeCaptcha = page.locator('iframe[src*="recaptcha"], iframe[title*="Cloudflare"]');

        if (await modal.count() > 0 && await modal.first().isVisible()) {
            const modalText = await modal.first().innerText();
            console.log(`\n🚨 АЛАРМ: Сайт выдал модальное окно! Текст внутри:\n"${modalText}"`);
            await page.screenshot({ path: 'debug_modal_blocked.png' });
            return; 
        }
        if (await iframeCaptcha.count() > 0 && await iframeCaptcha.first().isVisible()) {
            console.log('\n🚨 АЛАРМ: HeadHunter показал iframe-капчу (Cloudflare/reCAPTCHA)!');
            await page.screenshot({ path: 'debug_iframe_captcha.png' });
            return;
        }

        // === ШАГ 3: ОПРЕДЕЛЕНИЕ СЛЕДУЮЩЕГО ЭКРАНА (ПАРОЛЬ ИЛИ СМС) ===
        console.log('⏳ Ожидание ответа от сервера (проверка экрана)...');
        
        const passwordInput = page.locator('[data-qa="applicant-login-input-password"], input[name="password"]').first();
        // Добавили новые локаторы для кастомного пинкода
        const otpWrapper = page.locator('[data-qa="applicant-login-input-otp"], [data-qa="magritte-pincode-input-wrapper"], [data-qa="otp-code-input"]').first();

        // Динамическое ожидание: ждем до 8 секунд появления одного из двух полей
        let nextScreen = 'unknown';
        for (let i = 0; i < 8; i++) {
            if (await otpWrapper.isVisible()) {
                nextScreen = 'otp';
                break;
            }
            if (await passwordInput.isVisible()) {
                nextScreen = 'password';
                break;
            }
            await page.waitForTimeout(1000);
        }

        if (nextScreen === 'otp') {
            console.log('\n🔔 HeadHunter решил сразу запросить СМС-код (без пароля)!');
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const code = await rl.question('👉 Введи код из СМС прямо сюда и нажми Enter: ');
            rl.close();

            console.log('Отправляем код...');
            // Кликаем по обертке, чтобы активировать скрытый инпут
            await otpWrapper.click(); 
            // Имитируем нажатие клавиш для заполнения пин-кода
            await page.keyboard.type(code, { delay: 150 }); 
            
            // Проверяем, есть ли кнопка подтверждения. Если ее нет, значит сработает автосабмит.
            const otpSubmitBtn = page.locator('[data-qa="otp-submit-button"], [data-qa="submit-button"]').first();
            if (await otpSubmitBtn.isVisible() && await otpSubmitBtn.isEnabled()) {
                await otpSubmitBtn.click();
            }
            
            console.log('⏳ Ждем проверки кода сервером...');
            await page.waitForTimeout(3000);

        } else if (nextScreen === 'password') {
            console.log('⌨️ Сайт просит пароль. Вводим...');
            await passwordInput.click();
            await page.keyboard.type(HH_PASSWORD, { delay: 100 });
            await page.waitForTimeout(500);
            await page.locator('[data-qa="submit-button"]').first().click();
            await page.waitForTimeout(3000);

            // Проверяем, не вылез ли код ПОСЛЕ ввода пароля (двухфакторка)
            if (await otpWrapper.isVisible()) {
                console.log('\n🔔 ВНИМАНИЕ: Запрошен СМС-код после пароля!');
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                const code = await rl.question('👉 Введи код прямо сюда и нажми Enter: ');
                rl.close();

                await otpWrapper.click();
                await page.keyboard.type(code, { delay: 150 });
                const otpSubmitBtn = page.locator('[data-qa="otp-submit-button"], [data-qa="submit-button"]').first();
                if (await otpSubmitBtn.isVisible() && await otpSubmitBtn.isEnabled()) {
                    await otpSubmitBtn.click();
                }
                await page.waitForTimeout(3000);
            }
        } else {
            await page.screenshot({ path: 'debug_unknown_screen.png' });
            console.log('❌ Неизвестный экран (ни пароля, ни СМС). Снимок сохранен в debug_unknown_screen.png');
            return;
        }

        // === ШАГ 4: Переход в профиль и сбор резюме ===
        console.log('✅ Авторизация пройдена! Переходим в личный кабинет...');
        await page.goto('https://hh.ru/applicant/resumes', { waitUntil: 'domcontentloaded' });

        try {
            await page.waitForSelector('[data-qa="resume-title"]', { timeout: 10000 });
            
            await context.storageState({ path: AUTH_FILE });
            console.log('💾 Сессия успешно сохранена в файл auth.json.');

            const resumes = await page.$$eval('[data-qa="resume-title"]', elements => 
                elements.map(el => el.innerText.trim())
            );

            console.log('\n==================================');
            console.log('        👨‍💻 ТВОЙ ПРОФИЛЬ        ');
            console.log('==================================');
            console.log(`📄 Найдено резюме: ${resumes.length}`);
            resumes.forEach((resume, index) => {
                console.log(`   [${index + 1}] ${resume}`);
            });
            console.log('==================================\n');

        } catch (err) {
            console.error('❌ Ошибка: Не удалось загрузить список резюме после авторизации.');
            await page.screenshot({ path: 'debug_cabinet_failed.png' });
        }

    } catch (error) {
        console.error('❌ Критическая ошибка выполнения скрипта:', error.message);
        await page.screenshot({ path: 'debug_fatal_error.png' });
    } finally {
        console.log('🛑 Закрытие фонового браузера.');
        await browser.close();
    }
}

run();