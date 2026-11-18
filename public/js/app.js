// Точка входа: вход, каркас (боковое меню / нижняя панель), маршрутизация по #адресам.
import { api, esc, icon, toast, initials, errorBox, skeleton, empty } from './lib.js';
import * as Today from './views/today.js';
import * as Schedule from './views/schedule.js';
import * as Grades from './views/grades.js';
import * as Requests from './views/requests.js';
import * as Notifications from './views/notifications.js';
import * as Profile from './views/profile.js';
import * as Staff from './views/staff.js';
import * as Campus from './views/campus.js';
import { openAssistant } from './views/assistant.js';
import { openPalette } from './views/palette.js';

export const state = { user: null, ai: false, unread: 0 };
const app = document.getElementById('app');

// ---------- Оформление: световая схема и акцентный цвет ----------
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } } };
export const ACCENTS = [['navy', '#1f3a7a', 'Navy'], ['ocean', '#0b5c7a', 'Океан'], ['emerald', '#13694e', 'Изумруд'], ['burgundy', '#7a1f3d', 'Бордо'], ['violet', '#4b2f8f', 'Фиалка'], ['graphite', '#2f3640', 'Графит']];
export function applyLook() {
  const scheme = store.get('orbita-theme') || 'auto';
  const accent = store.get('orbita-accent') || 'navy';
  const r = document.documentElement;
  if (scheme === 'auto') delete r.dataset.theme; else r.dataset.theme = scheme;
  if (accent === 'navy') delete r.dataset.accent; else r.dataset.accent = accent;
  const dark = scheme === 'dark' || (scheme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#070b16' : '#eef1f7');
  // Иконка вкладки тоже в цвет акцента
  const hex = (ACCENTS.find(([k]) => k === accent) || ACCENTS[0])[1];
  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="${hex}"/><ellipse cx="24" cy="24" rx="16" ry="7" fill="none" stroke="#fff" stroke-width="2.6" transform="rotate(-28 24 24)"/><circle cx="24" cy="24" r="5.5" fill="#fff"/><circle cx="37.2" cy="16.6" r="2.8" fill="#fff"/></svg>`);
  return { scheme, accent };
}
export function setLook({ scheme, accent }) {
  if (scheme) store.set('orbita-theme', scheme);
  if (accent) store.set('orbita-accent', accent);
  return applyLook();
}
export function toggleTheme() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  setLook({ scheme: dark ? 'light' : 'dark' });
}
applyLook();

const CONCEPT = '';
// Логотип рисуется inline, чтобы перекрашиваться в выбранный акцентный цвет
export const logoSvg = (size = 40) => `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" class="logo-svg"><rect width="48" height="48" rx="14" style="fill:var(--fill)"/><ellipse cx="24" cy="24" rx="16" ry="7" fill="none" stroke="#fff" stroke-width="2.6" stroke-opacity=".9" transform="rotate(-28 24 24)"/><circle cx="24" cy="24" r="5.5" fill="#fff"/><circle cx="37.2" cy="16.6" r="2.8" fill="#fff"/></svg>`;
const LOGO = logoSvg(40);
// Фон страницы входа: медленно плывущие «стеклянные» волны (только CSS-анимация)
const AUTH_BG = '<div class="auth-bg" aria-hidden="true"><i class="w1"></i><i class="w2"></i><i class="w3"></i><i class="w4"></i></div>';

// ---------- Вход ----------
const DEMO = [
  { login: 'anna', password: 'Orbita-Anna-2026', name: 'Анна Ветрова', note: 'ИТ, 2 курс, отличница' },
  { login: 'timur', password: 'Orbita-Timur-2026', name: 'Тимур Северцев', note: 'Экономика, 3 курс, долг' },
  { login: 'nika', password: 'Orbita-Nika-2026', name: 'Ника Полярная', note: 'Лингвистика, 1 курс' },
  { login: 'dekanat', password: 'Orbita-Staff-2026', name: 'Ольга Ладогина', note: 'Сотрудник деканата' },
];
function renderLogin(message = '') {
  document.title = 'Вход — Орбита';
  app.innerHTML = `<div class="auth">${AUTH_BG}<div class="auth-wrap">
    <main class="auth-card" id="main">
      <div class="auth-hero"><span class="logo" role="img" aria-label="Логотип «Орбита»">${logoSvg(64)}</span><h1>Орбита</h1><p>Личный кабинет студента вымышленного Университета «Горизонт»</p></div>
      <form class="card" id="login-form" novalidate>
        ${message ? `<div class="form-error" role="alert">${esc(message)}</div>` : ''}
        <div class="field"><label for="login">Логин</label><input class="input" id="login" name="login" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
        <div class="field"><label for="password">Пароль</label><div class="pwd"><input class="input" id="password" name="password" type="password" autocomplete="current-password" required>
          <button type="button" class="icon-btn" id="eye" aria-label="Показать пароль">${icon('eye')}</button></div></div>
        <button class="btn grad block" type="submit" id="login-btn">Войти</button>
        <p class="xs faint" style="margin-top:12px;text-align:center">${icon('lock', 'sm')} Пароли хранятся только в виде хеша, сессия защищена HttpOnly-cookie</p>
      </form>
      <div class="demo"><div class="section-title" style="margin:0 4px">Демо-доступ для жюри — нажмите, чтобы заполнить</div>
        <div class="demo-grid">${DEMO.map((d) => `<button type="button" data-login="${d.login}"><b>${d.name}</b><small>${d.note}</small></button>`).join('')}</div></div>
      <p class="login-note">Демонстрационный прототип · университет и все данные вымышлены</p>
    </main></div></div>`;
  const form = document.getElementById('login-form');
  document.getElementById('eye').onclick = (e) => {
    const p = document.getElementById('password'); p.type = p.type === 'password' ? 'text' : 'password';
    e.currentTarget.innerHTML = icon(p.type === 'password' ? 'eye' : 'eyeOff');
  };
  app.querySelectorAll('[data-login]').forEach((b) => b.onclick = () => {
    const d = DEMO.find((x) => x.login === b.dataset.login);
    form.login.value = d.login; form.password.value = d.password; document.getElementById('login-btn').focus();
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    if (!form.login.value.trim() || !form.password.value) { renderLoginError('Введите логин и пароль'); return; }
    btn.disabled = true; btn.innerHTML = `${icon('loader', 'spin')} Входим…`;
    try {
      await api('/auth/login', { method: 'POST', body: { login: form.login.value.trim(), password: form.password.value } });
      await boot();
      if (!location.hash || location.hash === '#/') location.hash = state.user.role === 'staff' ? '#/staff' : '#/today';
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Войти';
      renderLoginError(err.message);
    }
  };
  function renderLoginError(msg) {
    form.querySelector('.form-error')?.remove();
    form.insertAdjacentHTML('afterbegin', `<div class="form-error" role="alert">${esc(msg)}</div>`);
    form.password.select?.();
  }
}

// ---------- Каркас ----------
// В нижней панели телефона — 5 главных разделов; лента открывается колокольчиком сверху
const NAV_STUDENT = [
  ['#/today', 'home', 'Сегодня'], ['#/schedule', 'calendar', 'Расписание'], ['#/grades', 'grades', 'Учеба'],
  ['#/requests', 'docs', 'Заявки'], ['#/campus', 'pin', 'Посещаемость'],
];
const NAV_STAFF = [['#/staff', 'inbox', 'Заявки'], ['#/staff/students', 'users', 'Студенты'], ['#/staff/announce', 'megaphone', 'Объявления'], ['#/staff/schedule', 'calendar', 'Расписание'], ['#/profile', 'user', 'Профиль']];
const nav = () => (state.user.role === 'staff' ? NAV_STAFF : NAV_STUDENT);
const navSide = () => [...nav().filter(([h]) => h !== '#/profile'), ['#/notifications', 'bell', 'Лента'], ['#/profile', 'user', 'Профиль']];

function renderShell() {
  const u = state.user;
  app.innerHTML = `${CONCEPT}<div class="shell">
    <aside class="sidebar">
      <div class="brand">${LOGO}<div><b>Орбита</b><small>цифровой деканат</small></div></div>
      <nav aria-label="Основное меню">${navSide().map(([h, i, t]) => `<a href="${h}" data-nav="${h}">${icon(i)}<span>${t}</span>${h === '#/notifications' ? '<span class="count" hidden></span>' : ''}</a>`).join('')}</nav>
      <div class="sb-foot">
        <button class="btn ghost block" data-act="palette">${icon('search')} Найти <span class="kbd" style="margin-left:auto">Ctrl K</span></button>
        <a class="me" href="#/profile"><div class="avatar sm">${esc(initials(u))}</div><div class="grow"><b class="ellipsis" style="display:block">${esc(u.first_name)} ${esc(u.last_name)}</b><small>${u.role === 'staff' ? esc(u.position || 'Деканат') : `${esc(u.group)} · ${u.course} курс`}</small></div></a>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="icon-btn back hide-desk" id="back" hidden aria-label="Назад">${icon('chevronLeft')}</a>
        <h1 id="page-title">Орбита</h1>
        <button class="icon-btn hide-desk" data-act="palette" aria-label="Поиск">${icon('search')}</button>
        <button class="icon-btn hide-mob" data-act="theme" aria-label="Сменить тему">${icon('moon')}</button>
        <a class="icon-btn hide-desk" href="#/notifications" aria-label="Лента уведомлений">${icon('bell')}<span class="dot" hidden></span></a>
        ${u.role === 'student' ? `<a class="icon-btn hide-desk" href="#/profile" aria-label="Профиль">${icon('user')}</a>` : ''}
      </header>
      <main id="main" tabindex="-1"></main>
    </div>
    <nav class="tabbar" aria-label="Нижнее меню">${nav().map(([h, i, t]) => `<a href="${h}" data-nav="${h}">${icon(i)}<span>${t}</span></a>`).join('')}</nav>
    ${u.role === 'student' ? `<button class="fab" data-act="assistant" aria-label="Спросить помощника Орбиту">${icon('sparkles')}<span>Спросить</span></button>` : ''}
  </div>`;
  app.querySelectorAll('[data-act="theme"]').forEach((b) => b.onclick = toggleTheme);
  app.querySelectorAll('[data-act="palette"]').forEach((b) => b.onclick = () => openPalette(state));
  app.querySelector('[data-act="assistant"]')?.addEventListener('click', () => openAssistant(state));
}

export async function refreshBadges() {
  try {
    const list = await api('/notifications');
    state.unread = list.filter((n) => !n.read).length;
  } catch { return; }
  document.querySelectorAll('.sidebar .count').forEach((c) => { c.hidden = !state.unread; c.textContent = state.unread; });
  document.querySelectorAll('.topbar .dot').forEach((c) => { c.hidden = !state.unread; c.textContent = state.unread > 9 ? '9+' : state.unread; });
}

// ---------- Маршрутизация ----------
function match(hash) {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const s = state.user.role === 'student';
  if (!s) {
    if (p[0] === 'staff' && p[1] === 'requests' && p[2]) return [Staff.renderRequest, { id: p[2] }];
    if (p[0] === 'staff' && p[1] === 'announce') return [Staff.renderAnnounce, {}];
    if (p[0] === 'staff' && p[1] === 'schedule') return [Staff.renderSchedule, {}];
    if (p[0] === 'staff' && p[1] === 'students' && p[2]) return [Staff.renderStudent, { id: p[2] }];
    if (p[0] === 'staff' && p[1] === 'students') return [Staff.renderStudents, {}];
    if (p[0] === 'notifications') return [Notifications.render, {}];
    if (p[0] === 'profile') return [Profile.render, {}];
    return [Staff.renderQueue, {}];
  }
  switch (p[0]) {
    case 'schedule': return [Schedule.render, { date: p[1] }];
    case 'campus': return [Campus.render, { tab: p[1] || 'absences' }];
    case 'grades': return [Grades.render, { tab: p[1] || 'current' }];
    case 'requests':
      if (p[1] === 'new') return [Requests.renderNew, { type: p[2] }];
      if (p[1]) return [Requests.renderOne, { id: p[1] }];
      return [Requests.renderList, {}];
    case 'notifications': return [Notifications.render, {}];
    case 'profile': return [Profile.render, {}];
    default: return [Today.render, {}];
  }
}

let routeToken = 0;
async function route() {
  if (!state.user) return;
  const [view, params] = match(location.hash);
  const token = ++routeToken;
  const main = document.getElementById('main');
  const hash = location.hash || (state.user.role === 'staff' ? '#/staff' : '#/today');
  const base = '#/' + (hash.replace(/^#\/?/, '').split('/')[0] || '');
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === hash || (a.dataset.nav !== '#/staff' && hash.startsWith(a.dataset.nav + '/')) || (a.dataset.nav === base && a.dataset.nav !== '#/staff') || (a.dataset.nav === '#/staff' && /^#\/staff(\/requests.*)?$/.test(hash)) || (a.dataset.nav === '#/today' && (hash === '#/' || hash === ''));
    a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const fab = document.querySelector('.fab'); if (fab) fab.hidden = /^#\/(requests\/|profile)/.test(hash);
  main.innerHTML = `<div class="page">${skeleton(3)}</div>`;
  const ctx = {
    el: main, params, state, isCurrent: () => token === routeToken, refreshBadges,
    setTitle(title, back) {
      document.getElementById('page-title').textContent = title;
      document.title = `${title} — Орбита`;
      const b = document.getElementById('back');
      b.hidden = !back; if (back) b.href = back;
    },
    reload: () => route(),
  };
  try {
    await view(ctx);
  } catch (e) {
    if (token !== routeToken) return;
    if (e.status === 404) {
      main.innerHTML = `<div class="page card">${empty('search', 'Ничего не найдено', 'Такой страницы или заявки нет — или она принадлежит другому пользователю.', '<a class="btn soft sm" href="#/">На главную</a>')}</div>`;
      return;
    }
    main.innerHTML = `<div class="page">${errorBox(e)}</div>`;
    main.querySelector('[data-action="retry"]').onclick = () => route();
  }
  if (token === routeToken) { window.scrollTo({ top: 0 }); }
}

async function boot() {
  try {
    const me = await api('/auth/me');
    state.user = me.user; state.ai = me.ai;
  } catch (e) {
    app.innerHTML = `<div class="auth">${CONCEPT}<div class="auth-wrap"><div class="auth-card">${errorBox(e)}</div></div></div>`;
    app.querySelector('[data-action="retry"]').onclick = boot;
    return;
  }
  if (!state.user) return renderLogin();
  renderShell();
  route();
  refreshBadges();
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* все равно выходим */ }
  state.user = null; location.hash = ''; renderLogin(); toast('Вы вышли из кабинета');
}

window.addEventListener('hashchange', route);
window.addEventListener('scroll', () => document.querySelector('.topbar')?.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
window.addEventListener('orbita:logout', () => { if (state.user) { state.user = null; renderLogin('Сессия истекла — войдите снова'); } });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.user) { e.preventDefault(); openPalette(state); }
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
boot();
