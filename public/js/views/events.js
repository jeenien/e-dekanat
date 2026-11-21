// Мероприятия: страница с описанием, «Добавить в календарь» с предупреждением о пересечениях,
// форма создания для деканата и преподавателя.
import { api, esc, icon, fmt, parseISO, sheet, toast, todayISO } from '../lib.js';

const when = (e) => `${fmt.wdFull(parseISO(e.start_at))}, ${fmt.dm(parseISO(e.start_at))} · ${e.start_at.slice(11, 16)}–${e.end_at.slice(11, 16)}`;

// Добавить в свой календарь. Если есть пересечения — спрашиваем подтверждение.
export async function addToCalendar(eventId, onDone) {
  try {
    await api(`/events/${eventId}/add`, { method: 'POST', body: {} });
    toast('Добавлено в календарь'); onDone?.(true);
  } catch (e) {
    if (e.status !== 409) { toast(e.message, 'bad'); return; }
    sheet(`<div class="sheet-h"><h2>Пересечение с расписанием</h2><button class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
      <div class="form-error" style="display:flex;gap:8px">${icon('alert', 'sm')}<div>Мероприятие пересекается:<ul style="margin:6px 0 0;padding-left:18px">${e.body.conflicts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div></div>
      <p class="small muted">В расписании оба события встанут рядом, чтобы вы видели пересечение. Пропуск пары при этом не отменяется.</p>
      <div class="row wrap" style="margin-top:14px"><button class="btn" id="force">Все равно добавить</button><button class="btn ghost" data-close>Отмена</button></div>`,
    { label: 'Пересечение', onMount(box, close) {
      box.querySelector('#force').onclick = async () => {
        try { await api(`/events/${eventId}/add`, { method: 'POST', body: { force: true } }); close(); toast('Добавлено в календарь'); onDone?.(true); }
        catch (err) { toast(err.message, 'bad'); }
      };
    } });
  }
}
export async function removeFromCalendar(eventId, onDone) {
  try { await api(`/events/${eventId}/remove`, { method: 'POST' }); toast('Убрано из календаря'); onDone?.(false); } catch (e) { toast(e.message, 'bad'); }
}
export const calendarButton = (id, added, small = true) => added
  ? `<button class="btn ${small ? 'sm' : ''} soft" data-cal="${id}" data-added="1">${icon('check', 'sm')} В календаре</button>`
  : `<button class="btn ${small ? 'sm' : ''}" data-cal="${id}">${icon('calendarPlus', 'sm')} Добавить в календарь</button>`;
export function bindCalendarButtons(root, refresh) {
  root.querySelectorAll('[data-cal]').forEach((b) => b.onclick = (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const id = Number(b.dataset.cal);
    if (b.dataset.added) removeFromCalendar(id, refresh); else addToCalendar(id, refresh);
  });
}

export async function renderEvent(ctx) {
  ctx.setTitle('Мероприятие', '#/notifications');
  const e = await api(`/events/${encodeURIComponent(ctx.params.id)}`);
  if (!ctx.isCurrent()) return;
  const isStudent = ctx.state.user.role === 'student';
  ctx.el.innerHTML = `<div class="page grid c2" style="align-items:start">
    <article class="card"><span class="chip info">${icon('megaphone', 'sm')} Мероприятие</span>
      <h2 style="font-size:22px;margin:10px 0 6px">${esc(e.title)}</h2>
      <div class="stack" style="gap:6px;margin:10px 0 14px">
        <div class="row small">${icon('clock', 'sm')} ${esc(when(e))}</div>
        <div class="row small">${icon('map', 'sm')} ${esc(e.place)}</div>
        ${e.organizer ? `<div class="row small">${icon('users', 'sm')} ${esc(e.organizer)}</div>` : ''}
      </div>
      <div style="white-space:pre-wrap">${esc(e.description)}</div>
      <div class="row wrap" style="margin-top:18px">${isStudent ? calendarButton(e.id, e.added, false) : ''}
        <a class="btn ghost" href="/api/events/${e.id}/ics" download>${icon('download', 'sm')} Файл для календаря телефона</a></div>
    </article>
    ${isStudent ? `<aside class="card">${e.conflicts?.length ? `<b style="color:var(--warn)">${icon('alert', 'sm')} Пересекается с расписанием</b><ul class="small" style="padding-left:18px;margin:8px 0 0">${e.conflicts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
      : `<b style="color:var(--ok)">${icon('checkCircle', 'sm')} Не пересекается с вашими парами</b>`}
      <p class="small muted" style="margin-top:10px">Добавленные мероприятия видны в расписании рядом с парами.</p>
      <a class="link small" href="#/schedule/${e.start_at.slice(0, 10)}" style="margin-top:6px">Открыть этот день в расписании ${icon('arrowRight', 'sm')}</a></aside>` : ''}
  </div>`;
  bindCalendarButtons(ctx.el, () => renderEvent(ctx));
}

// Форма нового мероприятия (деканат и преподаватель)
export function eventForm(audiences) {
  return `<form class="card" id="evf" novalidate><div id="everr"></div>
    <div class="field"><label for="et">Название</label><input class="input" id="et" maxlength="140"></div>
    <div class="grid c3" style="gap:0 12px"><div class="field"><label for="ed">Дата</label><input class="input" type="date" id="ed" value="${todayISO()}"></div>
      <div class="field"><label for="es">Начало</label><input class="input" type="time" id="es" value="18:00"></div>
      <div class="field"><label for="ee">Окончание</label><input class="input" type="time" id="ee" value="19:30"></div></div>
    <div class="field"><label for="ep">Место</label><input class="input" id="ep" maxlength="120" placeholder="Например: актовый зал (Корпус МО)"></div>
    <div class="field"><label for="ea">Для кого</label><select class="input" id="ea">${audiences.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>
    <div class="field"><label for="eds">Описание</label><textarea class="input" id="eds" maxlength="4000" placeholder="Что будет, кому интересно, нужна ли регистрация"></textarea></div>
    <button class="btn">${icon('megaphone', 'sm')} Опубликовать мероприятие</button></form>`;
}
export function bindEventForm(root, onDone) {
  const f = root.querySelector('#evf');
  const v = (id) => f.querySelector(id).value;
  f.onsubmit = async (e) => {
    e.preventDefault(); f.querySelector('#everr').innerHTML = '';
    try {
      const r = await api('/events', { method: 'POST', body: { title: v('#et'), date: v('#ed'), start: v('#es'), end: v('#ee'), place: v('#ep'), audience: v('#ea'), description: v('#eds') } });
      toast('Мероприятие опубликовано в ленте'); onDone?.(r.id);
    } catch (err) { f.querySelector('#everr').innerHTML = `<div class="form-error">${esc(err.message)}</div>`; }
  };
}
