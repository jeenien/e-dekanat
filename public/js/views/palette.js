// Быстрый поиск (Ctrl+K или лупа): разделы, услуги, дисциплины — «нужное за пару касаний».
import { api, esc, icon, sheet } from '../lib.js';
import { openAssistant } from './assistant.js';

export async function openPalette(state) {
  const items = state.user.role === 'staff'
    ? [['Очередь заявок', '#/staff', 'inbox'], ['Студенты: посещаемость и СКУД', '#/staff/students', 'users'], ['Новое объявление', '#/staff/announce', 'megaphone'], ['Изменить расписание', '#/staff/schedule', 'calendar'], ['Лента', '#/notifications', 'bell'], ['Профиль и безопасность', '#/profile', 'user']]
    : [['Сегодня', '#/today', 'home'], ['Расписание на неделю', '#/schedule', 'calendar'], ['Успеваемость и баллы', '#/grades', 'grades'], ['Сессия: экзамены и зачеты', '#/grades/session', 'target'], ['Зачетка', '#/grades/record', 'book'],
      ['Пропуски', '#/campus', 'clock'], ['Входы и выходы (СКУД)', '#/campus/passes', 'pin'], ['Мои заявки', '#/requests', 'docs'], ['Новая заявка', '#/requests/new', 'plus'], ['Лента уведомлений', '#/notifications', 'bell'], ['Профиль и безопасность', '#/profile', 'user'], ['Спросить помощника', 'assistant', 'sparkles']];
  let all = items.map(([t, h, i]) => ({ t, h, i, s: 'Раздел' }));
  if (state.user.role === 'student') {
    try {
      const types = await api('/request-types');
      all = all.concat(types.map((x) => ({ t: x.title, h: `#/requests/new/${x.id}`, i: x.icon, s: 'Услуга', k: x.description })));
    } catch { /* поиск работает и без услуг */ }
  }
  sheet(`<label class="sr-only" for="pq">Поиск</label><input class="input" id="pq" placeholder="Куда перейти? Например: справка, сессия, пересдача" autocomplete="off" autofocus><div class="res list" id="pr" role="listbox"></div>`, {
    cls: 'palette', label: 'Поиск',
    onMount(box, close) {
      const q = box.querySelector('#pq'), out = box.querySelector('#pr');
      let sel = 0, shown = [];
      const draw = () => {
        const v = q.value.trim().toLowerCase();
        shown = all.filter((x) => !v || `${x.t} ${x.k || ''}`.toLowerCase().includes(v)).slice(0, 12);
        sel = Math.min(sel, Math.max(0, shown.length - 1));
        out.innerHTML = shown.length ? shown.map((x, i) => `<button class="li ${i === sel ? 'sel' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}"><div class="ico">${icon(x.i)}</div><div class="grow"><div class="t">${esc(x.t)}</div><div class="s">${x.s}</div></div>${icon('arrowRight', 'sm')}</button>`).join('')
          : `<div class="empty"><b>Ничего не нашлось</b><p class="small">Спросите помощника — он подскажет.</p></div>`;
        out.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => go(shown[Number(b.dataset.i)]));
      };
      const go = (x) => { close(); if (x.h === 'assistant') openAssistant(state); else location.hash = x.h; };
      q.oninput = () => { sel = 0; draw(); };
      q.onkeydown = (e) => {
        if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
        if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
        if (e.key === 'Enter' && shown[sel]) go(shown[sel]);
      };
      draw();
    },
  });
}
