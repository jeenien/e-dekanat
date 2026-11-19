// Общие помощники: безопасная вставка текста, иконки, запросы к API, даты, тосты, модальные окна.
import { ICONS } from './icons.js';

// Любые данные в HTML проходят через esc() — защита от XSS
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export class ApiError extends Error { constructor(status, body) { super(body?.error || 'Ошибка сети'); this.status = status; this.body = body; } }
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  const started = performance.now();
  const slowTimer = setTimeout(() => window.orbitaOfferLite?.('Сервер отвечает медленно.'), 5000);
  try {
    res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-Orbita': '1' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    clearTimeout(slowTimer);
    throw new ApiError(0, { error: navigator.onLine ? 'Сервер не отвечает. Попробуйте еще раз.' : 'Нет подключения к интернету' });
  }
  clearTimeout(slowTimer);
  if (performance.now() - started > 5000) window.orbitaOfferLite?.('Сервер отвечает медленно.');
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') { window.dispatchEvent(new Event('orbita:logout')); }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---------- Даты ----------
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const todayISO = () => isoDate(new Date());
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WDF = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const fmt = {
  wd: (d) => WD[d.getDay()], wdFull: (d) => WDF[d.getDay()],
  dm: (d) => `${d.getDate()} ${MON[d.getMonth()]}`, dmShort: (d) => `${d.getDate()} ${MONS[d.getMonth()]}`, mon: (d) => MONS[d.getMonth()],
  dayTitle(d) {
    const t = parseISO(todayISO()); const diff = Math.round((parseISO(isoDate(d)) - t) / 864e5);
    const rel = diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : diff === -1 ? 'Вчера' : null;
    return rel ? `${rel}, ${fmt.dm(d)}` : `${WDF[d.getDay()][0].toUpperCase() + WDF[d.getDay()].slice(1)}, ${fmt.dm(d)}`;
  },
  time: (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  dateTime: (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
  ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'только что'; if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
    if (s < 86400) return `${Math.floor(s / 3600)} ч назад`; if (s < 172800) return 'вчера';
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  },
  until(iso) {
    const s = (new Date(iso) - Date.now()) / 1000;
    if (s < 0) return 'просрочено'; if (s < 3600) return `через ${Math.max(1, Math.floor(s / 60))} мин`;
    if (s < 86400) return `через ${Math.floor(s / 3600)} ч`; const d = Math.round(s / 86400);
    return `через ${d} ${plural(d, 'день', 'дня', 'дней')}`;
  },
};
export function plural(n, one, few, many) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; }
export const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// ---------- Тосты ----------
export function toast(text, kind = '') {
  const box = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'bad' ? 'alert' : 'checkCircle')}<span>${esc(text)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

// ---------- Модальное окно / нижняя шторка ----------
export function sheet(html, { onMount, label = 'Окно', cls = 'sheet' } = {}) {
  const prevFocus = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="${cls}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${cls === 'sheet' ? '<div class="grab"></div>' : ''}${html}</div>`;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const close = () => { ov.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
  const box = ov.firstElementChild;
  onMount?.(box, close);
  (box.querySelector('[autofocus]') || box.querySelector('button, a, input'))?.focus();
  return close;
}

// ---------- Общие блоки ----------
export const empty = (ico, title, text = '', action = '') => `<div class="empty"><div class="art">${icon(ico)}</div><b>${esc(title)}</b>${text ? `<p class="small">${esc(text)}</p>` : ''}${action}</div>`;
export const errorBox = (e) => `<div class="error-box">${icon('alert')}<div><b>Не получилось загрузить данные</b><div class="small">${esc(e.message)}</div></div><button class="btn sm danger" data-action="retry">${icon('refresh', 'sm')} Повторить</button></div>`;
export const skeleton = (n = 3, h = 120) => `<div class="stack">${Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join('')}</div>`;

export const STATUS_META = {
  submitted: { cls: 'info', ico: 'inbox', step: 1 }, in_progress: { cls: 'brand', ico: 'loader', step: 2 },
  need_info: { cls: 'warn', ico: 'message', step: 2 }, ready: { cls: 'ok', ico: 'checkCircle', step: 3 },
  done: { cls: 'ok', ico: 'check', step: 3 }, rejected: { cls: 'bad', ico: 'x', step: 3 },
};
export const statusChip = (r) => `<span class="chip ${STATUS_META[r.status]?.cls || ''}">${esc(r.status_label)}</span>`;
export const markClass = (m) => ({ 'отлично': 'm5', 'хорошо': 'm4', 'удовлетворительно': 'm3', 'неудовлетворительно': 'm2', 'не зачтено': 'm2' }[m] || 'mz');
export const markShort = (m) => ({ 'отлично': '5', 'хорошо': '4', 'удовлетворительно': '3', 'неудовлетворительно': '2', 'зачтено': 'зач', 'не зачтено': 'н/з' }[m] || m);
export const kindClass = (k) => (/пересдач/i.test(k) ? 'kind-retake' : /лекц/i.test(k) ? 'kind-lec' : /практ|семинар/i.test(k) ? 'kind-prac' : /лаб/i.test(k) ? 'kind-lab' : 'kind-other');
export const initials = (u) => `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`;
