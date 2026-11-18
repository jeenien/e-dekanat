// Сквозной прогон основных сценариев в браузере + скриншоты для описания процесса.
// Запуск: сервер на :3000 со свежей базой, затем `node scripts/screenshots.js`.
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|401|404|422/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
  };
  const shot = (p, name, full = false) => p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  async function login(p, who) {
    await p.goto(BASE + '/');
    await p.waitForSelector('#login-form');
    await p.click(`[data-login="${who}"]`);
    await p.click('#login-btn');
    await p.waitForSelector('#page-title');
    await p.waitForTimeout(500);
  }

  // ---------- Телефон (360 px) ----------
  const phone = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' });
  let p = await phone.newPage(); watch(p, 'phone');
  await p.goto(BASE + '/'); await p.waitForSelector('#login-form'); await shot(p, '01-mobile-login');
  // ошибка входа
  await p.fill('#login', 'anna'); await p.fill('#password', 'wrong'); await p.click('#login-btn');
  await p.waitForSelector('.form-error'); await shot(p, '02-mobile-login-error');
  await login(p, 'anna');
  await shot(p, '03-mobile-today'); await shot(p, '03b-mobile-today-full', true);
  await p.goto(BASE + '/#/schedule'); await p.waitForTimeout(500);
  const dayWithChange = await p.$('.week-strip .dots i.ch');
  if (dayWithChange) { await (await dayWithChange.evaluateHandle((el) => el.closest('button'))).click(); await p.waitForTimeout(400); }
  await shot(p, '04-mobile-schedule-change');
  await p.goto(BASE + '/#/grades'); await p.waitForTimeout(500);
  await p.click('details.more summary'); await shot(p, '05-mobile-grades');
  await p.goto(BASE + '/#/grades/session'); await p.waitForTimeout(400); await shot(p, '06-mobile-session');
  // Заявка: электронная справка
  await p.goto(BASE + '/#/requests/new'); await p.waitForTimeout(400); await shot(p, '07-mobile-services');
  await p.goto(BASE + '/#/requests/new/study_cert'); await p.waitForSelector('#req-form');
  await p.click('#submit'); await p.waitForSelector('[data-field="purpose"] .err:not(:empty)'); await shot(p, '08-mobile-form-validation');
  await p.selectOption('[name="purpose"]', 'Для оформления визы');
  await p.click('#submit'); await p.waitForSelector('.success'); await shot(p, '09-mobile-request-ready');
  await p.click('.success a.btn'); await p.waitForSelector('.timeline'); await p.waitForTimeout(300); await shot(p, '10-mobile-request-detail', true);
  const [doc] = await Promise.all([phone.waitForEvent('page'), p.click('a[href*="/document"]')]);
  await doc.waitForLoadState(); await doc.screenshot({ path: path.join(OUT, '11-mobile-document.png'), fullPage: true });
  const verifyUrl = await doc.evaluate(() => document.querySelector('.qr div').textContent.match(/D-\S+/)[0]);
  await doc.goto(`${BASE}/verify/${verifyUrl}`); await doc.screenshot({ path: path.join(OUT, '12-mobile-verify.png') });
  // Запись на прием
  await p.goto(BASE + '/#/requests/new/appointment'); await p.waitForSelector('[data-slot]:not([disabled])');
  await p.click('[data-slot]:not([disabled])'); await p.selectOption('[name="topic"]', 'Стипендия');
  await shot(p, '13-mobile-appointment'); await p.click('#submit'); await p.waitForSelector('.success');
  // Помощник
  await p.goto(BASE + '/#/today'); await p.waitForSelector('.fab'); await p.click('.fab');
  await p.click('[data-q="Что у меня завтра?"]'); await p.waitForSelector('.msg.bot:nth-child(3):not(#typing)');
  await p.click('[data-q="Как дела с допуском к экзаменам?"]'); await p.waitForTimeout(800);
  await shot(p, '14-mobile-assistant');
  await p.keyboard.press('Escape');
  await p.goto(BASE + '/#/notifications'); await p.waitForTimeout(400); await shot(p, '15-mobile-notifications');
  await p.goto(BASE + '/#/campus'); await p.waitForTimeout(400); await shot(p, '15b-mobile-absences', true);
  await p.goto(BASE + '/#/campus/passes'); await p.waitForTimeout(400); await shot(p, '15c-mobile-passes', true);
  await p.goto(BASE + '/#/profile'); await p.waitForTimeout(400); await shot(p, '16-mobile-profile', true);
  await p.close();

  // Тимур: другой студент — другие данные, есть долг и запрос уточнения
  p = await phone.newPage(); watch(p, 'timur');
  await p.context().clearCookies(); await login(p, 'timur');
  await shot(p, '17-mobile-timur-today'); await shot(p, '17b-mobile-timur-today-full', true);
  const rlink = await p.$('a.banner-retake'); if (rlink) { await rlink.click(); await p.waitForTimeout(500); await shot(p, '17c-mobile-timur-retake-schedule'); }
  await p.goto(BASE + '/#/grades/record'); await p.waitForTimeout(400); await shot(p, '18-mobile-timur-record');
  await p.goto(BASE + '/#/requests'); await p.waitForTimeout(400);
  await p.click('a.card[href^="#/requests/Z-"]'); await p.waitForSelector('#chat');
  await p.fill('#msg', 'Добрый день! Справку с работы принесу в четверг, скан прикладываю.'); await p.click('#chat button');
  await p.waitForTimeout(700); await shot(p, '19-mobile-timur-chat', true);
  // Подмена адреса: попытка открыть чужую заявку
  await p.goto(BASE + '/#/requests/Z-AAAA-BBBB'); await p.waitForSelector('.empty'); await shot(p, '20-mobile-foreign-request');
  await p.close();

  // Ника: первый курс, пустые состояния
  p = await phone.newPage(); watch(p, 'nika');
  await p.context().clearCookies(); await login(p, 'nika');
  await p.goto(BASE + '/#/grades/record'); await p.waitForTimeout(400); await shot(p, '21-mobile-nika-empty-record');
  await p.goto(BASE + '/#/requests'); await p.waitForTimeout(400); await shot(p, '22-mobile-nika-empty-requests');
  await p.close();
  await phone.close();

  // ---------- Компьютер ----------
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  p = await desk.newPage(); watch(p, 'desk');
  await login(p, 'anna');
  await shot(p, '30-desktop-today');
  await p.goto(BASE + '/#/schedule'); await p.waitForTimeout(500); await shot(p, '31-desktop-schedule');
  await p.goto(BASE + '/#/grades'); await p.waitForTimeout(500); await shot(p, '32-desktop-grades');
  await p.keyboard.press('Control+k'); await p.waitForSelector('#pq'); await p.fill('#pq', 'справ'); await p.waitForTimeout(200); await shot(p, '33-desktop-search');
  await p.keyboard.press('Escape');
  await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await p.goto(BASE + '/#/today'); await p.waitForTimeout(2000); await shot(p, '34-desktop-dark');
  await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await p.context().clearCookies();
  // Сотрудник деканата
  await login(p, 'dekanat');
  await p.waitForSelector('#tbl'); await shot(p, '35-desktop-staff-queue');
  await p.click('[data-f=""]'); await p.waitForSelector('#tbl tr.click');
  await p.click('#tbl tr.click'); await p.waitForSelector('#st');
  await p.fill('#cm', 'Справка подготовлена, можно забрать в А-112 с 10:00 до 17:00.');
  await shot(p, '36-desktop-staff-request');
  await p.click('[data-s="ready"]'); await p.waitForTimeout(600);
  await p.goto(BASE + '/#/staff/students'); await p.waitForSelector('tr[data-id]'); await shot(p, '38-desktop-staff-students');
  await p.click('tr[data-id]'); await p.waitForSelector('#rt'); await p.waitForTimeout(300); await shot(p, '39-desktop-staff-student', true);
  await p.goto(BASE + '/#/staff/schedule'); await p.waitForSelector('#p'); await p.fill('#rm', 'Б-201'); await p.fill('#nt', 'Проектор не работает');
  await shot(p, '37-desktop-staff-schedule');
  await p.click('#sc button.btn'); await p.waitForTimeout(500);
  await p.close(); await desk.close();
  await browser.close();
  if (errors.length) { console.error('Ошибки в браузере:\n' + errors.join('\n')); process.exit(1); }
  console.log('Все сценарии пройдены, скриншоты в docs/screenshots');
})().catch((e) => { console.error(e); process.exit(1); });
