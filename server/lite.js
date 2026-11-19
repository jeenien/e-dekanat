// Облегченная версия кабинета: страницы собираются на сервере, без JavaScript,
// анимаций, шрифтов и картинок. Открывается, даже если основной интерфейс
// не загрузился или интернет очень медленный. Данные — те же и с теми же правами.
const express = require('express');
const A = require('./academic');
const S = require('./services');
const { STATUS } = require('./catalog');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const day = (iso) => { const d = A.parseDate(iso.slice(0, 10)); return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
const dt = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const hmin = (m) => `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин`;

const CSS = `body{margin:0;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f8;color:#111a33}
a{color:#1f3a7a}header{background:#1f3a7a;color:#fff;padding:10px 14px}header a{color:#fff}
header b{font-size:17px}.top{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}nav{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:15px}
main{max-width:760px;margin:0 auto;padding:12px 14px 40px}h1{font-size:21px;margin:8px 0}h2{font-size:17px;margin:18px 0 6px}
.box{background:#fff;border:1px solid #dde1ea;border-radius:10px;padding:10px 12px;margin:8px 0}
.muted{color:#566079;font-size:14px}.warn{color:#8a4b00;font-weight:600}.bad{color:#a32020;font-weight:600}.ok{color:#0b6b45;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:15px}td,th{border-bottom:1px solid #e4e7ee;padding:6px 4px;text-align:left;vertical-align:top}
ul{padding-left:18px;margin:4px 0}li{margin:3px 0}s{color:#7a8299}
input{font:inherit;padding:10px;border:1px solid #b9c0d0;border-radius:8px;width:100%;box-sizing:border-box;margin:4px 0 10px}
button{font:inherit;padding:10px 16px;border:0;border-radius:8px;background:#1f3a7a;color:#fff}
.inline{display:inline}.inline button{background:none;color:#fff;padding:0;text-decoration:underline}
footer{font-size:13px;color:#566079;text-align:center;margin-top:24px}
@media (prefers-color-scheme:dark){body{background:#0c111d;color:#e8ecf6}.box{background:#151c2e;border-color:#283152}a{color:#9fb4ff}
.muted{color:#a3abc4}td,th{border-color:#283152}input{background:#151c2e;color:#e8ecf6;border-color:#3a446a}.warn{color:#ffc266}.bad{color:#ff8a8a}.ok{color:#5be0a6}}`;

function page(req, title, body) {
  const u = req.user;
  const nav = !u ? '' : u.role === 'staff'
    ? '<nav><a href="/lite">Заявки</a><a href="/lite/news">Лента</a></nav>'
    : '<nav><a href="/lite">Сегодня</a><a href="/lite/schedule">Расписание</a><a href="/lite/grades">Учеба</a><a href="/lite/requests">Заявки</a><a href="/lite/attendance">Посещаемость</a><a href="/lite/news">Лента</a></nav>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} — Орбита (облегченная)</title><style>${CSS}</style></head><body>
<header><div class="top"><span><b>Орбита</b> · облегченная</span><span>${u ? `<a href="/#/">Полная версия</a> · <form class="inline" method="post" action="/lite/logout"><button>Выйти</button></form>` : '<a href="/">Полная версия</a>'}</span></div>${nav}</header>
<main><h1>${esc(title)}</h1>${body}<footer>Без анимаций и скриптов — для медленного интернета. Демонстрационный прототип, данные вымышлены.</footer></main></body></html>`;
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
    <p class="muted">Демо: anna / Orbita-Anna-2026 · timur / Orbita-Timur-2026 · nika / Orbita-Nika-2026 · dekanat / Orbita-Staff-2026</p>`));

  r.post('/login', sameOrigin, (req, res) => {
    const out = auth.authenticate(req, res, req.body.login, req.body.password);
    if (out.status !== 200) return loginPage(req, res, out.error, out.status);
    res.redirect(303, '/lite');
  });
  r.post('/logout', sameOrigin, (req, res) => { auth.endSession(req, res); res.redirect(303, '/lite'); });

  // Всё остальное — только после входа
  r.use((req, res, next) => (req.user ? next() : loginPage(req, res)));

  r.get('/', (req, res) => {
    if (req.user.role === 'staff') {
      const rows = db.prepare(`SELECT r.public_id, r.title, r.status, r.updated_at, u.last_name, u.first_name, s.group_name FROM requests r
        JOIN users u ON u.id = r.student_id JOIN students s ON s.user_id = r.student_id WHERE r.status IN ('submitted','in_progress','need_info') ORDER BY r.updated_at DESC`).all();
      return res.type('html').send(page(req, 'Открытые заявки', rows.length ? `<table><tr><th>Заявка</th><th>Студент</th><th>Статус</th></tr>${rows.map((x) => `<tr><td>${esc(x.title)}<div class="muted">${esc(x.public_id)}</div></td><td>${esc(x.last_name)} ${esc(x.first_name)}<div class="muted">${esc(x.group_name)}</div></td><td>${esc(STATUS[x.status])}</td></tr>`).join('')}</table><p class="muted">Чтобы ответить студенту или сменить статус, откройте полную версию.</p>` : '<p>Открытых заявок нет.</p>'));
    }
    const st = S.getStudent(db, req.user.id);
    const today = A.isoDate(new Date());
    const t = S.daySchedule(db, st.group, today, req.user.id);
    const tm = S.daySchedule(db, st.group, A.isoDate(A.addDays(new Date(), 1)), req.user.id);
    const retakes = S.retakesFor(db, req.user.id);
    const abs = S.absencesFor(db, req.user.id);
    const dls = S.deadlinesFor(db, req.user.id, st.group).filter((d) => !d.done && new Date(d.due_at) > Date.now()).slice(0, 5);
    const reqs = db.prepare("SELECT public_id, title, status FROM requests WHERE student_id = ? AND status NOT IN ('done','rejected') ORDER BY updated_at DESC").all(req.user.id);
    const unread = S.notificationsFor(db, req.user.id, st).filter((n) => !n.read).length;
    res.type('html').send(page(req, `Здравствуйте, ${st.first_name}`, `
      <p class="muted">${esc(st.group)} · ${st.course} курс · ${esc(day(today))}</p>
      ${retakes.map((x) => `<div class="box warn">У вас пересдача: ${esc(x.discipline)} — ${esc(day(x.date))}, ${x.start}, ${esc(x.room)}</div>`).join('')}
      <h2>Сегодня</h2><div class="box">${lessonsHtml(t)}</div>
      <h2>Завтра</h2><div class="box">${lessonsHtml(tm)}</div>
      <h2>Дедлайны</h2><div class="box">${dls.length ? `<ul>${dls.map((d) => `<li><b>${esc(d.title)}</b> — ${esc(d.discipline)}, до ${esc(dt(d.due_at))}</li>`).join('')}</ul>` : '<p class="muted">Открытых дедлайнов нет</p>'}</div>
      <h2>Пропуски</h2><div class="box"><b>${abs.hours} ак. ч</b> из ${abs.limits.warning} до выговора (${abs.limits.expulsion} ч — отчисление)${abs.excused_hours ? `<div class="muted">+ ${abs.excused_hours} ч по справке не учитываются</div>` : ''}</div>
      <h2>Заявки</h2><div class="box">${reqs.length ? `<ul>${reqs.map((x) => `<li><a href="/lite/requests/${esc(x.public_id)}">${esc(x.title)}</a> — ${esc(STATUS[x.status])}</li>`).join('')}</ul>` : '<p class="muted">Активных заявок нет</p>'}</div>
      <p><a href="/lite/news">Лента</a>${unread ? ` — непрочитанных: ${unread}` : ''}</p>`));
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
      <h2>Семестр ${g.semester}</h2><div class="box"><table><tr><th>Дисциплина</th><th>Баллы</th></tr>${g.current.map((c) => `<tr><td>${esc(c.name)}<div class="muted">${esc(c.control_label)}</div><div class="${cls[c.status]}">${esc(c.label)}</div></td><td style="white-space:nowrap">${c.earned} / ${c.sem_max}</td></tr>`).join('')}</table></div>
      <h2>${esc(g.session.name)}</h2><div class="box">${g.session.exams.length ? `<ul>${g.session.exams.map((e) => `<li>${esc(day(e.date))}, ${e.date.slice(11, 16)} — <b>${esc(e.name)}</b> (${esc(e.control_label.toLowerCase())}), ${esc(e.room)}</li>`).join('')}</ul>` : '<p class="muted">Расписание сессии еще не опубликовано</p>'}</div>
      <h2>Зачетка</h2><div class="box">${Object.keys(g.semesters).length ? `<p>Средний балл: <b>${g.summary.gpa ?? '—'}</b></p><table>${Object.entries(g.semesters).map(([sem, list]) => `<tr><th colspan="2">${sem} семестр</th></tr>${list.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.mark)}${x.points ? ` · ${x.points} · ${x.ects}` : ''}</td></tr>`).join('')}`).join('')}</table>` : '<p class="muted">Оценки появятся после первой сессии</p>'}</div>
      <p class="muted">Шкала: 90–100 «отлично» (A), 82–89 «хорошо» (B), 75–81 «хорошо» (C), 67–74 «удовлетворительно» (D), 60–66 «удовлетворительно» (E), меньше 60 — F.</p>`));
  });

  r.get('/requests', (req, res) => {
    const rows = db.prepare('SELECT public_id, title, status, updated_at FROM requests WHERE student_id = ? ORDER BY updated_at DESC').all(req.user.id);
    res.type('html').send(page(req, 'Заявки', `${rows.length ? `<div class="box"><table>${rows.map((x) => `<tr><td><a href="/lite/requests/${esc(x.public_id)}">${esc(x.title)}</a><div class="muted">${esc(x.public_id)}</div></td><td>${esc(STATUS[x.status])}</td></tr>`).join('')}</table></div>` : '<p>Заявок пока нет.</p>'}
      <p class="muted">Новую заявку можно подать в полной версии.</p>`));
  });
  r.get('/requests/:id', (req, res) => {
    const x = db.prepare('SELECT * FROM requests WHERE public_id = ? AND student_id = ?').get(String(req.params.id), req.user.id);
    if (!x) return res.status(404).type('html').send(page(req, 'Не найдено', '<p>Такой заявки нет.</p>'));
    const ev = db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at, id').all(x.id);
    res.type('html').send(page(req, x.title, `<p>Статус: <b>${esc(STATUS[x.status])}</b>${x.eta && !['ready', 'done', 'rejected'].includes(x.status) ? ` · срок ${esc(day(x.eta))}` : ''}</p>
      ${x.doc_code && ['ready', 'done'].includes(x.status) ? `<p><a href="/api/requests/${esc(x.public_id)}/document">Открыть документ</a></p>` : ''}
      <div class="box"><ul>${ev.map((e) => `<li><span class="muted">${esc(dt(e.created_at))}</span> — ${e.kind === 'status' ? `<b>${esc(STATUS[e.status])}</b>` : `<b>${esc(e.author_role === 'student' ? 'Вы' : e.author_name || 'Деканат')}:</b>`} ${esc(e.text || '')}</li>`).join('')}</ul></div>`));
  });

  r.get('/attendance', (req, res) => {
    const a = S.absencesFor(db, req.user.id);
    const c = S.campusFor(db, req.user.id, 14);
    res.type('html').send(page(req, 'Посещаемость', `
      <h2>Пропуски</h2><div class="box"><b>${a.hours} ак. ч</b> (${a.pairs} пар). Лимит: ${a.limits.warning} ч — выговор, ${a.limits.expulsion} ч — отчисление.${a.excused_hours ? `<div class="muted">По справке: ${a.excused_hours} ч (не учитываются)</div>` : ''}
        ${a.list.length ? `<ul>${a.list.map((x) => `<li>${esc(day(x.date))}, ${x.pair} пара — ${esc(x.subject)}${x.excused ? ' <span class="muted">(по справке)</span>' : ''}</li>`).join('')}</ul>` : ''}</div>
      <h2>Входы и выходы</h2><div class="box"><p>За неделю: <b>${hmin(c.week_minutes)}</b></p><table>${c.days.filter((d) => d.events.length).map((d) => `<tr><td>${esc(day(d.date))}</td><td>${d.first_in}–${d.inside ? 'сейчас' : d.last_out || '…'}</td><td>${hmin(d.minutes)}</td></tr>`).join('') || '<tr><td class="muted">Проходов нет</td></tr>'}</table></div>`));
  });

  r.get('/news', (req, res) => {
    const st = req.user.role === 'student' ? S.getStudent(db, req.user.id) : null;
    const list = S.notificationsFor(db, req.user.id, st).slice(0, 40);
    res.type('html').send(page(req, 'Лента', list.length ? list.map((n) => `<div class="box"><b>${esc(n.title)}</b>${n.read ? '' : ' <span class="warn">• новое</span>'}<div>${esc(n.body)}</div><div class="muted">${esc(n.author || '')} · ${esc(dt(n.created_at))}</div></div>`).join('') : '<p>Пока пусто.</p>'));
  });

  return r;
}

module.exports = { createLite };
