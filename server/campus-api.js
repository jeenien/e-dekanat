// Мероприятия, задания к парам, кабинет преподавателя и согласование переносов.
// Правила доступа: студент видит только свои данные, преподаватель — только свои дисциплины и группы.
const express = require('express');
const A = require('./academic');
const S = require('./services');

const nowIso = () => new Date().toISOString();
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ddmm = (iso) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('.');
const short = (u) => `${u.last_name} ${u.first_name[0]}. ${u.middle_name ? u.middle_name[0] + '.' : ''}`.trim();

function createCampusApi(db, auth) {
  const r = express.Router();
  const student = auth.requireAuth('student');
  const teacher = auth.requireAuth('teacher');
  const staff = auth.requireAuth('staff');
  const anyUser = auth.requireAuth();
  const notify = (audience, category, title, body, link, author) => db.prepare('INSERT INTO notifications (audience, category, title, body, link, important, author, created_at) VALUES (?,?,?,?,?,1,?,?)').run(audience, category, title, body, link, author, nowIso());

  // ---------- Мероприятия ----------
  const visibleTo = (req, e) => {
    if (req.user.role !== 'student') return true;
    const st = S.getStudent(db, req.user.id);
    return ['all', `group:${st.group}`, `faculty:${st.faculty}`].includes(e.audience);
  };
  const eventOut = (e, userId) => ({
    id: e.id, title: e.title, description: e.description, place: e.place, start_at: e.start_at, end_at: e.end_at, organizer: e.organizer, audience: e.audience,
    added: Boolean(db.prepare('SELECT 1 FROM user_events WHERE user_id = ? AND event_id = ?').get(userId, e.id)),
  });
  const getEvent = (req, res) => {
    const e = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id));
    if (!e || !visibleTo(req, e)) { res.status(404).json({ error: 'Мероприятие не найдено' }); return null; }
    return e;
  };

  r.get('/events/:id', anyUser, (req, res) => {
    const e = getEvent(req, res); if (!e) return;
    const out = eventOut(e, req.user.id);
    // Студенту сразу показываем, с чем мероприятие пересекается
    if (req.user.role === 'student') {
      const st = S.getStudent(db, req.user.id);
      const day = S.daySchedule(db, st.group, e.start_at.slice(0, 10), req.user.id);
      out.conflicts = day.lessons.filter((l) => S.isActive(l) && l.event_id !== e.id && S.overlaps(e.start_at.slice(11, 16), e.end_at.slice(11, 16), l)).map(S.pairName);
    }
    res.json(out);
  });

  // Добавить в свой календарь: при пересечении с парами — 409 и список, пока студент не подтвердит
  r.post('/events/:id/add', student, (req, res) => {
    const e = getEvent(req, res); if (!e) return;
    const st = S.getStudent(db, req.user.id);
    const day = S.daySchedule(db, st.group, e.start_at.slice(0, 10), req.user.id);
    const conflicts = day.lessons.filter((l) => S.isActive(l) && l.event_id !== e.id && S.overlaps(e.start_at.slice(11, 16), e.end_at.slice(11, 16), l));
    if (conflicts.length && !req.body?.force) return res.status(409).json({ error: 'Мероприятие пересекается с вашим расписанием', conflicts: conflicts.map(S.pairName) });
    db.prepare('INSERT OR IGNORE INTO user_events (user_id, event_id, added_at) VALUES (?,?,?)').run(req.user.id, e.id, nowIso());
    res.json({ ok: true, added: true, overlap: conflicts.length > 0 });
  });
  r.post('/events/:id/remove', student, (req, res) => {
    const e = getEvent(req, res); if (!e) return;
    db.prepare('DELETE FROM user_events WHERE user_id = ? AND event_id = ?').run(req.user.id, e.id);
    res.json({ ok: true, added: false });
  });
  // Файл для календаря телефона
  r.get('/events/:id/ics', anyUser, (req, res) => {
    const e = getEvent(req, res); if (!e) return;
    const t = (s) => s.replace(/[-:]/g, '') + '00';
    const esc = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="event-${e.id}.ics"`);
    res.send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbita concept//RU', 'BEGIN:VEVENT', `UID:event-${e.id}@orbita`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;TZID=Europe/Moscow:${t(e.start_at)}`, `DTEND;TZID=Europe/Moscow:${t(e.end_at)}`,
      `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.place)}`, `DESCRIPTION:${esc(e.description)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
  });

  // Создать мероприятие: деканат — для всех, факультета или группы; преподаватель — для всех или своих групп
  r.post('/events', auth.requireAuth(), (req, res) => {
    if (!['staff', 'teacher'].includes(req.user.role)) return res.status(403).json({ error: 'Недостаточно прав' });
    const { title, description, place, date, start, end, audience } = req.body || {};
    const groups = db.prepare('SELECT DISTINCT group_name, faculty FROM students').all();
    const allowed = req.user.role === 'staff'
      ? ['all', ...groups.map((g) => `group:${g.group_name}`), ...groups.map((g) => `faculty:${g.faculty}`)]
      : ['all', ...db.prepare('SELECT DISTINCT group_name FROM teacher_subjects WHERE teacher_id = ?').all(req.user.id).map((g) => `group:${g.group_name}`)];
    if (!allowed.includes(audience)) return res.status(400).json({ error: 'Выберите, для кого мероприятие' });
    if (typeof title !== 'string' || !title.trim() || title.length > 140) return res.status(400).json({ error: 'Название от 1 до 140 символов' });
    if (typeof description !== 'string' || !description.trim() || description.length > 4000) return res.status(400).json({ error: 'Добавьте описание' });
    if (typeof place !== 'string' || !place.trim() || place.length > 120) return res.status(400).json({ error: 'Укажите место' });
    if (!A.parseDate(date) || !TIME.test(String(start)) || !TIME.test(String(end)) || start >= end) return res.status(400).json({ error: 'Укажите дату и время (окончание позже начала)' });
    const author = short(req.user);
    const id = db.prepare('INSERT INTO events (title, description, place, start_at, end_at, audience, organizer, author_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(title.trim(), description.trim(), place.trim(), `${date}T${start}`, `${date}T${end}`, audience, author, req.user.id, nowIso()).lastInsertRowid;
    db.prepare("INSERT INTO notifications (audience, category, title, body, link, important, author, created_at) VALUES (?, 'event', ?, ?, ?, 0, ?, ?)")
      .run(audience, title.trim(), `${date.split('-').reverse().join('.')}, ${start}–${end} · ${place.trim()}`, `#/events/${id}`, author, nowIso());
    auth.audit(req.user.id, 'event_created', String(id), req.ip);
    res.status(201).json({ ok: true, id });
  });

  // ---------- Пара и задания к ней (студент) ----------
  r.get('/lesson', student, (req, res) => {
    const st = S.getStudent(db, req.user.id);
    const date = String(req.query.date || ''), start = String(req.query.start || '');
    if (!A.parseDate(date) || !TIME.test(start)) return res.status(400).json({ error: 'Некорректный запрос' });
    const l = S.daySchedule(db, st.group, date, req.user.id).lessons.find((x) => x.start === start && !x.event_id);
    if (!l) return res.status(404).json({ error: 'Пара не найдена' });
    const tasks = S.deadlinesFor(db, req.user.id, st.group).filter((d) => d.lesson_date === date && d.lesson_start === start && d.discipline === l.subject);
    res.json({ date, ...l, tasks });
  });

  // ---------- Кабинет преподавателя ----------
  const teaches = (tid, group, subject) => Boolean(db.prepare('SELECT 1 FROM teacher_subjects WHERE teacher_id = ? AND group_name = ? AND subject = ?').get(tid, group, subject));
  function teacherDay(tid, date) {
    const pairs = db.prepare('SELECT group_name, subject FROM teacher_subjects WHERE teacher_id = ?').all(tid);
    const out = [];
    for (const g of [...new Set(pairs.map((p) => p.group_name))]) {
      const subj = pairs.filter((p) => p.group_name === g).map((p) => p.subject);
      for (const l of S.daySchedule(db, g, date).lessons) if (subj.includes(l.subject)) out.push({ ...l, group: g });
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }
  const findTeacherLesson = (tid, group, date, start) => (teacherDay(tid, date).find((l) => l.group === group && l.start === start) || null);

  r.get('/teacher/schedule', teacher, (req, res) => {
    const from = A.parseDate(String(req.query.from || '')) || A.mondayOf(new Date());
    const days = [];
    for (let i = 0; i < 7; i++) { const date = A.isoDate(A.addDays(from, i)); days.push({ date, lessons: teacherDay(req.user.id, date) }); }
    res.json({ days, subjects: db.prepare('SELECT group_name AS "group", subject FROM teacher_subjects WHERE teacher_id = ? ORDER BY group_name').all(req.user.id) });
  });

  r.get('/teacher/lesson', teacher, (req, res) => {
    const { group = '', date = '', start = '' } = req.query;
    const l = A.parseDate(String(date)) && findTeacherLesson(req.user.id, String(group), String(date), String(start));
    if (!l) return res.status(404).json({ error: 'Пара не найдена' });
    const students = db.prepare('SELECT u.id, u.last_name, u.first_name, u.middle_name FROM users u JOIN students s ON s.user_id = u.id WHERE s.group_name = ? ORDER BY u.last_name').all(l.group)
      .map((s) => ({ id: s.id, name: `${s.last_name} ${s.first_name} ${s.middle_name || ''}`.trim(),
        absent: Boolean(db.prepare('SELECT 1 FROM absences WHERE student_id = ? AND date = ? AND pair = ? AND subject = ?').get(s.id, date, l.pair, l.subject)),
        attendance: S.attendanceFor(db, s.id, l.group, l.subject) }));
    const tasks = db.prepare('SELECT id, title, description, due_at FROM deadlines WHERE group_name = ? AND discipline = ? AND lesson_date = ? AND lesson_start = ? ORDER BY due_at').all(l.group, l.subject, date, start);
    const pending = db.prepare("SELECT * FROM reschedules WHERE teacher_id = ? AND group_name = ? AND from_date = ? AND from_start = ? AND status = 'pending'").get(req.user.id, l.group, date, start);
    res.json({ date, ...l, students, tasks, pending_reschedule: pending || null, can_mark: date <= A.isoDate(new Date()) });
  });

  // Отметка посещаемости: отсутствующие → пропуск (2 ак. ч.); пропуски по справке не трогаем
  r.post('/teacher/attendance', teacher, (req, res) => {
    const { group, date, start, absent } = req.body || {};
    const l = A.parseDate(String(date)) && findTeacherLesson(req.user.id, String(group), String(date), String(start));
    if (!l) return res.status(404).json({ error: 'Пара не найдена' });
    if (date > A.isoDate(new Date())) return res.status(400).json({ error: 'Посещаемость отмечается в день пары или позже' });
    if (!S.isActive(l)) return res.status(400).json({ error: 'Пара отменена или перенесена' });
    const ids = new Set((Array.isArray(absent) ? absent : []).map(Number));
    const students = db.prepare('SELECT user_id FROM students WHERE group_name = ?').all(l.group).map((s) => s.user_id);
    for (const sid of students) {
      db.prepare('DELETE FROM absences WHERE student_id = ? AND date = ? AND pair = ? AND subject = ? AND excused = 0').run(sid, date, l.pair, l.subject);
      if (ids.has(sid)) db.prepare('INSERT OR IGNORE INTO absences (student_id, date, pair, subject, excused) VALUES (?,?,?,?,0)').run(sid, date, l.pair, l.subject);
    }
    auth.audit(req.user.id, 'teacher_attendance', `${l.group}:${date}:${start}`, req.ip);
    res.json({ ok: true, absent: [...ids].filter((x) => students.includes(x)).length });
  });

  // Задание к паре с дедлайном — появляется у студентов в «Сегодня», в расписании и в ленте
  r.post('/teacher/assignments', teacher, (req, res) => {
    const { group, date, start, title, description, due_date, due_time } = req.body || {};
    const l = A.parseDate(String(date)) && findTeacherLesson(req.user.id, String(group), String(date), String(start));
    if (!l) return res.status(404).json({ error: 'Пара не найдена' });
    if (typeof title !== 'string' || !title.trim() || title.length > 140) return res.status(400).json({ error: 'Укажите название задания' });
    if (!A.parseDate(String(due_date)) || !TIME.test(String(due_time))) return res.status(400).json({ error: 'Укажите срок сдачи' });
    if (`${due_date}T${due_time}` < `${date}T${start}`) return res.status(400).json({ error: 'Срок сдачи не может быть раньше пары' });
    db.prepare("INSERT INTO deadlines (group_name, discipline, title, due_at, kind, description, lesson_date, lesson_start, teacher_id) VALUES (?,?,?,?, 'homework', ?,?,?,?)")
      .run(l.group, l.subject, title.trim(), `${due_date}T${due_time}:00`, String(description || '').trim().slice(0, 2000) || null, date, start, req.user.id);
    notify(`group:${l.group}`, 'deadline', `Новое задание: ${title.trim()}`, `${l.subject}, к паре ${ddmm(date)}. Срок — ${ddmm(due_date)} ${due_time}.`, `#/schedule/${date}`, short(req.user));
    res.status(201).json({ ok: true });
  });

  // Заявка на перенос пары — уходит в деканат на согласование
  r.post('/teacher/reschedules', teacher, (req, res) => {
    const { group, date, start, to_date, to_start, to_end, to_room, reason } = req.body || {};
    const l = A.parseDate(String(date)) && findTeacherLesson(req.user.id, String(group), String(date), String(start));
    if (!l || !S.isActive(l)) return res.status(404).json({ error: 'Пара не найдена' });
    if (!A.parseDate(String(to_date)) || !TIME.test(String(to_start)) || !TIME.test(String(to_end)) || to_start >= to_end) return res.status(400).json({ error: 'Укажите новую дату и время' });
    if (to_date < A.isoDate(new Date())) return res.status(400).json({ error: 'Нельзя перенести пару в прошлое' });
    if (typeof reason !== 'string' || !reason.trim()) return res.status(400).json({ error: 'Укажите причину переноса' });
    const clash = S.daySchedule(db, l.group, to_date).lessons.filter((x) => S.isActive(x) && !(to_date === date && x.start === start) && S.overlaps(to_start, to_end, x));
    if (clash.length) return res.status(409).json({ error: `Новое время пересекается: ${clash.map(S.pairName).join(' и ')}.`, conflicts: clash.map(S.pairName) });
    if (db.prepare("SELECT 1 FROM reschedules WHERE teacher_id = ? AND group_name = ? AND from_date = ? AND from_start = ? AND status = 'pending'").get(req.user.id, l.group, date, start)) return res.status(409).json({ error: 'По этой паре уже есть заявка на перенос' });
    db.prepare(`INSERT INTO reschedules (teacher_id, group_name, subject, kind, room, from_date, from_start, from_end, from_pair, to_date, to_start, to_end, to_room, reason, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?)`).run(req.user.id, l.group, l.subject, l.kind, l.room, date, l.start, l.end, l.pair, to_date, to_start, to_end, String(to_room || '').trim().slice(0, 40) || l.room, reason.trim().slice(0, 500), nowIso());
    notify('staff', 'schedule', `Заявка на перенос: ${l.subject}`, `${short(req.user)}, группа ${l.group}: ${ddmm(date)} ${l.start} → ${ddmm(to_date)} ${to_start}.`, '#/staff/schedule', short(req.user));
    res.status(201).json({ ok: true });
  });
  const rsOut = (x) => ({ ...x, teacher: (() => { const u = db.prepare('SELECT * FROM users WHERE id = ?').get(x.teacher_id); return u ? short(u) : ''; })() });
  r.get('/teacher/reschedules', teacher, (req, res) => res.json(db.prepare('SELECT * FROM reschedules WHERE teacher_id = ? ORDER BY created_at DESC').all(req.user.id).map(rsOut)));

  // Посещаемость по своим дисциплинам
  r.get('/teacher/attendance', teacher, (req, res) => {
    const rows = db.prepare('SELECT group_name, subject FROM teacher_subjects WHERE teacher_id = ? ORDER BY group_name, subject').all(req.user.id);
    res.json(rows.map((t) => ({ group: t.group_name, subject: t.subject,
      students: db.prepare('SELECT u.id, u.last_name, u.first_name FROM users u JOIN students s ON s.user_id = u.id WHERE s.group_name = ? ORDER BY u.last_name').all(t.group_name)
        .map((s) => ({ name: `${s.last_name} ${s.first_name}`, attendance: S.attendanceFor(db, s.id, t.group_name, t.subject),
          missed: db.prepare('SELECT COUNT(*) n FROM absences WHERE student_id = ? AND subject = ? AND excused = 0').get(s.id, t.subject).n })) })));
  });

  // ---------- Деканат: согласование переносов ----------
  r.get('/staff/reschedules', staff, (req, res) => res.json(db.prepare("SELECT * FROM reschedules ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC").all().map(rsOut)));
  r.post('/staff/reschedules/:id', staff, (req, res) => {
    const x = db.prepare("SELECT * FROM reschedules WHERE id = ? AND status = 'pending'").get(Number(req.params.id));
    if (!x) return res.status(404).json({ error: 'Заявка не найдена или уже рассмотрена' });
    const decision = req.body?.decision;
    const comment = String(req.body?.comment || '').trim().slice(0, 500);
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Одобрить или отклонить?' });
    if (decision === 'reject' && !comment) return res.status(400).json({ error: 'Укажите причину отказа' });
    const who = short(req.user);
    if (decision === 'approve') {
      const clash = S.daySchedule(db, x.group_name, x.to_date).lessons.filter((l) => S.isActive(l) && !(x.to_date === x.from_date && l.start === x.from_start) && S.overlaps(x.to_start, x.to_end, l));
      if (clash.length) return res.status(409).json({ error: `Новое время уже занято: ${clash.map(S.pairName).join(' и ')}.` });
      db.prepare("INSERT INTO schedule_changes (group_name, date, pair, type, subject, kind, new_room, new_date, note, start_time, end_time) VALUES (?,?,?, 'move', ?,?,?,?,?,?,?)")
        .run(x.group_name, x.from_date, x.from_pair, x.subject, x.kind, x.to_room, x.to_date, `Перенос по заявке преподавателя`, x.to_start, x.to_end);
      notify(`group:${x.group_name}`, 'schedule', `Перенос пары: ${x.subject}`, `${ddmm(x.from_date)} ${x.from_start} → ${ddmm(x.to_date)} ${x.to_start}–${x.to_end}, аудитория ${x.to_room}.`, `#/schedule/${x.to_date}`, who);
      notify(`user:${x.teacher_id}`, 'request', 'Заявка на перенос одобрена', `${x.subject}, ${x.group_name}: ${ddmm(x.from_date)} → ${ddmm(x.to_date)} ${x.to_start}.${comment ? ' ' + comment : ''}`, '#/teacher/reschedules', who);
    } else {
      notify(`user:${x.teacher_id}`, 'request', 'Заявка на перенос отклонена', `${x.subject}, ${x.group_name}, ${ddmm(x.from_date)}: ${comment}`, '#/teacher/reschedules', who);
    }
    db.prepare('UPDATE reschedules SET status = ?, staff_comment = ?, decided_at = ? WHERE id = ?').run(decision === 'approve' ? 'approved' : 'rejected', comment || null, nowIso(), x.id);
    auth.audit(req.user.id, 'staff_reschedule', `${x.id}:${decision}`, req.ip);
    res.json({ ok: true });
  });

  return r;
}

module.exports = { createCampusApi };
