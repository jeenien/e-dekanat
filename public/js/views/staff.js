// Кабинет сотрудника деканата: очередь заявок, ответы студентам, объявления, изменения расписания.
const LABELS = { purpose: 'Назначение', format: 'Формат', copies: 'Экземпляров', comment: 'Комментарий', lang: 'Язык', period: 'Период', office: 'Военкомат', discipline: 'Дисциплина', preferred: 'Удобные даты', reason: 'Основание', details: 'Подробности', from: 'С даты', slot: 'Время приема', topic: 'Тема', text: 'Текст' };
const VALUES = { electronic: 'электронная', paper: 'бумажная', ru: 'русский', en: 'английский' };
import { api, esc, icon, fmt, parseISO, empty, statusChip, toast, todayISO, plural } from '../lib.js';
import { hmin, campusBars, passDays, absenceList } from './campus.js';
import { absenceMeter, absenceText } from './today.js';
import { eventForm, bindEventForm } from './events.js';

const FILTERS = [['', 'Все'], ['submitted', 'Новые'], ['in_progress', 'В работе'], ['need_info', 'Ждут студента'], ['ready', 'Готовы'], ['done', 'Завершены'], ['rejected', 'Отклонены']];
let filter = 'submitted';

export async function renderQueue(ctx) {
  ctx.setTitle('Очередь заявок');
  const [stats, list] = await Promise.all([api('/staff/stats'), api(`/staff/requests?status=${filter}`)]);
  if (!ctx.isCurrent()) return;
  const by = stats.by_status;
  ctx.el.innerHTML = `<div class="page stack">
    <div class="grid c3">
      <div class="card"><div class="small muted">Новые</div><b style="font-size:28px">${by.submitted || 0}</b></div>
      <div class="card"><div class="small muted">В работе / ждут студента</div><b style="font-size:28px">${(by.in_progress || 0) + (by.need_info || 0)}</b>${stats.overdue ? ` <span class="chip bad">${stats.overdue} просрочено</span>` : ''}</div>
      <div class="card"><div class="small muted">Оценка студентов</div><b style="font-size:28px">${stats.rating ?? '—'}</b> <span class="small faint">${stats.rated ? `по ${stats.rated} отзывам` : 'пока нет отзывов'}</span></div>
    </div>
    <div class="row wrap"><div class="seg scroll" style="flex:1;min-width:0">${FILTERS.map(([k, t]) => `<button class="${k === filter ? 'on' : ''}" data-f="${k}">${t}${k && by[k] ? ` · ${by[k]}` : ''}</button>`).join('')}</div>
      <input class="input" id="q" placeholder="Поиск: ФИО, группа, номер" style="max-width:280px;min-height:44px"></div>
    <section class="card pad-0" id="tbl"></section></div>`;
  const tbl = ctx.el.querySelector('#tbl');
  const draw = (rows) => {
    tbl.innerHTML = rows.length ? `<div class="table-wrap"><table class="table resp"><thead><tr><th>Заявка</th><th>Студент</th><th>Статус</th><th>Обновлено</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-id="${esc(r.id)}" tabindex="0"><td><b>${esc(r.title)}</b><div class="xs faint">${esc(r.id)}</div></td><td>${esc(r.student.name)}<div class="xs faint">${esc(r.student.group)} · ${r.student.course} курс</div></td><td>${statusChip(r)}${r.eta && r.eta < todayISO() && ['submitted', 'in_progress'].includes(r.status) ? ' <span class="chip bad">срок!</span>' : ''}</td><td class="small muted">${fmt.ago(r.updated_at)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div style="padding:8px 16px">${empty('checkCircle', 'Очередь пуста', 'Все заявки в этом статусе обработаны.')}</div>`;
    tbl.querySelectorAll('[data-id]').forEach((tr) => {
      const go = () => { location.hash = `#/staff/requests/${encodeURIComponent(tr.dataset.id)}`; };
      tr.onclick = go; tr.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
  };
  draw(list);
  ctx.el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; renderQueue(ctx); });
  let timer;
  ctx.el.querySelector('#q').oninput = (e) => { clearTimeout(timer); timer = setTimeout(async () => draw(await api(`/staff/requests?status=${filter}&q=${encodeURIComponent(e.target.value)}`)), 250); };
}

export async function renderRequest(ctx) {
  ctx.setTitle('Заявка', '#/staff');
  const r = await api(`/staff/requests/${encodeURIComponent(ctx.params.id)}`);
  if (!ctx.isCurrent()) return;
  ctx.setTitle(r.title, '#/staff');
  const actions = [['in_progress', 'Взять в работу', 'soft'], ['need_info', 'Запросить уточнение', 'ghost'], ['ready', 'Готово', ''], ['done', 'Выдано / закрыть', 'ghost'], ['rejected', 'Отклонить', 'danger']].filter(([s]) => s !== r.status);
  ctx.el.innerHTML = `<div class="page grid c2" style="align-items:start">
    <div class="stack">
      <section class="card"><div class="row between"><div class="xs faint">${esc(r.id)} · ${fmt.dateTime(r.created_at)}</div>${statusChip(r)}</div>
        <h2 style="font-size:20px;margin:6px 0 12px">${esc(r.title)}</h2>
        <dl class="kv"><dt>Студент</dt><dd>${esc(r.student.name)}</dd><dt>Группа</dt><dd>${esc(r.student.group)}, ${r.student.course} курс</dd><dt>Факультет</dt><dd>${esc(r.student.faculty)}</dd><dt>Основа</dt><dd>${esc(r.student.funding)}</dd>
        ${Object.entries(r.payload).map(([k, v]) => `<dt>${esc(LABELS[k] || k)}</dt><dd>${esc(VALUES[v] || (k === 'slot' ? String(v).replace('T', ' ') : v))}</dd>`).join('')}${r.eta ? `<dt>Срок</dt><dd>${fmt.dm(parseISO(r.eta))}</dd>` : ''}</dl></section>
      <form class="card" id="st"><h2 style="font-size:17px;margin-bottom:10px">Сменить статус</h2>
        <div class="field"><label for="cm">Комментарий для студента</label><textarea class="input" id="cm" maxlength="2000" placeholder="Обязателен при запросе уточнения и отказе"></textarea></div>
        <div class="row wrap">${actions.map(([s, t, c]) => `<button type="button" class="btn sm ${c}" data-s="${s}">${t}</button>`).join('')}</div></form>
    </div>
    <section class="card"><h2 style="font-size:17px;margin-bottom:12px">История и переписка</h2>
      <div class="timeline">${r.events.map((e) => `<div class="ev"><div class="pt">${icon(e.kind === 'message' ? 'message' : 'info')}</div><div><div class="small"><b>${esc(e.kind === 'message' ? (e.author_role === 'student' ? 'Студент' : e.author_name) : e.status_label)}</b> <span class="xs faint">· ${fmt.ago(e.created_at)}</span></div>${e.text ? `<div class="bubble ${e.author_role === 'staff' ? 'mine' : ''}">${esc(e.text)}</div>` : ''}</div></div>`).join('')}</div>
      <form class="composer" id="msg"><textarea class="input" maxlength="2000" placeholder="Ответить студенту…" aria-label="Сообщение"></textarea><button class="btn" aria-label="Отправить">${icon('send')}</button></form></section></div>`;
  ctx.el.querySelectorAll('[data-s]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await api(`/staff/requests/${encodeURIComponent(r.id)}/status`, { method: 'POST', body: { status: b.dataset.s, comment: ctx.el.querySelector('#cm').value } }); toast('Статус обновлен, студент получил уведомление'); renderRequest(ctx); }
    catch (e) { toast(e.message, 'bad'); b.disabled = false; }
  });
  ctx.el.querySelector('#msg').onsubmit = async (e) => {
    e.preventDefault();
    const ta = e.currentTarget.querySelector('textarea');
    try { await api(`/staff/requests/${encodeURIComponent(r.id)}/messages`, { method: 'POST', body: { text: ta.value } }); toast('Отправлено'); renderRequest(ctx); }
    catch (err) { toast(err.message, 'bad'); }
  };
}

export async function renderAnnounce(ctx) {
  ctx.setTitle('Объявления и мероприятия');
  const groups = await api('/staff/groups');
  if (!ctx.isCurrent()) return;
  const faculties = [...new Set(groups.map((g) => g.faculty))];
  const aud = [['all', 'Всем студентам'], ...faculties.map((f) => [`faculty:${f}`, f]), ...groups.map((g) => [`group:${g.group}`, `Группа ${g.group}`])];
  const mode = ctx.params.mode === 'event' ? 'event' : 'news';
  ctx.el.innerHTML = `<div class="page stack"><div class="seg" style="max-width:420px"><button class="${mode === 'news' ? 'on' : ''}" data-m="news">Объявление</button><button class="${mode === 'event' ? 'on' : ''}" data-m="event">Мероприятие</button></div>
    <div class="grid c2" style="align-items:start">${mode === 'event' ? eventForm(aud) : `<form class="card" id="an" novalidate>
    <div class="field"><label for="aud">Кому</label><select class="input" id="aud">${aud.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>
    <div class="field"><label for="tt">Заголовок</label><input class="input" id="tt" maxlength="140"></div>
    <div class="field"><label for="bd">Текст</label><textarea class="input" id="bd" maxlength="3000"></textarea></div>
    <label class="row small" style="margin-bottom:14px"><input type="checkbox" id="imp"> Важное (выделить в ленте)</label>
    <button class="btn">${icon('megaphone')} Опубликовать</button></form>`}
    <div class="card small muted"><b style="color:var(--text)">Подсказка</b><p style="margin-top:6px">${mode === 'event' ? 'Мероприятие появится в ленте с кнопкой «Добавить в календарь» и отдельной страницей с описанием. Студенту покажут, если оно пересекается с его парами.' : 'Объявление сразу появится в ленте выбранных студентов и на их главном экране. Пишите коротко: что, когда, что нужно сделать.'}</p></div></div></div>`;
  ctx.el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { location.hash = b.dataset.m === 'event' ? '#/staff/announce/event' : '#/staff/announce'; });
  if (mode === 'event') { bindEventForm(ctx.el, (id) => { location.hash = `#/events/${id}`; }); return; }
  ctx.el.querySelector('#an').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/staff/notifications', { method: 'POST', body: { audience: ctx.el.querySelector('#aud').value, title: ctx.el.querySelector('#tt').value, body: ctx.el.querySelector('#bd').value, important: ctx.el.querySelector('#imp').checked } }); toast('Опубликовано'); e.target.reset(); }
    catch (err) { toast(err.message, 'bad'); }
  };
}

// Заявки преподавателей на перенос пар
async function rescheduleQueue(root) {
  const list = await api('/staff/reschedules');
  const ST = { pending: ['warn', 'ждет решения'], approved: ['ok', 'одобрено'], rejected: ['bad', 'отклонено'] };
  root.innerHTML = list.length ? list.map((x) => `<div style="padding:12px 0;border-top:1px solid var(--line)"><div class="row between" style="align-items:flex-start"><div><b>${esc(x.subject)}</b> · ${esc(x.group_name)}<div class="small muted">${esc(x.teacher)}: ${fmt.dmShort(parseISO(x.from_date))} ${x.from_start} → <b>${fmt.dmShort(parseISO(x.to_date))} ${x.to_start}–${x.to_end}</b>, ${esc(x.to_room || '')}</div>
      <div class="xs faint">Причина: ${esc(x.reason || '—')}</div></div><span class="chip ${ST[x.status][0]}">${ST[x.status][1]}</span></div>
      ${x.status === 'pending' ? `<div class="row wrap" style="margin-top:8px"><input class="input" data-c="${x.id}" placeholder="Комментарий (обязателен при отказе)" style="flex:1;min-width:180px;min-height:40px"><button class="btn sm" data-ok="${x.id}">${icon('check', 'sm')} Одобрить</button><button class="btn sm danger" data-no="${x.id}">Отклонить</button></div>` : ''}</div>`).join('')
    : empty('checkCircle', 'Заявок на перенос нет');
  const decide = async (id, decision) => {
    try { await api(`/staff/reschedules/${id}`, { method: 'POST', body: { decision, comment: root.querySelector(`[data-c="${id}"]`)?.value || '' } }); toast(decision === 'approve' ? 'Перенос одобрен, группа и преподаватель уведомлены' : 'Заявка отклонена'); rescheduleQueue(root); }
    catch (err) { toast(err.message, 'bad'); }
  };
  root.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => decide(b.dataset.ok, 'approve'));
  root.querySelectorAll('[data-no]').forEach((b) => b.onclick = () => decide(b.dataset.no, 'reject'));
}

export async function renderSchedule(ctx) {
  ctx.setTitle('Расписание');
  const groups = await api('/staff/groups');
  if (!ctx.isCurrent()) return;
  ctx.el.innerHTML = `<div class="page stack"><div class="grid c2" style="align-items:start"><form class="card" id="sc" novalidate>
    <div id="err"></div>
    <div class="grid c2" style="gap:0 12px"><div class="field"><label for="g">Группа</label><select class="input" id="g">${groups.map((g) => `<option>${esc(g.group)}</option>`).join('')}</select></div>
    <div class="field"><label for="d">Дата</label><input class="input" type="date" id="d" value="${todayISO()}"></div></div>
    <div class="field"><span class="lbl">Что делаем</span><div class="seg"><button type="button" class="on" data-t="extra">Поставить пару</button><button type="button" data-t="room">Сменить аудиторию</button><button type="button" data-t="cancel">Отменить</button></div></div>
    <div id="pairs" class="field" hidden></div>
    <div id="extraf">
      <div class="grid c2" style="gap:0 12px"><div class="field"><label for="st">Начало</label><input class="input" type="time" id="st" value="16:00" step="300"></div>
      <div class="field"><label for="en">Окончание</label><input class="input" type="time" id="en" value="17:20" step="300"></div></div>
      <div class="field"><label for="sj">Дисциплина</label><input class="input" id="sj" maxlength="150" list="subjects"><datalist id="subjects"></datalist></div>
      <div class="grid c2" style="gap:0 12px"><div class="field"><label for="kd">Вид</label><select class="input" id="kd"><option>Семинар</option><option>Лекция</option><option>Консультация</option></select></div>
      <div class="field"><label for="xr">Аудитория</label><input class="input" id="xr" maxlength="40" placeholder="Например: 4138 (Корпус МО)"></div></div>
    </div>
    <div class="field" id="roomf" hidden><label for="rm">Новая аудитория</label><input class="input" id="rm" maxlength="30" placeholder="Например: 4138 (Корпус МО)"></div>
    <div class="field"><label for="nt">Комментарий для студентов</label><input class="input" id="nt" maxlength="200"></div>
    <button class="btn">Сохранить и уведомить группу</button></form>
    <section class="card"><div class="card-h"><h2>Пары группы в этот день</h2></div><div id="dayview"></div>
      <p class="xs faint" style="margin-top:10px">Новую пару нельзя поставить на время, занятое другой парой: система подскажет, с чем она пересекается.</p></section></div>
    <section class="card"><div class="card-h"><h2>Заявки преподавателей на перенос</h2></div><div id="rsq"></div></section></div>`;
  let type = 'extra';
  const form = ctx.el.querySelector('#sc');
  const v = (id) => form.querySelector(id).value;
  const showErr = (msg) => { form.querySelector('#err').innerHTML = msg ? `<div class="form-error" role="alert">${icon('alert', 'sm')} ${esc(msg)}</div>` : ''; };
  const loadDay = async () => {
    const box = ctx.el.querySelector('#pairs');
    const view = ctx.el.querySelector('#dayview');
    try {
      const day = await api(`/staff/schedule?group=${encodeURIComponent(v('#g'))}&date=${v('#d')}`);
      box.innerHTML = `<label for="p">Пара</label>${day.lessons.length ? `<select class="input" id="p">${day.lessons.filter((l) => l.pair).map((l) => `<option value="${l.pair}">${l.pair} пара · ${l.start} · ${esc(l.subject)}${l.change ? ' — уже изменена' : ''}</option>`).join('')}</select>` : '<div class="small muted">В этот день у группы нет пар</div>'}`;
      view.innerHTML = day.lessons.length ? day.lessons.map((l) => `<div class="row" style="padding:8px 0;border-top:1px solid var(--line)"><b style="min-width:110px">${l.start}–${l.end}</b><div class="grow"><div>${esc(l.subject)}</div><div class="xs faint">${esc(l.kind)} · ${esc(l.room)}${l.change?.type === 'cancel' ? ' · отменена' : l.change?.type === 'extra' ? ' · добавлена деканатом' : ''}</div></div></div>`).join('')
        : empty('calendar', 'Пар нет', 'Время свободно.');
      const subj = [...new Set(day.lessons.map((l) => l.subject))];
      form.querySelector('#subjects').innerHTML = subj.map((x) => `<option value="${esc(x)}">`).join('');
    } catch (e) { box.innerHTML = `<div class="small" style="color:var(--bad)">${esc(e.message)}</div>`; }
  };
  const applyType = () => {
    form.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x.dataset.t === type));
    form.querySelector('#extraf').hidden = type !== 'extra';
    form.querySelector('#pairs').hidden = type === 'extra';
    form.querySelector('#roomf').hidden = type !== 'room';
    showErr('');
  };
  form.querySelector('#g').onchange = loadDay; form.querySelector('#d').onchange = loadDay;
  form.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { type = b.dataset.t; applyType(); });
  form.onsubmit = async (e) => {
    e.preventDefault();
    showErr('');
    const body = type === 'extra'
      ? { type, group: v('#g'), date: v('#d'), start: v('#st'), end: v('#en'), subject: v('#sj'), kind: v('#kd'), room: v('#xr'), note: v('#nt') }
      : { type, group: v('#g'), date: v('#d'), pair: form.querySelector('#p')?.value, new_room: v('#rm'), note: v('#nt') };
    try { await api('/staff/schedule-changes', { method: 'POST', body }); toast('Сохранено, группа уведомлена'); loadDay(); }
    catch (err) { showErr(err.message); form.querySelector('#err').scrollIntoView({ block: 'nearest' }); }
  };
  applyType(); loadDay(); rescheduleQueue(ctx.el.querySelector('#rsq'));
}

// ---------- Посещаемость студентов (СКУД и пропуски) ----------
export async function renderStudents(ctx) {
  ctx.setTitle('Студенты');
  const list = await api('/staff/students');
  if (!ctx.isCurrent()) return;
  const LVL = { ok: ['', ''], near: ['warn', 'близко к лимиту'], warning: ['bad', 'риск отчисления'], expulsion: ['bad', 'лимит исчерпан'] };
  ctx.el.innerHTML = `<div class="page stack">
    <input class="input" id="sq" placeholder="Поиск: ФИО или группа" style="max-width:360px">
    <section class="card pad-0"><div class="table-wrap"><table class="table resp"><thead><tr><th>Студент</th><th>Сейчас</th><th>В университете за 7 дней</th><th>Пропуски</th></tr></thead><tbody>
    ${list.map((s) => `<tr class="click" tabindex="0" data-id="${s.id}" data-q="${esc(`${s.name} ${s.group}`.toLowerCase())}"><td><b>${esc(s.name)}</b><div class="xs faint">${esc(s.group)} · ${s.course} курс</div></td>
      <td>${s.today_in ? `<span class="chip ${s.inside ? 'ok' : ''}">вход в ${esc(s.today_in)}</span>${!s.inside && s.today_out ? ` <span class="chip">выход в ${esc(s.today_out)}</span>` : ''}` : '<span class="chip">не приходил(а)</span>'}</td>
      <td><b>${hmin(s.week_minutes)}</b> <span class="xs faint">· ${s.week_days} ${plural(s.week_days, 'день', 'дня', 'дней')}</span></td>
      <td><b>${s.absence_hours} ак. ч.</b> ${LVL[s.absence_level][1] ? `<span class="chip ${LVL[s.absence_level][0]}">${LVL[s.absence_level][1]}</span>` : ''}</td></tr>`).join('')}
    </tbody></table></div></section></div>`;
  ctx.el.querySelectorAll('tr[data-id]').forEach((tr) => {
    const go = () => { location.hash = `#/staff/students/${tr.dataset.id}`; };
    tr.onclick = go; tr.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
  ctx.el.querySelector('#sq').oninput = (e) => { const v = e.target.value.trim().toLowerCase(); ctx.el.querySelectorAll('tr[data-q]').forEach((tr) => { tr.hidden = v && !tr.dataset.q.includes(v); }); };
}

export async function renderStudent(ctx) {
  ctx.setTitle('Студент', '#/staff/students');
  const d = await api(`/staff/students/${encodeURIComponent(ctx.params.id)}/attendance`);
  if (!ctx.isCurrent()) return;
  ctx.setTitle(d.student.name, '#/staff/students');
  const c = d.campus, a = d.absences;
  ctx.el.innerHTML = `<div class="page stack">
    <div class="small muted">${esc(d.student.group)} · ${d.student.course} курс</div>
    <div class="grid c2" style="align-items:start">
      <section class="card"><div class="card-h"><h2>Пропуски</h2><span class="chip">${a.hours} ак. ч. из ${absenceText(a).limit} ак. ч.</span></div>${absenceMeter(a)}
        <details class="more"><summary>${icon('chevronRight', 'sm')} Список (${a.list.length})</summary>${absenceList(a.list)}</details></section>
      <section class="card"><div class="card-h"><h2>В университете за неделю</h2><span class="chip">${hmin(c.week_minutes)}</span></div>${campusBars(c.days)}</section>
    </div>
    <section class="card"><div class="card-h"><h2>Проходы СКУД за неделю</h2></div>${passDays(c.days)}</section>
    <form class="card" id="rt" novalidate><h2 style="font-size:17px;margin-bottom:10px">Назначить пересдачу</h2>
      ${d.retakes.length ? `<div class="small muted" style="margin-bottom:10px">Уже назначено: ${d.retakes.map((r) => `${esc(r.discipline)} — ${fmt.dmShort(parseISO(r.date))}, ${r.start}`).join('; ')}</div>` : ''}
      <div class="grid c2" style="gap:0 12px">
        <div class="field"><label for="rd">Дисциплина</label><input class="input" id="rd" maxlength="150"></div>
        <div class="field"><label for="rdt">Дата</label><input class="input" type="date" id="rdt" value="${todayISO()}"></div>
        <div class="field"><label for="rp">Пара</label><select class="input" id="rp">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label for="rr">Аудитория</label><input class="input" id="rr" maxlength="30"></div>
        <div class="field"><label for="re">Принимает</label><input class="input" id="re" maxlength="80" placeholder="Преподаватель или комиссия"></div>
      </div>
      <button class="btn">${icon('refresh')} Назначить и уведомить студента</button></form>
  </div>`;
  ctx.el.querySelector('#rt').onsubmit = async (e) => {
    e.preventDefault();
    const v = (id) => ctx.el.querySelector(id).value;
    try { await api('/staff/retakes', { method: 'POST', body: { student_id: d.student.id, discipline: v('#rd'), date: v('#rdt'), pair: v('#rp'), room: v('#rr'), examiner: v('#re') } }); toast('Пересдача назначена, студент получил уведомление'); renderStudent(ctx); }
    catch (err) { toast(err.message, 'bad'); }
  };
}
