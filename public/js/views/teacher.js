// Кабинет преподавателя: расписание, отметка посещаемости, задания к парам, заявки на перенос, мероприятия.
import { api, esc, icon, fmt, parseISO, isoDate, addDays, todayISO, empty, sheet, toast, kindClass, plural } from '../lib.js';
import { eventForm, bindEventForm } from './events.js';
import { clusters } from './schedule.js';

const RS_STATUS = { pending: ['warn', 'на согласовании'], approved: ['ok', 'одобрено'], rejected: ['bad', 'отклонено'] };

export async function renderSchedule(ctx) {
  ctx.setTitle('Мое расписание');
  const sel = ctx.params.date && /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.date) ? ctx.params.date : todayISO();
  const d0 = parseISO(sel);
  const monday = addDays(d0, -((d0.getDay() + 6) % 7));
  const data = await api(`/teacher/schedule?from=${isoDate(monday)}`);
  if (!ctx.isCurrent()) return;
  const total = data.days.reduce((s, d) => s + d.lessons.length, 0);
  ctx.el.innerHTML = `<div class="page stack">
    <div class="row wrap between"><div class="row"><a class="icon-btn" href="#/teacher/${isoDate(addDays(monday, -7))}" aria-label="Предыдущая неделя">${icon('chevronLeft')}</a>
      <div><b>${fmt.dmShort(monday)} — ${fmt.dmShort(addDays(monday, 6))}</b><div class="xs faint">${total} ${plural(total, 'пара', 'пары', 'пар')} · ${data.subjects.map((x) => `${esc(x.subject)} (${esc(x.group)})`).join(', ')}</div></div>
      <a class="icon-btn" href="#/teacher/${isoDate(addDays(monday, 7))}" aria-label="Следующая неделя">${icon('chevronRight')}</a></div>
      ${sel !== todayISO() ? '<a class="btn sm ghost" href="#/teacher">Эта неделя</a>' : ''}</div>
    <p class="small muted">Нажмите на пару, чтобы отметить посещаемость, дать задание с дедлайном или попросить перенос.</p>
    <div class="grid c3">${data.days.filter((d) => parseISO(d.date).getDay() !== 0).map((d) => `<section class="card"><div class="card-h"><h2 style="${d.date === todayISO() ? 'color:var(--brand)' : ''}">${fmt.wd(parseISO(d.date)).toUpperCase()}, ${fmt.dmShort(parseISO(d.date))}</h2></div>
      ${d.lessons.length ? clusters(d.lessons).map((g) => `<div class="${g.length > 1 ? 'wl-cluster' : 'stack'}" style="--n:${g.length};gap:6px;margin-bottom:6px">${g.map((l) => `<div class="wl ${kindClass(l.kind)} ${['cancel', 'move'].includes(l.change?.type) ? 'cancel' : l.change ? 'changed' : ''} click" tabindex="0" data-tl="${esc(l.group)}|${d.date}|${l.start}">
        <div class="faint">${l.start}–${l.end} · ${esc(l.group)}</div><b>${esc(l.subject)}</b><div class="faint">${esc(l.kind)} · ${esc(l.room)}</div>
        ${l.pending ? `<div class="xs" style="color:var(--info);font-weight:800">${icon('clock', 'sm')} перенос на согласовании</div>` : ''}
        ${l.change && !['retake', 'event'].includes(l.change.type) ? `<div class="xs" style="color:var(--warn);font-weight:800">${l.change.type === 'move' ? 'Перенесена' : l.change.type === 'moved_in' ? 'Перенесена сюда' : l.change.type === 'cancel' ? 'Отменена' : 'Изменение'}</div>` : ''}</div>`).join('')}</div>`).join('')
      : '<p class="small faint">Пар нет</p>'}</section>`).join('')}</div></div>`;
  const open = (el) => { const [g, date, start] = el.dataset.tl.split('|'); openTeacherLesson(g, date, start, () => renderSchedule(ctx)); };
  ctx.el.querySelectorAll('[data-tl]').forEach((el) => { el.onclick = () => open(el); el.onkeydown = (e) => { if (e.key === 'Enter') open(el); }; });
}

async function openTeacherLesson(group, date, start, refresh) {
  let l;
  try { l = await api(`/teacher/lesson?group=${encodeURIComponent(group)}&date=${date}&start=${encodeURIComponent(start)}`); } catch (e) { toast(e.message, 'bad'); return; }
  const off = ['cancel', 'move'].includes(l.change?.type);
  const nextWeek = isoDate(addDays(parseISO(date), 7));
  sheet(`<div class="sheet-h"><h2>${esc(l.subject)}</h2><button class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
    <div class="small muted">${esc(l.group)} · ${fmt.wdFull(parseISO(date))}, ${fmt.dm(parseISO(date))} · ${l.start}–${l.end} · ${esc(l.room)}</div>
    <div class="seg" style="margin:14px 0" role="tablist"><button class="on" data-tab="att">Посещаемость</button><button data-tab="task">Задания</button><button data-tab="move">Перенос</button></div>
    <div data-pane="att">${off ? '<p class="small muted">Пара отменена или перенесена.</p>' : !l.can_mark ? '<p class="small muted">Посещаемость отмечается в день пары.</p>' : `
      <form id="attf">${l.students.map((s) => `<label class="row between" style="padding:10px 0;border-top:1px solid var(--line)"><span><b>${esc(s.name)}</b><div class="xs faint">посещаемость по дисциплине ${s.attendance}%</div></span>
        <span class="row small"><input type="checkbox" name="absent" value="${s.id}" ${s.absent ? 'checked' : ''}> отсутствовал(а)</span></label>`).join('')}
      <button class="btn block" style="margin-top:12px">${icon('check', 'sm')} Сохранить посещаемость</button></form>`}</div>
    <div data-pane="task" hidden>
      ${l.tasks.length ? l.tasks.map((t) => `<div class="card" style="padding:10px 12px;margin-bottom:8px"><b>${esc(t.title)}</b><div class="xs faint">до ${esc(fmt.dateTime(t.due_at))}</div>${t.description ? `<div class="small muted" style="margin-top:4px">${esc(t.description)}</div>` : ''}</div>`).join('') : '<p class="small muted">К этой паре заданий пока нет.</p>'}
      <form id="taskf" class="stack" style="gap:0;margin-top:8px"><div id="taskerr"></div>
        <div class="field"><label for="tt">Задание</label><input class="input" id="tt" maxlength="140" placeholder="Например: эссе о торговых войнах"></div>
        <div class="field"><label for="td">Описание</label><textarea class="input" id="td" maxlength="2000" style="min-height:80px"></textarea></div>
        <div class="grid c2" style="gap:0 12px"><div class="field"><label for="tdd">Срок: дата</label><input class="input" type="date" id="tdd" value="${nextWeek}"></div>
        <div class="field"><label for="tdt">время</label><input class="input" type="time" id="tdt" value="18:00"></div></div>
        <button class="btn">${icon('plus', 'sm')} Добавить задание и дедлайн</button></form></div>
    <div data-pane="move" hidden>
      ${l.pending_reschedule ? `<div class="change-note warn" style="display:flex">${icon('clock', 'sm')} Заявка на перенос на ${fmt.dmShort(parseISO(l.pending_reschedule.to_date))} ${l.pending_reschedule.to_start} ждет решения деканата</div>` : off ? '<p class="small muted">Пара уже отменена или перенесена.</p>' : `
      <form id="movef"><div id="moveerr"></div>
        <div class="grid c3" style="gap:0 12px"><div class="field"><label for="md">Новая дата</label><input class="input" type="date" id="md" value="${nextWeek}"></div>
        <div class="field"><label for="ms">Начало</label><input class="input" type="time" id="ms" value="${l.start}"></div>
        <div class="field"><label for="me">Окончание</label><input class="input" type="time" id="me" value="${l.end}"></div></div>
        <div class="field"><label for="mr">Аудитория</label><input class="input" id="mr" maxlength="40" value="${esc(l.room)}"></div>
        <div class="field"><label for="mw">Причина</label><input class="input" id="mw" maxlength="500"></div>
        <button class="btn">${icon('send', 'sm')} Отправить на согласование в деканат</button>
        <p class="xs faint" style="margin-top:8px">После одобрения студенты увидят перенос в расписании, а вам придет уведомление.</p></form>`}</div>`,
  { label: l.subject, onMount(box, close) {
    box.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => {
      box.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      box.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    });
    box.querySelector('#attf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const absent = [...e.target.querySelectorAll('input[name=absent]:checked')].map((x) => Number(x.value));
      try { const r = await api('/teacher/attendance', { method: 'POST', body: { group, date, start, absent } }); toast(`Сохранено · отсутствуют: ${r.absent}`); close(); refresh?.(); } catch (err) { toast(err.message, 'bad'); }
    });
    box.querySelector('#taskf')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = (id) => box.querySelector(id).value;
      try { await api('/teacher/assignments', { method: 'POST', body: { group, date, start, title: v('#tt'), description: v('#td'), due_date: v('#tdd'), due_time: v('#tdt') } }); toast('Задание добавлено, группа получила уведомление'); close(); }
      catch (err) { box.querySelector('#taskerr').innerHTML = `<div class="form-error">${esc(err.message)}</div>`; }
    });
    box.querySelector('#movef')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = (id) => box.querySelector(id).value;
      try { await api('/teacher/reschedules', { method: 'POST', body: { group, date, start, to_date: v('#md'), to_start: v('#ms'), to_end: v('#me'), to_room: v('#mr'), reason: v('#mw') } }); toast('Заявка отправлена в деканат'); close(); refresh?.(); window.dispatchEvent(new Event('orbita:badges')); }
      catch (err) { box.querySelector('#moveerr').innerHTML = `<div class="form-error">${icon('alert', 'sm')} ${esc(err.message)}</div>`; }
    });
  } });
}

export async function renderAttendance(ctx) {
  ctx.setTitle('Посещаемость');
  const list = await api('/teacher/attendance');
  if (!ctx.isCurrent()) return;
  ctx.el.innerHTML = `<div class="page grid c2" style="align-items:start">${list.map((g) => `<section class="card"><div class="card-h"><h2>${esc(g.subject)}</h2><span class="chip">${esc(g.group)}</span></div>
    ${g.students.length ? g.students.map((s) => `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="row between"><b>${esc(s.name)}</b><span class="small">${s.attendance}% · пропущено пар: ${s.missed}</span></div>
      <div class="progress ${s.attendance >= 80 ? 'ok' : s.attendance >= 60 ? 'watch' : 'risk'}" style="margin-top:6px"><i style="width:${s.attendance}%"></i></div></div>`).join('') : empty('users', 'В группе нет студентов')}</section>`).join('')}</div>`;
}

export async function renderReschedules(ctx) {
  ctx.setTitle('Переносы пар');
  const list = await api('/teacher/reschedules');
  if (!ctx.isCurrent()) return;
  ctx.el.innerHTML = `<div class="page stack"><p class="small muted">Перенос пары создается из расписания: нажмите на пару → «Перенос». Деканат согласует заявку, после этого студенты увидят изменение.</p>
    <section class="card pad-0">${list.length ? list.map((x) => `<div class="li"><div class="ico ${RS_STATUS[x.status][0]}">${icon('calendar')}</div><div class="grow"><div class="t">${esc(x.subject)} · ${esc(x.group_name)}</div>
      <div class="s">${fmt.dmShort(parseISO(x.from_date))} ${x.from_start} → ${fmt.dmShort(parseISO(x.to_date))} ${x.to_start}–${x.to_end} · ${esc(x.to_room || '')}</div>${x.staff_comment ? `<div class="xs faint">Деканат: ${esc(x.staff_comment)}</div>` : ''}</div>
      <span class="chip ${RS_STATUS[x.status][0]}">${RS_STATUS[x.status][1]}</span></div>`).join('') : `<div style="padding:8px 16px">${empty('calendar', 'Заявок на перенос нет')}</div>`}</section></div>`;
}

export async function renderEventNew(ctx) {
  ctx.setTitle('Новое мероприятие');
  const data = await api(`/teacher/schedule?from=${todayISO()}`);
  if (!ctx.isCurrent()) return;
  const groups = [...new Set(data.subjects.map((x) => x.group))];
  ctx.el.innerHTML = `<div class="page grid c2" style="align-items:start">${eventForm([['all', 'Всем студентам'], ...groups.map((g) => [`group:${g}`, `Группа ${g}`])])}
    <div class="card small muted"><b style="color:var(--text)">Как это увидят студенты</b><p style="margin-top:6px">Мероприятие появится в ленте с кнопкой «Добавить в календарь». Если оно пересекается с парами студента, ему покажут предупреждение.</p></div></div>`;
  bindEventForm(ctx.el, (id) => { location.hash = `#/events/${id}`; });
}
