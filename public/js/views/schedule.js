// Расписание: лента недели на телефоне, сетка недели на широком экране, изменения подсвечены.
import { api, esc, icon, fmt, parseISO, isoDate, addDays, todayISO, minutes, empty, kindClass, plural, sheet, toast } from '../lib.js';

export function changeLabel(c) {
  return { cancel: 'Отмена', room: 'Новая аудитория', teacher: 'Замена преподавателя', extra: 'Доп. занятие', move: 'Перенос', moved_in: 'Перенесено сюда', retake: 'Пересдача', event: 'Мероприятие' }[c.type] || 'Изменение';
}
function changeNote(l) {
  const c = l.change; if (!c) return '';
  const cls = c.type === 'cancel' ? 'bad' : c.type === 'extra' || c.type === 'moved_in' ? 'info' : 'warn';
  if (c.type === 'event') return '';
  if (c.type === 'retake') return `<div class="change-note bad">${icon('refresh', 'sm')} Ваша пересдача · ${esc(c.note || '')}</div>`;
  let txt = changeLabel(c);
  if (c.type === 'room') txt += `: ${l.room} вместо ${c.old_room}`;
  if (c.type === 'teacher') txt += `: вместо ${c.old_teacher}`;
  if (c.type === 'move' && c.new_date) txt += ` на ${fmt.dmShort(parseISO(c.new_date))}${c.new_start ? `, ${c.new_start}` : c.new_pair ? `, ${c.new_pair} пара` : ''}`;
  if (c.type === 'moved_in' && c.from) txt += ` с ${fmt.dmShort(parseISO(c.from))}`;
  return `<div class="change-note ${cls}">${icon(c.type === 'cancel' ? 'x' : c.type === 'extra' ? 'plus' : 'alert', 'sm')} ${esc(txt)}${c.note ? ` · ${esc(c.note)}` : ''}</div>`;
}

// Атрибуты для клика: пара открывает карточку с заданиями, мероприятие — свою страницу
export const itemAttrs = (l, date) => (l.event_id ? `data-event="${l.event_id}" tabindex="0" role="link"` : `data-lesson="${date}|${l.start}" tabindex="0" role="button"`);

// Пересекающиеся по времени занятия собираем в группы — они встают рядом, как в календаре
export function clusters(lessons) {
  const out = [];
  for (const l of lessons) {
    const last = out[out.length - 1];
    if (last && l.start < last.end) { last.items.push(l); if (l.end > last.end) last.end = l.end; } else out.push({ end: l.end, items: [l] });
  }
  return out.map((c) => c.items);
}

export function lessonHtml(l, date) {
  const isToday = date === todayISO();
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const now = isToday && minutes(l.start) <= nowM && nowM < minutes(l.end) && l.change?.type !== 'cancel';
  const past = isToday && minutes(l.end) <= nowM;
  const off = ['cancel', 'move'].includes(l.change?.type);
  return `<div class="lesson ${kindClass(l.kind)} ${off ? 'cancel' : ''} ${now ? 'now' : ''} ${past && !l.absent ? 'past' : ''} ${l.absent ? 'absent' : ''} click" ${itemAttrs(l, date)}>
    <div class="time">${l.start}<small>${l.end}</small></div>
    <div class="body"><div class="row between" style="align-items:flex-start;gap:8px"><div class="subj">${esc(l.subject)}</div>${now ? '<span class="chip brand">сейчас</span>' : ''}</div>
      <div class="info"><span>${esc(l.kind)}</span><span>${icon(l.online ? 'monitor' : 'map', 'sm')} ${l.change?.type === 'room' ? `<s class="old">${esc(l.change.old_room)}</s>&nbsp;<b>${esc(l.room)}</b>` : esc(l.room)}</span>${l.teacher ? `<span>${icon('teacher', 'sm')} ${esc(l.teacher)}</span>` : ''}</div>
      ${changeNote(l)}
      ${l.absent ? `<div class="absent-note ${l.absent === 'excused' ? 'exc' : ''}">${icon(l.absent === 'excused' ? 'docs' : 'x', 'sm')} ${l.absent === 'excused' ? 'Пропуск по справке' : 'Вы отсутствовали · 2 ак. ч.'}</div>` : ''}
      ${l.online_url && l.change?.type !== 'cancel' ? `<a class="link small" href="${esc(l.online_url)}" target="_blank" rel="noopener" style="margin-top:6px">${icon('ext', 'sm')} Ссылка на онлайн-занятие</a>` : ''}
    </div></div>`;
}

export function dayList(day) {
  if (!day.lessons.length) return empty(parseISO(day.date).getDay() === 0 ? 'coffee' : 'sun', parseISO(day.date).getDay() === 0 ? 'Воскресенье — выходной' : 'Пар нет', 'Свободный день в расписании.');
  const out = [];
  let prevEnd = null;
  for (const group of clusters(day.lessons)) {
    const start = group.reduce((m, x) => (x.start < m ? x.start : m), group[0].start);
    if (prevEnd) {
      const gap = minutes(start) - minutes(prevEnd);
      if (gap >= 30) out.push(`<div class="break">${icon('coffee', 'sm')} Перерыв ${gap >= 90 ? `${Math.floor(gap / 60)} ч ${gap % 60 ? (gap % 60) + ' мин' : ''}` : `${gap} мин`}</div>`);
    }
    out.push(group.length > 1
      ? `<div class="cluster" style="--n:${group.length}"><div class="cluster-h">${icon('alert', 'sm')} Пересечение по времени</div><div class="cluster-row">${group.map((l) => lessonHtml(l, day.date)).join('')}</div></div>`
      : lessonHtml(group[0], day.date));
    prevEnd = group.reduce((m, x) => (x.end > m ? x.end : m), group[0].end);
  }
  return `<div class="day">${out.join('')}</div>`;
}

// Задание: срок либо «к следующей паре», либо своя дата
export function dueText(t) {
  return t.due_kind === 'next_lesson'
    ? `к следующей паре · ${fmt.wd(parseISO(t.due_at))}, ${fmt.dmShort(parseISO(t.due_at))} ${t.due_at.slice(11, 16)}`
    : `срок · ${fmt.dateTime(t.due_at)}`;
}
function taskCard(t, here = false) {
  const hot = !t.done && new Date(t.due_at) - Date.now() < 48 * 3600e3;
  return `<div class="card" style="padding:12px;margin-bottom:8px"><div class="row between" style="align-items:flex-start;gap:8px"><b>${esc(t.title)}</b>
    <span class="chip ${t.done ? 'ok' : hot ? 'bad' : ''}">${t.done ? 'готово' : esc(fmt.until(t.due_at))}</span></div>
    <div class="xs faint" style="margin-top:2px">${esc(dueText(t))}${here && t.lesson_date ? ` · задано ${fmt.dmShort(parseISO(t.lesson_date))}` : ''}</div>
    ${t.description ? `<p class="small muted" style="margin-top:4px">${esc(t.description)}</p>` : ''}</div>`;
}

// Карточка пары: детали и задания с дедлайнами, которые преподаватель прикрепил к этой паре
export async function openLesson(date, start) {
  let l;
  try { l = await api(`/lesson?date=${date}&start=${encodeURIComponent(start)}`); } catch (e) { toast(e.message, 'bad'); return; }
  sheet(`<div class="sheet-h"><h2>${esc(l.subject)}</h2><button class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
    <div class="stack" style="gap:6px">
      <div class="row small">${icon('calendar', 'sm')} ${fmt.wdFull(parseISO(date))}, ${fmt.dm(parseISO(date))} · ${l.start}–${l.end}</div>
      <div class="row small">${icon('map', 'sm')} ${esc(l.room)} · ${esc(l.kind)}</div>
      ${l.teacher ? `<div class="row small">${icon('teacher', 'sm')} ${esc(l.teacher)}</div>` : ''}
      ${changeNote(l)}
    </div>
    ${l.due?.length ? `<div class="section-title">Сдать к этой паре</div>${l.due.map((t) => taskCard(t, true)).join('')}` : ''}
    <div class="section-title">Задано на этой паре</div>
    ${l.tasks.length ? l.tasks.map((t) => taskCard(t)).join('')
      : empty('checkCircle', 'Заданий нет', 'Если преподаватель задаст задание на этой паре, оно появится здесь и в дедлайнах.')}`,
  { label: l.subject });
}

export function bindScheduleClicks(root) {
  const go = (el) => {
    if (el.dataset.event) { location.hash = `#/events/${el.dataset.event}`; return; }
    const [date, start] = el.dataset.lesson.split('|'); openLesson(date, start);
  };
  root.querySelectorAll('[data-lesson], [data-event]').forEach((el) => {
    el.addEventListener('click', (e) => { if (!e.target.closest('a')) go(el); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(el); });
  });
}

export async function render(ctx) {
  ctx.setTitle('Расписание');
  const sel = ctx.params.date && /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.date) ? ctx.params.date : todayISO();
  const selD = parseISO(sel);
  const monday = addDays(selD, -((selD.getDay() + 6) % 7));
  const data = await api(`/schedule?from=${isoDate(monday)}&days=7`);
  if (!ctx.isCurrent()) return;
  const days = data.days;
  const day = days.find((d) => d.date === sel) || days[0];
  const changes = days.reduce((s, d) => s + d.lessons.filter((l) => l.change && !['event', 'retake'].includes(l.change.type)).length, 0);
  const prevW = isoDate(addDays(monday, -7)), nextW = isoDate(addDays(monday, 7));

  ctx.el.innerHTML = `<div class="page stack">
    <div class="row wrap between">
      <div class="row"><a class="icon-btn" href="#/schedule/${prevW}" aria-label="Предыдущая неделя">${icon('chevronLeft')}</a>
        <div><b>${fmt.dmShort(monday)} — ${fmt.dmShort(addDays(monday, 6))}</b><div class="xs faint">${days[0].week}-я неделя · ${days[0].parity === 'odd' ? 'нечетная' : 'четная'} · ${esc(data.group)}</div></div>
        <a class="icon-btn" href="#/schedule/${nextW}" aria-label="Следующая неделя">${icon('chevronRight')}</a></div>
      <div class="row">${sel !== todayISO() ? `<a class="btn sm ghost" href="#/schedule">Сегодня</a>` : ''}
        <a class="btn sm soft" href="/api/schedule.ics" download>${icon('download', 'sm')} <span>Экспорт</span></a></div>
    </div>
    ${changes ? `<div class="chip warn" style="justify-self:start">${icon('alert', 'sm')} На этой неделе ${changes} ${plural(changes, 'изменение', 'изменения', 'изменений')}</div>` : ''}
    <div class="sched-mobile stack">
      <div class="week-strip" role="tablist" aria-label="Дни недели">${days.map((d) => {
        const dd = parseISO(d.date);
        return `<button role="tab" aria-selected="${d.date === day.date}" class="${d.date === day.date ? 'on' : ''} ${d.date === todayISO() ? 'today' : ''}" data-date="${d.date}"><small>${fmt.wd(dd)}</small><b>${dd.getDate()}</b><span class="dots">${d.lessons.slice(0, 4).map((l) => `<i class="${l.change?.type === 'retake' ? 'rt' : l.change ? 'ch' : ''}"></i>`).join('')}</span></button>`;
      }).join('')}</div>
      <section class="card"><div class="card-h"><h2>${fmt.dayTitle(parseISO(day.date))}</h2><span class="chip">${day.lessons.filter((l) => l.change?.type !== 'cancel').length} ${plural(day.lessons.filter((l) => l.change?.type !== 'cancel').length, 'пара', 'пары', 'пар')}</span></div>${dayList(day)}</section>
    </div>
    <div class="week-grid">${days.slice(0, 6).map((d) => {
      const dd = parseISO(d.date);
      return `<div class="col ${d.date === todayISO() ? 'today' : ''}"><h3>${fmt.wd(dd).toUpperCase()} <small>${fmt.dmShort(dd)}</small></h3>
        ${d.lessons.length ? clusters(d.lessons).map((g) => `<div class="${g.length > 1 ? 'wl-cluster' : ''}" style="--n:${g.length}">${g.map((l) => `<div class="wl ${kindClass(l.kind)} ${['cancel', 'move'].includes(l.change?.type) ? 'cancel' : ['retake', 'event'].includes(l.change?.type) ? '' : l.change ? 'changed' : ''} ${l.absent ? 'absent' : ''} click" ${itemAttrs(l, d.date)} title="${esc(l.subject)}">
          <div class="faint">${l.pair ? `${l.pair} · ` : ''}${l.start}–${l.end}</div><b>${esc(l.subject)}</b><div class="faint">${esc(l.kind)} · ${esc(l.room)}</div>${l.teacher ? `<div class="faint">${esc(l.teacher)}</div>` : ''}
          ${l.absent ? `<div class="xs" style="color:${l.absent === 'excused' ? 'var(--info)' : 'var(--bad)'};font-weight:800;margin-top:2px">${l.absent === 'excused' ? 'пропуск по справке' : 'вы отсутствовали'}</div>` : ''}
          ${l.change && l.change.type !== 'event' ? `<div class="xs" style="color:${['cancel', 'retake', 'move'].includes(l.change.type) ? 'var(--bad)' : 'var(--warn)'};font-weight:800;margin-top:2px">${esc(changeLabel(l.change))}</div>` : ''}</div>`).join('')}</div>`).join('') : '<div class="faint small" style="padding:8px 2px">Пар нет</div>'}</div>`;
    }).join('')}</div>
    <div class="legend"><span><i class="sw lec"></i>лекция</span><span><i class="sw prac"></i>семинар</span><span><i class="sw oth"></i>консультация</span><span><i class="sw sw-ev"></i>мероприятие</span><span><i class="sw" style="background:var(--warn)"></i>изменение</span><span><i class="sw" style="background:var(--bad)"></i>пересдача</span><span><i class="sw abs"></i>пропуск</span></div>
  </div>`;
  bindScheduleClicks(ctx.el);
  if (ctx.params.open) { const st = ctx.params.open; ctx.params.open = undefined; openLesson(sel, st); }
  ctx.el.querySelectorAll('.week-strip [data-date]').forEach((b) => b.onclick = () => { history.replaceState(null, '', `#/schedule/${b.dataset.date}`); ctx.params.date = b.dataset.date; render(ctx); });
}
