// Облегченная версия кабинета: страницы собираются на сервере, без JavaScript,
// анимаций, шрифтов и картинок. Открывается, даже если основной интерфейс
// не загрузился или интернет очень медленный. Данные — те же и с теми же правами.
const express = require('express');
const A = require('./academic');
const S = require('./services');
const { STATUS, TYPES } = require('./catalog');
const R = require('./requests');
const W = require('./workflows');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const day = (iso) => { const d = A.parseDate(iso.slice(0, 10)); return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
// «22 ноября 18:00» — без предлога «в»
const dt = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MON[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const hmin = (m) => `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин`;

const CSS = `body{margin:0;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f8;color:#111a33}
a{color:#1f3a7a}header{background:#1f3a7a;color:#fff;padding:10px 14px}header a{color:#fff}
header b{font-size:17px}.top{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}nav{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:15px}
main{max-width:760px;margin:0 auto;padding:12px 14px 40px}h1{font-size:21px;margin:8px 0}h2{font-size:17px;margin:18px 0 6px}
.box{background:#fff;border:1px solid #dde1ea;border-radius:10px;padding:10px 12px;margin:8px 0}
.muted{color:#566079;font-size:14px}.warn{color:#8a4b00;font-weight:600}.bad{color:#a32020;font-weight:600}.ok{color:#0b6b45;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:15px;table-layout:fixed}td:first-child,th:first-child{width:8.2em}table.auto{table-layout:auto}table.auto td:first-child,table.auto th:first-child{width:auto}td,th{border-bottom:1px solid #e4e7ee;padding:6px 4px;text-align:left;vertical-align:top}
ul{padding-left:18px;margin:4px 0}li{margin:3px 0}s{color:#7a8299}
input,select,textarea{font:inherit;padding:10px;border:1px solid #b9c0d0;border-radius:8px;width:100%;box-sizing:border-box;margin:4px 0 10px;background:#fff;color:inherit}textarea{min-height:90px}
input[type=checkbox],input[type=radio]{width:auto;margin:0 6px 0 0}label{display:block}.opt{display:flex;align-items:center;margin:6px 0}
.flash{padding:10px 12px;border-radius:8px;margin:8px 0;background:#e3f4ea;color:#0b6b45}.flash.err{background:#fde7e7;color:#a32020}
.btn2{background:#e6e9f2;color:#1f3a7a}.danger{background:#a32020}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button{font:inherit;padding:10px 16px;border:0;border-radius:8px;background:#1f3a7a;color:#fff}
.inline{display:inline}.inline button{background:none;color:#fff;padding:0;text-decoration:underline}
footer{font-size:13px;color:#566079;text-align:center;margin-top:24px}
@media (prefers-color-scheme:dark){body{background:#0c111d;color:#e8ecf6}.box{background:#151c2e;border-color:#283152}a{color:#9fb4ff}
.muted{color:#a3abc4}td,th{border-color:#283152}input,select,textarea{background:#151c2e;color:#e8ecf6;border-color:#3a446a}.flash{background:#12322a;color:#5be0a6}.flash.err{background:#3c1a1f;color:#ff8a8a}.btn2{background:#283152;color:#c9d6ff}.warn{color:#ffc266}.bad{color:#ff8a8a}.ok{color:#5be0a6}}`;

// Сообщение после действия: ?ok=… или ?err=… (текст экранируется)
const flash = (req) => (req.query.ok ? `<div class="flash">${esc(String(req.query.ok).slice(0, 300))}</div>` : req.query.err ? `<div class="flash err">${esc(String(req.query.err).slice(0, 300))}</div>` : '');
const back = (res, url, out, okText) => res.redirect(303, `${url}${url.includes('?') ? '&' : '?'}${out.ok ? `ok=${encodeURIComponent(okText)}` : `err=${encodeURIComponent(out.error)}`}`);
const csrfOk = (req) => { const src = req.get('origin') || req.get('referer') || ''; try { return !src || new URL(src).host === req.get('host'); } catch { return false; } };

function page(req, title, body) {
  const u = req.user;
  const nav = !u ? '' : u.role === 'staff'
    ? '<nav><a href="/lite">Заявки</a><a href="/lite/reschedules">Переносы пар</a><a href="/lite/news">Лента</a></nav>'
    : u.role === 'teacher' ? '<nav><a href="/lite">Мои пары</a><a href="/lite/my-reschedules">Переносы</a><a href="/lite/news">Лента</a></nav>'
    : '<nav><a href="/lite">Сегодня</a><a href="/lite/schedule">Расписание</a><a href="/lite/grades">Учеба</a><a href="/lite/requests">Заявки</a><a href="/lite/attendance">Посещаемость</a><a href="/lite/news">Лента</a></nav>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} — Орбита (облегченная)</title><style>${CSS}</style></head><body>
<header><div class="top"><span><b>Орбита</b> · облегченная</span><span>${u ? `<a href="/#/">Полная версия</a> · <form class="inline" method="post" action="/lite/logout"><button>Выйти</button></form>` : '<a href="/">Полная версия</a>'}</span></div>${nav}</header>
<main><h1>${esc(title)}</h1>${flash(req)}${body}</main></body></html>`;
}

// Защита от подделки форм: POST принимается только со своего сайта
function sameOrigin(req, res, next) {
  const src = req.get('origin') || req.get('referer') || '';
  try { if (src && new URL(src).host !== req.get('host')) return res.status(403).send('Запрос отклонен'); } catch { return res.status(403).send('Запрос отклонен'); }
  next();
}

function lessonsHtml(dayS) {
  if (!dayS.lessons.length) return '<p class="muted">Пар нет</p>';
  return `<table>${dayS.lessons.map((l) => {
    const c = l.change;
    const note = !c ? '' : c.type === 'cancel' ? '<div class="bad">Отменена</div>' : c.type === 'room' ? `<div class="warn">Новая аудитория (было ${esc(c.old_room)})</div>`
      : c.type === 'retake' ? '<div class="warn">Ваша пересдача</div>' : c.type === 'extra' ? '<div class="warn">Дополнительное занятие</div>' : '<div class="warn">Изменение</div>';
    const name = c?.type === 'cancel' ? `<s>${esc(l.subject)}</s>` : `<b>${esc(l.subject)}</b>`;
    return `<tr><td style="white-space:nowrap">${l.start}–${l.end}</td><td>${name}<div class="muted">${esc(l.kind)} · ${esc(l.room)}</div>${note}</td></tr>`;
  }).join('')}</table>`;
}

function createLite(db, auth) {
  const r = express.Router();
  r.use(express.urlencoded({ extended: false, limit: '4kb' }));
  r.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  const loginPage = (req, res, error = '', status = 200) => res.status(status).type('html').send(page(req, 'Вход', `
    ${error ? `<p class="bad">${esc(error)}</p>` : ''}
    <form method="post" action="/lite/login" class="box"><label>Логин<input name="login" autocomplete="username" autocapitalize="none" required></label>
    <label>Пароль<input name="password" type="password" autocomplete="current-password" required></label><button>Войти</button></form>
    <p class="muted">Демо: anna / Orbita-Anna-2026 · timur / Orbita-Timur-2026 · nika / Orbita-Nika-2026 · teacher / Orbita-Teacher-2026 · dekanat / Orbita-Staff-2026</p>`));

  r.post('/login', sameOrigin, (req, res) => {
    const out = auth.authenticate(req, res, req.body.login, req.body.password);
    if (out.status !== 200) return loginPage(req, res, out.error, out.status);
    res.redirect(303, '/lite');
  });
  r.post('/logout', sameOrigin, (req, res) => { auth.endSession(req, res); res.redirect(303, '/lite'); });

  // Всё остальное — только после входа
  r.use((req, res, next) => (req.user ? next() : loginPage(req, res)));
  r.use((req, res, next) => (req.method === 'POST' && !csrfOk(req) ? res.status(403).send('Запрос отклонен') : next()));

  r.get('/', (req, res) => {
    if (req.user.role === 'teacher') return teacherHome(req, res);
    if (req.user.role === 'staff') return staffHome(req, res);
    const st = S.getStudent(db, req.user.id);
    const today = A.isoDate(new Date());
    const t = S.daySchedule(db, st.group, today, req.user.id);
    const tm = S.daySchedule(db, st.group, A.isoDate(A.addDays(new Date(), 1)), req.user.id);
    const retakes = S.retakesFor(db, req.user.id);
    const abs = S.absencesFor(db, req.user.id);
    const dls = S.deadlinesFor(db, req.user.id, st.group).filter((d) => !d.done && new Date(d.due_at) > Date.now()).slice(0, 5);
    const reqs = db.prepare("SELECT public_id, title, status FROM requests WHERE student_id = ? AND status NOT IN ('done','rejected') ORDER BY updated_at DESC").all(req.user.id);
    const unread = S.notificationsFor(db, req.user.id, st, req.user.role).filter((n) => !n.read).length;
    res.type('html').send(page(req, `Здравствуйте, ${st.first_name}`, `
      <p class="muted">${esc(st.group)} · ${st.course} курс · ${esc(day(today))}</p>
      ${retakes.map((x) => `<div class="box warn">У вас пересдача: ${esc(x.discipline)} — ${esc(day(x.date))}, ${x.start}, ${esc(x.room)}</div>`).join('')}
      <h2>Сегодня</h2><div class="box">${lessonsHtml(t)}</div>
      <h2>Завтра</h2><div class="box">${lessonsHtml(tm)}</div>
      <h2>Дедлайны</h2><div class="box">${dls.length ? `<ul>${dls.map((d) => `<li><b>${esc(d.title)}</b> — ${esc(d.discipline)}, до ${esc(dt(d.due_at))}</li>`).join('')}</ul>` : '<p class="muted">Открытых дедлайнов нет</p>'}</div>
      <h2>Пропуски</h2><div class="box">${abs.hours >= abs.limits.warning ? `<b class="bad">${abs.hours} ак. ч. из ${abs.limits.expulsion} ак. ч. (риск отчисления)</b>` : `<b>${abs.hours} ак. ч. из ${abs.limits.warning} ак. ч.</b>`}${abs.excused_hours ? `<div class="muted">+ ${abs.excused_hours} ак. ч. по справке не учитываются</div>` : ''}</div>
      <h2>Заявки</h2><div class="box">${reqs.length ? `<ul>${reqs.map((x) => `<li><a href="/lite/requests/${esc(x.public_id)}">${esc(x.title)}</a> — ${esc(STATUS[x.status])}</li>`).join('')}</ul>` : '<p class="muted">Активных заявок нет</p>'}</div>
      <p><a href="/lite/news">Лента</a>${unread ? ` — непрочитанных: ${unread}` : ''}</p>`));
  });

  // ================= Деканат =================
  const staffOnly = (req, res, next) => (req.user.role === 'staff' ? next() : res.redirect(303, '/lite'));
  const staffReq = (id) => db.prepare(`SELECT r.*, u.last_name, u.first_name, u.middle_name, s.group_name, s.course FROM requests r
    JOIN users u ON u.id = r.student_id JOIN students s ON s.user_id = r.student_id WHERE r.public_id = ?`).get(String(id));
  function staffHome(req, res) {
    const rows = db.prepare(`SELECT r.public_id, r.title, r.status, u.last_name, u.first_name, s.group_name FROM requests r
      JOIN users u ON u.id = r.student_id JOIN students s ON s.user_id = r.student_id ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'need_info' THEN 2 ELSE 3 END, r.updated_at DESC`).all();
    const pending = db.prepare("SELECT COUNT(*) n FROM reschedules WHERE status = 'pending'").get().n;
    res.type('html').send(page(req, 'Заявки студентов', `${pending ? `<div class="box warn"><a href="/lite/reschedules">Заявки на перенос пар: ${pending}</a></div>` : ''}
      ${rows.length ? `<div class="box"><table class="auto"><tr><th>Заявка</th><th>Студент</th><th>Статус</th></tr>${rows.map((x) => `<tr><td><a href="/lite/staff/requests/${esc(x.public_id)}">${esc(x.title)}</a><div class="muted">${esc(x.public_id)}</div></td><td>${esc(x.last_name)} ${esc(x.first_name)}<div class="muted">${esc(x.group_name)}</div></td><td>${esc(STATUS[x.status])}</td></tr>`).join('')}</table></div>` : '<p>Заявок нет.</p>'}`));
  }
  r.get('/staff/requests/:id', staffOnly, (req, res) => {
    const x = staffReq(req.params.id);
    if (!x) return res.status(404).type('html').send(page(req, 'Не найдено', '<p>Такой заявки нет.</p>'));
    const ev = db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at, id').all(x.id);
    const payload = JSON.parse(x.payload);
    const url = `/lite/staff/requests/${esc(x.public_id)}`;
    res.type('html').send(page(req, x.title, `<p>${esc(x.last_name)} ${esc(x.first_name)} · ${esc(x.group_name)}, ${x.course} курс · статус: <b>${esc(STATUS[x.status])}</b></p>
      <div class="box"><ul>${Object.entries(payload).map(([k, v]) => `<li>${esc(TYPES[x.type]?.fields.find((f) => f.name === k)?.label || k)}: ${esc(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? day(String(v)) : v)}</li>`).join('')}</ul></div>
      <h2>История</h2><div class="box"><ul>${ev.map((e) => `<li><span class="muted">${esc(dt(e.created_at))}</span> — ${e.kind === 'status' ? `<b>${esc(STATUS[e.status])}</b>` : `<b>${esc(e.author_role === 'student' ? 'Студент' : e.author_name || 'Деканат')}:</b>`} ${esc(e.text || '')}</li>`).join('')}</ul></div>
      <h2>Сменить статус</h2><form class="box" method="post" action="${url}/status">
        <label>Новый статус<select name="status">${['in_progress', 'need_info', 'ready', 'done', 'rejected'].filter((k) => k !== x.status).map((k) => `<option value="${k}">${esc(STATUS[k])}</option>`).join('')}</select></label>
        <label>Комментарий для студента (обязателен для «Нужно уточнение» и «Отклонена»)<textarea name="comment" maxlength="2000"></textarea></label><button>Сохранить</button></form>
      <h2>Написать студенту</h2><form class="box" method="post" action="${url}/message"><textarea name="text" maxlength="2000" required></textarea><button>Отправить</button></form>`));
  });
  r.post('/staff/requests/:id/status', staffOnly, (req, res) => {
    const x = staffReq(req.params.id); const url = `/lite/staff/requests/${encodeURIComponent(req.params.id)}`;
    if (!x) return res.redirect(303, '/lite');
    const out = W.staffSetStatus(db, req.user, x, String(req.body.status || ''), req.body.comment);
    if (out.ok) auth.audit(req.user.id, 'staff_status', `${x.public_id}:${req.body.status}`, req.ip);
    back(res, url, out, 'Статус изменен, студент получил уведомление');
  });
  r.post('/staff/requests/:id/message', staffOnly, (req, res) => {
    const x = staffReq(req.params.id); const url = `/lite/staff/requests/${encodeURIComponent(req.params.id)}`;
    if (!x) return res.redirect(303, '/lite');
    back(res, url, W.staffMessage(db, req.user, x, req.body.text), 'Сообщение отправлено');
  });
  r.get('/reschedules', staffOnly, (req, res) => {
    const list = db.prepare("SELECT * FROM reschedules ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC").all();
    const RS = { pending: 'ждет решения', approved: 'одобрено', rejected: 'отклонено' };
    res.type('html').send(page(req, 'Заявки на перенос пар', list.length ? list.map((x) => {
      const t = db.prepare('SELECT * FROM users WHERE id = ?').get(x.teacher_id);
      return `<div class="box"><b>${esc(x.subject)}</b> · ${esc(x.group_name)} · <span class="${x.status === 'pending' ? 'warn' : x.status === 'approved' ? 'ok' : 'bad'}">${RS[x.status]}</span>
        <div>${esc(W.short(t))}: ${esc(day(x.from_date))} ${x.from_start} → <b>${esc(day(x.to_date))} ${x.to_start}–${x.to_end}</b>, ${esc(x.to_room || '')}</div><div class="muted">Причина: ${esc(x.reason || '—')}</div>
        ${x.status === 'pending' ? `<form method="post" action="/lite/reschedules/${x.id}"><label>Комментарий (обязателен при отказе)<input name="comment" maxlength="500"></label>
          <div class="row"><button name="decision" value="approve">Одобрить</button><button class="danger" name="decision" value="reject">Отклонить</button></div></form>` : x.staff_comment ? `<div class="muted">Комментарий: ${esc(x.staff_comment)}</div>` : ''}</div>`;
    }).join('') : '<p>Заявок на перенос нет.</p>'));
  });
  r.post('/reschedules/:id', staffOnly, (req, res) => {
    const out = W.decideReschedule(db, req.user, req.params.id, req.body.decision, req.body.comment);
    if (out.ok) auth.audit(req.user.id, 'staff_reschedule', `${req.params.id}:${req.body.decision}`, req.ip);
    back(res, '/lite/reschedules', out, req.body.decision === 'approve' ? 'Перенос одобрен, группа и преподаватель уведомлены' : 'Заявка отклонена');
  });

  // ================= Преподаватель =================
  const teacherOnly = (req, res, next) => (req.user.role === 'teacher' ? next() : res.redirect(303, '/lite'));
  function teacherHome(req, res) {
    const today = A.isoDate(new Date());
    const days = [];
    for (let i = -1; i <= 6; i++) { const date = A.isoDate(A.addDays(new Date(), i)); const ls = W.teacherDay(db, req.user.id, date); if (ls.length) days.push({ date, ls }); }
    const studentsOf = (g) => db.prepare('SELECT u.id, u.last_name, u.first_name FROM users u JOIN students s ON s.user_id = u.id WHERE s.group_name = ? ORDER BY u.last_name').all(g);
    res.type('html').send(page(req, 'Мои пары', days.length ? days.map((d) => `<h2>${esc(day(d.date))}${d.date === today ? ' · сегодня' : ''}</h2>${d.ls.map((l) => {
      const off = !S.isActive(l);
      const marked = (sid) => Boolean(db.prepare('SELECT 1 FROM absences WHERE student_id = ? AND date = ? AND pair = ? AND subject = ?').get(sid, d.date, l.pair, l.subject));
      return `<div class="box"><b>${l.start}–${l.end} · ${esc(l.subject)}</b> · ${esc(l.group)}<div class="muted">${esc(l.kind)} · ${esc(l.room)}${off ? ' · отменена или перенесена' : ''}${l.pending ? ' · <span class="warn">перенос на согласовании</span>' : ''}</div>
        ${!off && d.date <= today ? `<form method="post" action="/lite/teacher/attendance"><input type="hidden" name="group" value="${esc(l.group)}"><input type="hidden" name="date" value="${d.date}"><input type="hidden" name="start" value="${l.start}">
          <div class="muted">Отметьте отсутствующих:</div>${studentsOf(l.group).map((s) => `<label class="opt"><input type="checkbox" name="absent" value="${s.id}" ${marked(s.id) ? 'checked' : ''}>${esc(s.last_name)} ${esc(s.first_name)}</label>`).join('')}
          <button>Сохранить посещаемость</button></form>` : ''}
        ${!off && !l.pending && d.date >= today ? `<p><a href="/lite/teacher/move?group=${encodeURIComponent(l.group)}&date=${d.date}&start=${l.start}">Попросить перенос</a></p>` : ''}</div>`;
    }).join('')}`).join('') : '<p>Пар на неделе нет.</p>'));
  }
  r.post('/teacher/attendance', teacherOnly, (req, res) => {
    const out = W.teacherAttendance(db, req.user, req.body);
    back(res, '/lite', out, `Посещаемость сохранена${out.ok ? ` · отсутствуют: ${out.absent}` : ''}`);
  });
  r.get('/teacher/move', teacherOnly, (req, res) => {
    const l = W.findTeacherLesson(db, req.user.id, req.query.group, req.query.date, req.query.start);
    if (!l) return res.status(404).type('html').send(page(req, 'Не найдено', '<p>Пара не найдена.</p>'));
    const next = A.isoDate(A.addDays(A.parseDate(String(req.query.date)), 7));
    res.type('html').send(page(req, 'Перенос пары', `<p>${esc(l.subject)} · ${esc(l.group)} · ${esc(day(String(req.query.date)))} ${l.start}–${l.end}</p>
      <form class="box" method="post" action="/lite/teacher/move"><input type="hidden" name="group" value="${esc(l.group)}"><input type="hidden" name="date" value="${esc(req.query.date)}"><input type="hidden" name="start" value="${l.start}">
        <label>Новая дата<input type="date" name="to_date" value="${next}" required></label>
        <div class="row"><label>Начало<input type="time" name="to_start" value="${l.start}" required></label><label>Окончание<input type="time" name="to_end" value="${l.end}" required></label></div>
        <label>Аудитория<input name="to_room" value="${esc(l.room)}" maxlength="40"></label><label>Причина<input name="reason" maxlength="500" required></label>
        <button>Отправить на согласование в деканат</button></form>`));
  });
  r.post('/teacher/move', teacherOnly, (req, res) => {
    const out = W.teacherReschedule(db, req.user, req.body);
    if (!out.ok) return back(res, `/lite/teacher/move?group=${encodeURIComponent(req.body.group || '')}&date=${encodeURIComponent(req.body.date || '')}&start=${encodeURIComponent(req.body.start || '')}`, out, '');
    back(res, '/lite/my-reschedules', out, 'Заявка отправлена в деканат');
  });
  r.get('/my-reschedules', teacherOnly, (req, res) => {
    const list = db.prepare('SELECT * FROM reschedules WHERE teacher_id = ? ORDER BY created_at DESC').all(req.user.id);
    const RS = { pending: 'на согласовании', approved: 'одобрено', rejected: 'отклонено' };
    res.type('html').send(page(req, 'Переносы', list.length ? `<div class="box"><ul>${list.map((x) => `<li><b>${esc(x.subject)}</b> · ${esc(x.group_name)}: ${esc(day(x.from_date))} ${x.from_start} → ${esc(day(x.to_date))} ${x.to_start} — <span class="${x.status === 'pending' ? 'warn' : x.status === 'approved' ? 'ok' : 'bad'}">${RS[x.status]}</span>${x.staff_comment ? ` <span class="muted">(${esc(x.staff_comment)})</span>` : ''}</li>`).join('')}</ul></div>` : '<p>Заявок на перенос нет.</p>'));
  });

  // Ниже — только студенческие страницы
  r.use((req, res, next) => (req.user.role === 'student' || req.path === '/news' ? next() : res.redirect(303, '/lite')));

  r.get('/schedule', (req, res) => {
    const st = S.getStudent(db, req.user.id);
    const from = A.parseDate(String(req.query.from || '')) || new Date();
    const monday = A.mondayOf(from);
    const days = S.rangeSchedule(db, st.group, A.isoDate(monday), 6, req.user.id);
    const prev = A.isoDate(A.addDays(monday, -7)), next = A.isoDate(A.addDays(monday, 7));
    res.type('html').send(page(req, 'Расписание', `<p><a href="/lite/schedule?from=${prev}">← прошлая неделя</a> · <a href="/lite/schedule?from=${next}">следующая →</a></p>
      ${days.map((d) => `<h2>${esc(day(d.date))}</h2><div class="box">${lessonsHtml(d)}</div>`).join('')}`));
  });

  r.get('/grades', (req, res) => {
    const g = S.gradesOverview(db, req.user.id);
    const cls = { ok: 'ok', watch: 'warn', risk: 'bad' };
    res.type('html').send(page(req, 'Учеба', `
      <h2>Семестр ${g.semester}</h2><div class="box"><table class="auto"><tr><th>Дисциплина</th><th>Рейтинг</th></tr>${g.current.map((c) => `<tr><td>${esc(c.name)}<div class="muted">${esc(c.control_label)}</div><div class="${cls[c.status]}">${esc(c.label)}</div></td><td style="white-space:nowrap">${c.earned} / 100</td></tr>`).join('')}</table></div>
      <h2>${esc(g.session.name)}</h2><div class="box">${g.session.exams.length ? `<ul>${g.session.exams.map((e) => `<li>${esc(day(e.date))}, ${e.date.slice(11, 16)} — <b>${esc(e.name)}</b> (${esc(e.control_label.toLowerCase())}), ${esc(e.room)}</li>`).join('')}</ul>` : '<p class="muted">Расписание сессии еще не опубликовано</p>'}</div>
      <h2>Зачетка</h2><div class="box">${Object.keys(g.semesters).length ? `<p>Средний балл: <b>${g.summary.gpa ?? '—'}</b></p><table class="auto">${Object.entries(g.semesters).map(([sem, list]) => `<tr><th colspan="2">${sem} семестр</th></tr>${list.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.mark)}${x.points ? ` · ${x.points} · ${x.ects}` : ''}</td></tr>`).join('')}`).join('')}</table>` : '<p class="muted">Оценки появятся после первой сессии</p>'}</div>
      <p class="muted">Шкала: 90–100 «отлично» (A), 82–89 «хорошо» (B), 75–81 «хорошо» (C), 67–74 «удовлетворительно» (D), 60–66 «удовлетворительно» (E), меньше 60 — F.</p>`));
  });

  r.get('/requests', (req, res) => {
    const rows = db.prepare('SELECT public_id, title, status, updated_at FROM requests WHERE student_id = ? ORDER BY updated_at DESC').all(req.user.id);
    res.type('html').send(page(req, 'Заявки', `${rows.length ? `<div class="box"><table class="auto">${rows.map((x) => `<tr><td><a href="/lite/requests/${esc(x.public_id)}">${esc(x.title)}</a><div class="muted">${esc(x.public_id)}</div></td><td>${esc(STATUS[x.status])}</td></tr>`).join('')}</table></div>` : '<p>Заявок пока нет.</p>'}
      <p><a href="/lite/requests/new"><b>+ Новая заявка</b></a></p>`));
  });
  r.get('/requests/new', (req, res) => {
    const types = R.catalogFor(db, req.user.id);
    res.type('html').send(page(req, 'Новая заявка', `<div class="box"><ul>${types.map((t) => `<li><a href="/lite/requests/new/${t.id}"><b>${esc(t.title)}</b></a><div class="muted">${esc(t.description)}</div></li>`).join('')}</ul></div>`));
  });
  // Форма по той же схеме, что и в полной версии; сервер проверяет ввод так же
  const field = (f, v = '', err = '') => {
    const lbl = `${esc(f.label)}${f.required ? ' *' : ''}`;
    const e = err ? `<div class="bad">${esc(err)}</div>` : '';
    if (f.type === 'select') return `<label>${lbl}<select name="${f.name}"><option value="">Выберите…</option>${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>${e}`;
    if (f.type === 'segmented') return `<div>${lbl}${f.options.map((o) => `<label class="opt"><input type="radio" name="${f.name}" value="${esc(o.value)}" ${(v || f.default) === o.value ? 'checked' : ''}>${esc(o.label)}</label>`).join('')}</div>${e}`;
    if (f.type === 'textarea') return `<label>${lbl}<textarea name="${f.name}" maxlength="${f.maxLength || 500}">${esc(v)}</textarea></label>${e}`;
    if (f.type === 'number') return `<label>${lbl}<input type="number" name="${f.name}" min="${f.min}" max="${f.max}" value="${esc(v || f.default || '')}"></label>${e}`;
    if (f.type === 'date') return `<label>${lbl}<input type="date" name="${f.name}" value="${esc(v)}"></label>${e}`;
    return `<label>${lbl}<input name="${f.name}" maxlength="${f.maxLength || 200}" value="${esc(v)}"></label>${e}`;
  };
  const requestForm = (req, res, type, values = {}, errors = {}, message = '') => {
    const t = R.catalogFor(db, req.user.id).find((x) => x.id === type);
    if (!t) return res.status(404).type('html').send(page(req, 'Не найдено', '<p>Такой услуги нет.</p>'));
    res.type('html').send(page(req, t.title, `<p class="muted">${esc(t.description)}</p>${message ? `<div class="flash err">${esc(message)}</div>` : ''}
      <form class="box" method="post" action="/lite/requests/new/${t.id}">${t.fields.map((f) => field(f, values[f.name], errors[f.name])).join('')}<button>Отправить</button></form>
      ${t.statement ? `<p><a href="/api/statements/${t.id}.pdf">Пустой бланк заявления (PDF)</a></p>` : ''}`));
  };
  r.get('/requests/new/:type', (req, res) => requestForm(req, res, String(req.params.type)));
  r.post('/requests/new/:type', (req, res) => {
    const out = R.createRequest(db, req.user, String(req.params.type), req.body || {});
    if (out.status >= 400) return requestForm(req, res, String(req.params.type), req.body || {}, out.body.fields || {}, out.body.error);
    auth.audit(req.user.id, 'request_created', req.params.type, req.ip);
    res.redirect(303, `/lite/requests/${encodeURIComponent(out.body.id)}?ok=${encodeURIComponent(out.body.status === 'ready' ? 'Готово' : 'Заявка отправлена')}`);
  });
  const own = (req) => db.prepare('SELECT * FROM requests WHERE public_id = ? AND student_id = ?').get(String(req.params.id), req.user.id);
  r.post('/requests/:id/message', (req, res) => {
    const x = own(req); if (!x) return res.redirect(303, '/lite/requests');
    back(res, `/lite/requests/${encodeURIComponent(x.public_id)}`, W.studentMessage(db, req.user, x, req.body.text), 'Сообщение отправлено');
  });
  r.post('/requests/:id/cancel', (req, res) => {
    const x = own(req); if (!x) return res.redirect(303, '/lite/requests');
    back(res, `/lite/requests/${encodeURIComponent(x.public_id)}`, W.studentCancel(db, req.user, x), 'Заявка отозвана');
  });
  r.get('/requests/:id', (req, res) => {
    const x = db.prepare('SELECT * FROM requests WHERE public_id = ? AND student_id = ?').get(String(req.params.id), req.user.id);
    if (!x) return res.status(404).type('html').send(page(req, 'Не найдено', '<p>Такой заявки нет.</p>'));
    const ev = db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at, id').all(x.id);
    res.type('html').send(page(req, x.title, `<p>Статус: <b>${esc(STATUS[x.status])}</b>${x.eta && !['ready', 'done', 'rejected'].includes(x.status) ? ` · срок ${esc(day(x.eta))}` : ''}</p>
      ${x.doc_code && ['ready', 'done'].includes(x.status) ? `<p><a href="/api/requests/${esc(x.public_id)}/document">Открыть документ</a></p>` : ''}
      ${TYPES[x.type]?.statement ? `<p><a href="/api/statements/${esc(x.type)}.pdf?request=${esc(x.public_id)}">Заявление в PDF</a></p>` : ''}
      <div class="box"><ul>${ev.map((e) => `<li><span class="muted">${esc(dt(e.created_at))}</span> — ${e.kind === 'status' ? `<b>${esc(STATUS[e.status])}</b>` : `<b>${esc(e.author_role === 'student' ? 'Вы' : e.author_name || 'Деканат')}:</b>`} ${esc(e.text || '')}</li>`).join('')}</ul></div>
      ${['done', 'rejected'].includes(x.status) ? '' : `<h2>${x.status === 'need_info' ? 'Ответить деканату' : 'Написать в деканат'}</h2>
        <form class="box" method="post" action="/lite/requests/${esc(x.public_id)}/message"><textarea name="text" maxlength="2000" required></textarea><button>Отправить</button></form>
        <form method="post" action="/lite/requests/${esc(x.public_id)}/cancel"><button class="btn2">Отозвать заявку</button></form>`}`));
  });

  r.get('/attendance', (req, res) => {
    const a = S.absencesFor(db, req.user.id);
    const c = S.campusFor(db, req.user.id, 7);
    res.type('html').send(page(req, 'Посещаемость', `
      <h2>Пропуски</h2><div class="box">${a.hours >= a.limits.warning ? `<b class="bad">${a.hours} ак. ч. из ${a.limits.expulsion} ак. ч. (риск отчисления)</b>` : `<b>${a.hours} ак. ч. из ${a.limits.warning} ак. ч.</b>`}${a.excused_hours ? `<div class="muted">По справке: ${a.excused_hours} ак. ч. (не учитываются)</div>` : ''}
        ${a.list.length ? `<ul>${a.list.map((x) => `<li>${esc(day(x.date))}, ${x.pair} пара — ${esc(x.subject)}${x.excused ? ' <span class="muted">(по справке)</span>' : ''}</li>`).join('')}</ul>` : ''}</div>
      <h2>Входы и выходы</h2><div class="box"><p>За неделю: <b>${hmin(c.week_minutes)}</b></p><table>${c.days.filter((d) => d.events.length).map((d) => `<tr><td>${esc(day(d.date))}</td><td>вход в ${d.first_in}${d.inside ? '' : d.last_out ? `, выход в ${d.last_out}` : ''}</td><td>${hmin(d.minutes)}</td></tr>`).join('') || '<tr><td class="muted">Проходов нет</td></tr>'}</table></div>`));
  });

  r.get('/news', (req, res) => {
    const st = req.user.role === 'student' ? S.getStudent(db, req.user.id) : null;
    const list = S.notificationsFor(db, req.user.id, st, req.user.role).slice(0, 40);
    res.type('html').send(page(req, 'Лента', list.length ? list.map((n) => `<div class="box"><b>${esc(n.title)}</b>${n.read ? '' : ' <span class="warn">• новое</span>'}<div>${esc(n.body)}</div><div class="muted">${esc(n.author || '')} · ${esc(dt(n.created_at))}</div></div>`).join('') : '<p>Пока пусто.</p>'));
  });

  return r;
}

module.exports = { createLite };
