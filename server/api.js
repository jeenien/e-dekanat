// HTTP API кабинета. Правило безопасности: личность берется только из сессии (req.user),
// а любой объект по id ищется с условием «принадлежит этому студенту» — иначе 404.
const express = require('express');
const A = require('./academic');
const S = require('./services');
const R = require('./requests');
const D = require('./documents');
const assistant = require('./assistant');
const { TYPES } = require('./catalog');
const { AI_ENABLED } = require('./config');

const todayParam = (q) => (A.parseDate(q) ? q : A.isoDate(new Date()));
const nowIso = () => new Date().toISOString();

function createApi(db, auth) {
  const api = express.Router();
  const student = auth.requireAuth('student');
  const staff = auth.requireAuth('staff');
  const anyUser = auth.requireAuth();

  // ---------- Вход ----------
  api.post('/auth/login', auth.login);
  api.post('/auth/logout', auth.logout);
  api.post('/auth/password', anyUser, auth.changePassword);
  api.get('/auth/me', (req, res) => {
    if (!req.user) return res.json({ user: null, ai: AI_ENABLED });
    const base = { id: req.user.id, role: req.user.role, first_name: req.user.first_name, last_name: req.user.last_name, middle_name: req.user.middle_name, position: req.user.position };
    res.json({ user: req.user.role === 'student' ? { ...base, ...S.getStudent(db, req.user.id) } : base, ai: AI_ENABLED });
  });

  // ---------- Устройства и безопасность ----------
  api.get('/security', anyUser, (req, res) => {
    const sessions = db.prepare('SELECT token_hash, created_at, last_seen, device FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC').all(req.user.id, Date.now())
      .map((s) => ({ device: s.device, created_at: new Date(s.created_at).toISOString(), last_seen: new Date(s.last_seen).toISOString(), current: s.token_hash === req.sessionHash }));
    const log = db.prepare("SELECT action, detail, created_at FROM audit_log WHERE user_id = ? AND action IN ('login','login_failed','password_changed','sessions_revoked') ORDER BY id DESC LIMIT 8").all(req.user.id);
    res.json({ sessions, log });
  });
  api.post('/security/revoke-others', anyUser, (req, res) => {
    const r = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(req.user.id, req.sessionHash);
    auth.audit(req.user.id, 'sessions_revoked', String(r.changes), req.ip);
    res.json({ ok: true, revoked: r.changes });
  });

  // ---------- Студент: главная ----------
  api.get('/dashboard', student, (req, res) => {
    const st = S.getStudent(db, req.user.id);
    const today = todayParam(req.query.date);
    const week = S.rangeSchedule(db, st.group, today, 8, req.user.id);
    const g = S.gradesOverview(db, req.user.id);
    const notif = S.notificationsFor(db, req.user.id, st);
    const reqs = db.prepare("SELECT * FROM requests WHERE student_id = ? AND (status NOT IN ('done','rejected') OR updated_at > ?) ORDER BY updated_at DESC LIMIT 4").all(req.user.id, new Date(Date.now() - 7 * 864e5).toISOString());
    const changes = week.flatMap((d) => d.lessons.filter((l) => l.change && l.change.type !== 'retake').map((l) => ({ date: d.date, ...l })));
    const abs = S.absencesFor(db, req.user.id);
    const campus = S.campusFor(db, req.user.id, 7);
    res.json({
      today: week[0], next_days: week.slice(1),
      changes,
      deadlines: S.deadlinesFor(db, req.user.id, st.group).filter((d) => new Date(d.due_at) > Date.now() - 864e5).slice(0, 6),
      requests: reqs.map((r) => R.serialize(r)),
      notifications: { unread: notif.filter((n) => !n.read).length, latest: notif.filter((n) => !n.read).slice(0, 3) },
      grades: { gpa: g.summary.gpa, risks: g.summary.risks, debts: g.summary.debts, stipend: g.summary.stipend, current: g.current.map((c) => ({ name: c.name, earned: c.earned, sem_max: c.sem_max, status: c.status, label: c.label })) },
      session: g.session,
      retakes: S.retakesFor(db, req.user.id),
      absences: { hours: abs.hours, excused_hours: abs.excused_hours, limits: abs.limits, level: abs.level, left_to_warning: abs.left_to_warning },
      campus: { today: campus.days[0], week_minutes: campus.week_minutes, week_days: campus.week_days },
    });
  });

  // ---------- Расписание ----------
  api.get('/schedule', student, (req, res) => {
    const st = S.getStudent(db, req.user.id);
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
    const from = todayParam(req.query.from);
    res.json({ group: st.group, pairs: A.PAIRS, days: S.rangeSchedule(db, st.group, from, days, req.user.id) });
  });

  // Экспорт в календарь телефона (.ics) на 4 недели вперед
  api.get('/schedule.ics', student, (req, res) => {
    const st = S.getStudent(db, req.user.id);
    const days = S.rangeSchedule(db, st.group, A.isoDate(new Date()), 28, req.user.id);
    const esc = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbita concept//RU', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Пары ${st.group}`, 'X-WR-TIMEZONE:Europe/Moscow'];
    for (const d of days) for (const l of d.lessons) {
      if (l.change?.type === 'cancel') continue;
      const ymd = d.date.replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${ymd}-${l.start.replace(':', '')}-${st.group}@orbita`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART;TZID=Europe/Moscow:${ymd}T${l.start.replace(':', '')}00`, `DTEND;TZID=Europe/Moscow:${ymd}T${l.end.replace(':', '')}00`,
        `SUMMARY:${esc(`${l.subject} · ${l.kind}`)}`, `LOCATION:${esc(l.room)}`, ...(l.teacher ? [`DESCRIPTION:${esc(l.teacher)}`] : []), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="schedule.ics"`);
    res.send(lines.join('\r\n'));
  });

  // ---------- Успеваемость ----------
  api.get('/grades', student, (req, res) => res.json(S.gradesOverview(db, req.user.id)));

  // ---------- Посещаемость и проходы (только свои) ----------
  api.get('/attendance', student, (req, res) => {
    res.json({ absences: S.absencesFor(db, req.user.id), campus: S.campusFor(db, req.user.id, 7), retakes: S.retakesFor(db, req.user.id) });
  });

  // ---------- Дедлайны ----------
  api.get('/deadlines', student, (req, res) => {
    const st = S.getStudent(db, req.user.id);
    res.json(S.deadlinesFor(db, req.user.id, st.group));
  });
  api.post('/deadlines/:id/toggle', student, (req, res) => {
    const st = S.getStudent(db, req.user.id);
    const dl = db.prepare('SELECT id FROM deadlines WHERE id = ? AND group_name = ?').get(Number(req.params.id), st.group);
    if (!dl) return res.status(404).json({ error: 'Не найдено' });
    const done = db.prepare('SELECT 1 FROM deadline_done WHERE user_id = ? AND deadline_id = ?').get(req.user.id, dl.id);
    if (done) db.prepare('DELETE FROM deadline_done WHERE user_id = ? AND deadline_id = ?').run(req.user.id, dl.id);
    else db.prepare('INSERT INTO deadline_done (user_id, deadline_id) VALUES (?,?)').run(req.user.id, dl.id);
    res.json({ done: !done });
  });

  // ---------- Заявки ----------
  api.get('/request-types', student, (req, res) => res.json(R.catalogFor(db, req.user.id)));
  api.get('/requests', student, (req, res) => {
    const rows = db.prepare('SELECT * FROM requests WHERE student_id = ? ORDER BY updated_at DESC').all(req.user.id);
    res.json(rows.map((r) => R.serialize(r)));
  });
  api.post('/requests', student, (req, res) => {
    const { type, fields } = req.body || {};
    const r = R.createRequest(db, req.user, String(type || ''), fields && typeof fields === 'object' ? fields : {});
    if (r.status === 201) auth.audit(req.user.id, 'request_created', type, req.ip);
    res.status(r.status).json(r.body);
  });
  const ownRequest = (req) => db.prepare('SELECT * FROM requests WHERE public_id = ? AND student_id = ?').get(String(req.params.id), req.user.id);
  const eventsOf = (id) => db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at, id').all(id);
  api.get('/requests/:id', student, (req, res) => {
    const r = ownRequest(req);
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    res.json(R.serialize(r, eventsOf(r.id)));
  });
  api.post('/requests/:id/messages', student, (req, res) => {
    const r = ownRequest(req);
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 2000) return res.status(400).json({ error: 'Сообщение от 1 до 2000 символов' });
    if (['done', 'rejected'].includes(r.status)) return res.status(409).json({ error: 'Заявка закрыта — создайте новое обращение' });
    const name = `${req.user.first_name} ${req.user.last_name}`;
    db.prepare("INSERT INTO request_events (request_id, kind, author_role, author_name, text, created_at) VALUES (?, 'message', 'student', ?, ?, ?)").run(r.id, name, text, nowIso());
    // Ответ на запрос уточнения возвращает заявку в работу
    if (r.status === 'need_info') {
      db.prepare("UPDATE requests SET status = 'in_progress', updated_at = ? WHERE id = ?").run(nowIso(), r.id);
      db.prepare("INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?, 'status', 'in_progress', 'system', 'Орбита', 'Уточнение получено, заявка снова в работе.', ?)").run(r.id, nowIso());
    } else db.prepare('UPDATE requests SET updated_at = ? WHERE id = ?').run(nowIso(), r.id);
    res.status(201).json(R.serialize(ownRequest(req), eventsOf(r.id)));
  });
  api.post('/requests/:id/cancel', student, (req, res) => {
    const r = ownRequest(req);
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    if (!['submitted', 'need_info', 'in_progress'].includes(r.status) && !(r.type === 'appointment' && r.status === 'ready')) return res.status(409).json({ error: 'Эту заявку уже нельзя отозвать' });
    db.prepare("UPDATE requests SET status = 'rejected', updated_at = ? WHERE id = ?").run(nowIso(), r.id);
    db.prepare("INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?, 'status', 'rejected', 'student', ?, 'Отозвана студентом', ?)").run(r.id, req.user.first_name, nowIso());
    res.json(R.serialize(ownRequest(req), eventsOf(r.id)));
  });
  api.post('/requests/:id/rate', student, (req, res) => {
    const r = ownRequest(req);
    const v = Number(req.body?.rating);
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    if (!['ready', 'done'].includes(r.status) || !(v >= 1 && v <= 5)) return res.status(400).json({ error: 'Оценить можно выполненную заявку, от 1 до 5' });
    db.prepare('UPDATE requests SET rating = ? WHERE id = ?').run(Math.round(v), r.id);
    res.json({ ok: true });
  });

  // ---------- Уведомления ----------
  api.get('/notifications', anyUser, (req, res) => {
    const st = req.user.role === 'student' ? S.getStudent(db, req.user.id) : null;
    res.json(S.notificationsFor(db, req.user.id, st));
  });
  api.post('/notifications/read', anyUser, (req, res) => {
    const st = req.user.role === 'student' ? S.getStudent(db, req.user.id) : null;
    const visible = new Set(S.notificationsFor(db, req.user.id, st).filter((n) => !n.virtual).map((n) => n.id));
    const ids = req.body?.all ? [...visible] : (Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id) => visible.has(id)) : []);
    const ins = db.prepare('INSERT OR IGNORE INTO notification_reads (user_id, notification_id) VALUES (?,?)');
    for (const id of ids) ins.run(req.user.id, id);
    res.json({ ok: true, marked: ids.length });
  });

  // ---------- Помощник ----------
  const aiHits = new Map();
  api.post('/assistant', student, async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 800) return res.status(400).json({ error: 'Вопрос от 1 до 800 символов' });
    // не больше 20 вопросов в 10 минут на студента — защита бюджета на ИИ
    const now = Date.now();
    const hits = (aiHits.get(req.user.id) || []).filter((t) => now - t < 600e3);
    if (hits.length >= 20) return res.status(429).json({ error: 'Слишком много вопросов подряд. Передохните пару минут 🙂' });
    hits.push(now); aiHits.set(req.user.id, hits);
    res.json(await assistant.ask(db, req.user.id, text, Array.isArray(req.body?.history) ? req.body.history : [], todayParam(req.body?.date)));
  });

  // ---------- Сотрудник деканата ----------
  const STAFF_NAME = (u) => `${u.last_name} ${u.first_name[0]}. ${u.middle_name ? u.middle_name[0] + '.' : ''}`.trim();
  const staffRow = (r) => ({ ...R.serialize(r), student: { name: `${r.last_name} ${r.first_name} ${r.middle_name || ''}`.trim(), group: r.group_name, course: r.course, faculty: r.faculty, funding: r.funding } });

  api.get('/staff/stats', staff, (req, res) => {
    const by = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM requests GROUP BY status').all().map((x) => [x.status, x.n]));
    const overdue = db.prepare("SELECT COUNT(*) n FROM requests WHERE status IN ('submitted','in_progress') AND eta < ?").get(A.isoDate(new Date())).n;
    const rating = db.prepare('SELECT AVG(rating) a, COUNT(rating) n FROM requests WHERE rating IS NOT NULL').get();
    res.json({ by_status: by, overdue, rating: rating.a ? Math.round(rating.a * 10) / 10 : null, rated: rating.n, students: db.prepare("SELECT COUNT(*) n FROM users WHERE role='student'").get().n });
  });
  api.get('/staff/requests', staff, (req, res) => {
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
    const rows = db.prepare(`SELECT r.*, u.last_name, u.first_name, u.middle_name, s.group_name, s.course, s.faculty, s.funding FROM requests r
      JOIN users u ON u.id = r.student_id JOIN students s ON s.user_id = r.student_id ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'need_info' THEN 2 ELSE 3 END, r.updated_at DESC`).all();
    res.json(rows.filter((r) => (!status || r.status === status) && (!q || `${r.last_name} ${r.first_name} ${r.group_name} ${r.title} ${r.public_id}`.toLowerCase().includes(q))).map(staffRow));
  });
  const staffReq = (id) => db.prepare(`SELECT r.*, u.last_name, u.first_name, u.middle_name, s.group_name, s.course, s.faculty, s.funding FROM requests r
      JOIN users u ON u.id = r.student_id JOIN students s ON s.user_id = r.student_id WHERE r.public_id = ?`).get(String(id));
  api.get('/staff/requests/:id', staff, (req, res) => {
    const r = staffReq(req.params.id);
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    res.json({ ...staffRow(r), events: R.serialize(r, eventsOf(r.id)).events });
  });
  api.post('/staff/requests/:id/status', staff, (req, res) => {
    const r = staffReq(req.params.id);
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    const status = String(req.body?.status || '');
    const comment = String(req.body?.comment || '').trim().slice(0, 2000);
    if (!R.STATUS[status] || status === 'submitted') return res.status(400).json({ error: 'Недопустимый статус' });
    if ((status === 'need_info' || status === 'rejected') && !comment) return res.status(400).json({ error: 'Объясните студенту причину в комментарии' });
    const t = TYPES[r.type];
    const docCode = (status === 'ready' && t?.document && !r.doc_code) ? require('./security').publicId('D') : r.doc_code;
    db.prepare('UPDATE requests SET status = ?, updated_at = ?, assignee = ?, doc_code = ? WHERE id = ?').run(status, nowIso(), STAFF_NAME(req.user), docCode, r.id);
    db.prepare("INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?, 'status', ?, 'staff', ?, ?, ?)").run(r.id, status, STAFF_NAME(req.user), comment || null, nowIso());
    const msg = { in_progress: 'взята в работу', need_info: 'нужно уточнение', ready: 'готова', done: 'завершена', rejected: 'отклонена' }[status];
    R.notifyStudent(db, r.student_id, `Заявка «${r.title}»: ${msg}`, comment || `Статус изменен: ${R.STATUS[status]}.`, `#/requests/${r.public_id}`);
    auth.audit(req.user.id, 'staff_status', `${r.public_id}:${status}`, req.ip);
    res.json({ ok: true });
  });
  api.post('/staff/requests/:id/messages', staff, (req, res) => {
    const r = staffReq(req.params.id);
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 2000) return res.status(400).json({ error: 'Сообщение от 1 до 2000 символов' });
    db.prepare("INSERT INTO request_events (request_id, kind, author_role, author_name, text, created_at) VALUES (?, 'message', 'staff', ?, ?, ?)").run(r.id, STAFF_NAME(req.user), text, nowIso());
    db.prepare('UPDATE requests SET updated_at = ? WHERE id = ?').run(nowIso(), r.id);
    R.notifyStudent(db, r.student_id, `Новое сообщение по заявке «${r.title}»`, text.slice(0, 180), `#/requests/${r.public_id}`);
    res.status(201).json({ ok: true });
  });
  api.get('/staff/groups', staff, (req, res) => {
    res.json(db.prepare('SELECT DISTINCT group_name, faculty FROM students ORDER BY group_name').all().map((g) => ({ group: g.group_name, faculty: g.faculty })));
  });
  api.post('/staff/notifications', staff, (req, res) => {
    const { audience, title, body, important } = req.body || {};
    const groups = db.prepare('SELECT DISTINCT group_name, faculty FROM students').all();
    const allowed = new Set(['all', ...groups.map((g) => `group:${g.group_name}`), ...groups.map((g) => `faculty:${g.faculty}`)]);
    if (!allowed.has(audience)) return res.status(400).json({ error: 'Выберите получателей' });
    if (typeof title !== 'string' || !title.trim() || title.length > 140) return res.status(400).json({ error: 'Заголовок от 1 до 140 символов' });
    if (typeof body !== 'string' || !body.trim() || body.length > 3000) return res.status(400).json({ error: 'Текст от 1 до 3000 символов' });
    db.prepare("INSERT INTO notifications (audience, category, title, body, important, author, created_at) VALUES (?, 'news', ?, ?, ?, ?, ?)").run(audience, title.trim(), body.trim(), important ? 1 : 0, STAFF_NAME(req.user), nowIso());
    auth.audit(req.user.id, 'staff_announce', audience, req.ip);
    res.status(201).json({ ok: true });
  });
  api.post('/staff/schedule-changes', staff, (req, res) => {
    const { group, date, pair, type, new_room, note } = req.body || {};
    const p = Number(pair);
    if (!db.prepare('SELECT 1 FROM students WHERE group_name = ?').get(group)) return res.status(400).json({ error: 'Неизвестная группа' });
    // Новая пара в любое время: проверяем, что она не накладывается на занятия группы
    if (type === 'extra') {
      const { start, end, subject, kind, room } = req.body;
      const tm = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!A.parseDate(date)) return res.status(400).json({ error: 'Укажите дату' });
      if (!tm.test(String(start)) || !tm.test(String(end)) || start >= end) return res.status(400).json({ error: 'Укажите время начала и окончания (окончание позже начала)' });
      if (start < '07:00' || end > '22:30') return res.status(400).json({ error: 'Занятия можно ставить с 07:00 до 22:30' });
      if (typeof subject !== 'string' || !subject.trim() || subject.length > 150) return res.status(400).json({ error: 'Укажите дисциплину' });
      if (typeof room !== 'string' || !room.trim() || room.length > 40) return res.status(400).json({ error: 'Укажите аудиторию' });
      const day = S.daySchedule(db, group, date);
      const clash = day.lessons.filter((l) => l.change?.type !== 'cancel' && start < l.end && l.start < end);
      if (clash.length) {
        const list = clash.map((l) => `${l.pair ? l.pair + '-я пара' : 'занятие'} ${l.start}–${l.end} «${l.subject}»`).join(' и ');
        return res.status(409).json({ error: `Время пересекается: ${list}. Выберите другое время или сначала отмените ${clash.length > 1 ? 'эти пары' : 'эту пару'}.`, conflicts: clash.map((l) => ({ pair: l.pair, start: l.start, end: l.end, subject: l.subject })) });
      }
      const k = ['Лекция', 'Семинар', 'Консультация'].includes(kind) ? kind : 'Семинар';
      db.prepare("INSERT INTO schedule_changes (group_name, date, pair, type, subject, kind, new_room, note, start_time, end_time) VALUES (?,?,0,'extra',?,?,?,?,?,?)")
        .run(group, date, subject.trim(), k, room.trim(), String(note || '').slice(0, 200) || null, start, end);
      const dd = date.split('-').reverse().join('.');
      db.prepare("INSERT INTO notifications (audience, category, title, body, link, important, author, created_at) VALUES (?, 'schedule', ?, ?, ?, 1, ?, ?)")
        .run(`group:${group}`, `Новое занятие: ${subject.trim()}`, `${dd}, ${start}–${end}, аудитория ${room.trim()} (${k.toLowerCase()}).${note ? ' ' + String(note).slice(0, 200) : ''}`, `#/schedule/${date}`, STAFF_NAME(req.user), nowIso());
      auth.audit(req.user.id, 'staff_schedule', `${group}:${date}:${start}:extra`, req.ip);
      return res.status(201).json({ ok: true });
    }
    if (!A.parseDate(date) || !A.PAIRS[p]) return res.status(400).json({ error: 'Укажите дату и номер пары' });
    if (!['cancel', 'room'].includes(type)) return res.status(400).json({ error: 'Тип: отмена, смена аудитории или новая пара' });
    if (type === 'room' && (typeof new_room !== 'string' || !new_room.trim() || new_room.length > 30)) return res.status(400).json({ error: 'Укажите новую аудиторию' });
    const day = S.daySchedule(db, group, date);
    const lesson = day.lessons.find((l) => l.pair === p);
    if (!lesson) return res.status(404).json({ error: 'В этот день такой пары нет' });
    db.prepare('INSERT INTO schedule_changes (group_name, date, pair, type, subject, kind, new_room, note) VALUES (?,?,?,?,?,?,?,?)').run(group, date, p, type, lesson.subject, lesson.kind, type === 'room' ? new_room.trim() : null, String(note || '').slice(0, 200) || null);
    const dd = date.split('-').reverse().join('.');
    const title = type === 'cancel' ? `Отмена пары: ${lesson.subject}` : `Смена аудитории: ${lesson.subject}`;
    const text = type === 'cancel' ? `${p} пара ${dd} отменена.${note ? ' ' + note : ''}` : `${p} пара ${dd} пройдет в аудитории ${new_room.trim()} вместо ${lesson.room}.${note ? ' ' + note : ''}`;
    db.prepare("INSERT INTO notifications (audience, category, title, body, link, important, author, created_at) VALUES (?, 'schedule', ?, ?, '#/schedule', 1, ?, ?)").run(`group:${group}`, title, text, STAFF_NAME(req.user), nowIso());
    auth.audit(req.user.id, 'staff_schedule', `${group}:${date}:${p}:${type}`, req.ip);
    res.status(201).json({ ok: true });
  });
  // Посещаемость студентов для деканата
  api.get('/staff/students', staff, (req, res) => {
    const rows = db.prepare("SELECT u.id, u.last_name, u.first_name, u.middle_name, s.group_name, s.course, s.faculty FROM users u JOIN students s ON s.user_id = u.id ORDER BY s.group_name, u.last_name").all();
    res.json(rows.map((r) => {
      const a = S.absencesFor(db, r.id);
      const c = S.campusFor(db, r.id, 7);
      return { id: r.id, name: `${r.last_name} ${r.first_name} ${r.middle_name || ''}`.trim(), group: r.group_name, course: r.course, faculty: r.faculty,
        absence_hours: a.hours, absence_level: a.level, week_minutes: c.week_minutes, week_days: c.week_days, inside: c.inside, today_in: c.days[0].first_in, today_out: c.days[0].last_out };
    }));
  });
  api.get('/staff/students/:id/attendance', staff, (req, res) => {
    const id = Number(req.params.id);
    const r = db.prepare("SELECT u.id, u.last_name, u.first_name, u.middle_name, s.group_name, s.course FROM users u JOIN students s ON s.user_id = u.id WHERE u.id = ?").get(id);
    if (!r) return res.status(404).json({ error: 'Студент не найден' });
    auth.audit(req.user.id, 'staff_view_attendance', String(id), req.ip);
    res.json({ student: { id: r.id, name: `${r.last_name} ${r.first_name} ${r.middle_name || ''}`.trim(), group: r.group_name, course: r.course },
      absences: S.absencesFor(db, id), campus: S.campusFor(db, id, 7), retakes: S.retakesFor(db, id) });
  });
  // Пересдачи назначает деканат
  api.post('/staff/retakes', staff, (req, res) => {
    const { student_id, discipline, date, pair, room, examiner } = req.body || {};
    const st = db.prepare('SELECT user_id FROM students WHERE user_id = ?').get(Number(student_id));
    if (!st) return res.status(400).json({ error: 'Выберите студента' });
    if (typeof discipline !== 'string' || !discipline.trim() || discipline.length > 150) return res.status(400).json({ error: 'Укажите дисциплину' });
    if (!A.parseDate(date) || !A.PAIRS[Number(pair)]) return res.status(400).json({ error: 'Укажите дату и пару' });
    if (typeof room !== 'string' || !room.trim() || room.length > 30) return res.status(400).json({ error: 'Укажите аудиторию' });
    const exr = String(examiner || '').trim().slice(0, 80) || 'Кафедра';
    const attempt = db.prepare('SELECT COUNT(*) n FROM retakes WHERE student_id = ? AND discipline = ?').get(st.user_id, discipline.trim()).n + 1;
    db.prepare('INSERT INTO retakes (student_id, discipline, date, pair, room, examiner, attempt, set_by) VALUES (?,?,?,?,?,?,?,?)').run(st.user_id, discipline.trim(), date, Number(pair), room.trim(), exr, attempt, STAFF_NAME(req.user));
    const dd = date.split('-').reverse().join('.');
    db.prepare("INSERT INTO notifications (audience, category, title, body, link, important, author, created_at) VALUES (?, 'grades', 'Назначена пересдача', ?, ?, 1, ?, ?)")
      .run(`user:${st.user_id}`, `«${discipline.trim()}»: ${dd}, ${A.PAIRS[Number(pair)][0]}, аудитория ${room.trim()}. Пересдачу назначили деканат и кафедра — заявление не нужно.`, `#/schedule/${date}`, STAFF_NAME(req.user), nowIso());
    auth.audit(req.user.id, 'staff_retake', `${st.user_id}:${date}`, req.ip);
    res.status(201).json({ ok: true, attempt });
  });

  api.get('/staff/schedule', staff, (req, res) => {
    const group = String(req.query.group || '');
    const date = todayParam(req.query.date);
    if (!db.prepare('SELECT 1 FROM students WHERE group_name = ?').get(group)) return res.status(400).json({ error: 'Неизвестная группа' });
    res.json(S.daySchedule(db, group, date));
  });

  // Документы: только владелец заявки
  api.get('/requests/:id/document', student, async (req, res) => {
    const r = ownRequest(req);
    if (!r || !r.doc_code || !['ready', 'done'].includes(r.status)) return res.status(404).send('Документ не найден');
    res.type('html').send(await D.renderDocument(db, req, r));
  });

  api.use((req, res) => res.status(404).json({ error: 'Не найдено' }));
  return api;
}

module.exports = { createApi };
