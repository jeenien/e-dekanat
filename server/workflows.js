// Общие действия с заявками и переносами — одни и те же для полной и облегченной версии.
// Каждая функция возвращает { ok: true } или { status, error }. Права проверяет вызывающий код.
const A = require('./academic');
const S = require('./services');
const R = require('./requests');
const { TYPES } = require('./catalog');
const { publicId } = require('./security');

const nowIso = () => new Date().toISOString();
const short = (u) => `${u.last_name} ${u.first_name[0]}. ${u.middle_name ? u.middle_name[0] + '.' : ''}`.trim();
const ddmm = (iso) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('.');
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const notify = (db, audience, category, title, body, link, author) => db.prepare('INSERT INTO notifications (audience, category, title, body, link, important, author, created_at) VALUES (?,?,?,?,?,1,?,?)').run(audience, category, title, body, link, author, nowIso());

// ---------- Студент ----------
function studentMessage(db, user, r, text) {
  text = String(text || '').trim();
  if (!text || text.length > 2000) return { status: 400, error: 'Сообщение от 1 до 2000 символов' };
  if (['done', 'rejected'].includes(r.status)) return { status: 409, error: 'Заявка закрыта — создайте новое обращение' };
  db.prepare("INSERT INTO request_events (request_id, kind, author_role, author_name, text, created_at) VALUES (?, 'message', 'student', ?, ?, ?)").run(r.id, `${user.first_name} ${user.last_name}`, text, nowIso());
  // Ответ на запрос уточнения возвращает заявку в работу
  if (r.status === 'need_info') {
    db.prepare("UPDATE requests SET status = 'in_progress', updated_at = ? WHERE id = ?").run(nowIso(), r.id);
    db.prepare("INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?, 'status', 'in_progress', 'system', 'Орбита', 'Уточнение получено, заявка снова в работе.', ?)").run(r.id, nowIso());
  } else db.prepare('UPDATE requests SET updated_at = ? WHERE id = ?').run(nowIso(), r.id);
  return { ok: true };
}
function studentCancel(db, user, r) {
  if (!['submitted', 'need_info', 'in_progress'].includes(r.status)) return { status: 409, error: 'Эту заявку уже нельзя отозвать' };
  db.prepare("UPDATE requests SET status = 'rejected', updated_at = ? WHERE id = ?").run(nowIso(), r.id);
  db.prepare("INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?, 'status', 'rejected', 'student', ?, 'Отозвана студентом', ?)").run(r.id, user.first_name, nowIso());
  return { ok: true };
}

// ---------- Деканат ----------
function staffSetStatus(db, user, r, status, comment) {
  comment = String(comment || '').trim().slice(0, 2000);
  if (!R.STATUS[status] || status === 'submitted') return { status: 400, error: 'Недопустимый статус' };
  if ((status === 'need_info' || status === 'rejected') && !comment) return { status: 400, error: 'Объясните студенту причину в комментарии' };
  const docCode = (status === 'ready' && TYPES[r.type]?.document && !r.doc_code) ? publicId('D') : r.doc_code;
  db.prepare('UPDATE requests SET status = ?, updated_at = ?, assignee = ?, doc_code = ? WHERE id = ?').run(status, nowIso(), short(user), docCode, r.id);
  db.prepare("INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?, 'status', ?, 'staff', ?, ?, ?)").run(r.id, status, short(user), comment || null, nowIso());
  const msg = { in_progress: 'взята в работу', need_info: 'нужно уточнение', ready: 'готова', done: 'завершена', rejected: 'отклонена' }[status];
  R.notifyStudent(db, r.student_id, `Заявка «${r.title}»: ${msg}`, comment || `Статус изменен: ${R.STATUS[status]}.`, `#/requests/${r.public_id}`);
  return { ok: true };
}
function staffMessage(db, user, r, text) {
  text = String(text || '').trim();
  if (!text || text.length > 2000) return { status: 400, error: 'Сообщение от 1 до 2000 символов' };
  db.prepare("INSERT INTO request_events (request_id, kind, author_role, author_name, text, created_at) VALUES (?, 'message', 'staff', ?, ?, ?)").run(r.id, short(user), text, nowIso());
  db.prepare('UPDATE requests SET updated_at = ? WHERE id = ?').run(nowIso(), r.id);
  R.notifyStudent(db, r.student_id, `Новое сообщение по заявке «${r.title}»`, text.slice(0, 180), `#/requests/${r.public_id}`);
  return { ok: true };
}
function decideReschedule(db, user, id, decision, comment) {
  const x = db.prepare("SELECT * FROM reschedules WHERE id = ? AND status = 'pending'").get(Number(id));
  if (!x) return { status: 404, error: 'Заявка не найдена или уже рассмотрена' };
  comment = String(comment || '').trim().slice(0, 500);
  if (!['approve', 'reject'].includes(decision)) return { status: 400, error: 'Одобрить или отклонить?' };
  if (decision === 'reject' && !comment) return { status: 400, error: 'Укажите причину отказа' };
  const who = short(user);
  if (decision === 'approve') {
    const clash = S.daySchedule(db, x.group_name, x.to_date).lessons.filter((l) => S.isActive(l) && !(x.to_date === x.from_date && l.start === x.from_start) && S.overlaps(x.to_start, x.to_end, l));
    if (clash.length) return { status: 409, error: `Новое время уже занято: ${clash.map(S.pairName).join(' и ')}.` };
    db.prepare("INSERT INTO schedule_changes (group_name, date, pair, type, subject, kind, new_room, new_date, note, start_time, end_time) VALUES (?,?,?, 'move', ?,?,?,?,?,?,?)")
      .run(x.group_name, x.from_date, x.from_pair, x.subject, x.kind, x.to_room, x.to_date, 'Перенос по заявке преподавателя', x.to_start, x.to_end);
    notify(db, `group:${x.group_name}`, 'schedule', `Перенос пары: ${x.subject}`, `${ddmm(x.from_date)} ${x.from_start} → ${ddmm(x.to_date)} ${x.to_start}–${x.to_end}, аудитория ${x.to_room}.`, `#/schedule/${x.to_date}`, who);
    notify(db, `user:${x.teacher_id}`, 'request', 'Заявка на перенос одобрена', `${x.subject}, ${x.group_name}: ${ddmm(x.from_date)} → ${ddmm(x.to_date)} ${x.to_start}.${comment ? ' ' + comment : ''}`, '#/teacher/reschedules', who);
  } else {
    notify(db, `user:${x.teacher_id}`, 'request', 'Заявка на перенос отклонена', `${x.subject}, ${x.group_name}, ${ddmm(x.from_date)}: ${comment}`, '#/teacher/reschedules', who);
  }
  db.prepare('UPDATE reschedules SET status = ?, staff_comment = ?, decided_at = ? WHERE id = ?').run(decision === 'approve' ? 'approved' : 'rejected', comment || null, nowIso(), x.id);
  return { ok: true };
}

// ---------- Преподаватель ----------
function teacherDay(db, tid, date) {
  const pairs = db.prepare('SELECT group_name, subject FROM teacher_subjects WHERE teacher_id = ?').all(tid);
  const out = [];
  for (const g of [...new Set(pairs.map((p) => p.group_name))]) {
    const subj = pairs.filter((p) => p.group_name === g).map((p) => p.subject);
    for (const l of S.daySchedule(db, g, date).lessons) if (subj.includes(l.subject)) out.push({ ...l, group: g, pending: Boolean(db.prepare("SELECT 1 FROM reschedules WHERE teacher_id = ? AND group_name = ? AND from_date = ? AND from_start = ? AND status = 'pending'").get(tid, g, date, l.start)) });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
const findTeacherLesson = (db, tid, group, date, start) => (A.parseDate(String(date)) && teacherDay(db, tid, String(date)).find((l) => l.group === String(group) && l.start === String(start))) || null;

function teacherAttendance(db, user, { group, date, start, absent }) {
  const l = findTeacherLesson(db, user.id, group, date, start);
  if (!l) return { status: 404, error: 'Пара не найдена' };
  if (date > A.isoDate(new Date())) return { status: 400, error: 'Посещаемость отмечается в день пары или позже' };
  if (!S.isActive(l)) return { status: 400, error: 'Пара отменена или перенесена' };
  const ids = new Set((Array.isArray(absent) ? absent : [absent]).filter((x) => x != null).map(Number));
  const students = db.prepare('SELECT user_id FROM students WHERE group_name = ?').all(l.group).map((s) => s.user_id);
  for (const sid of students) {
    db.prepare('DELETE FROM absences WHERE student_id = ? AND date = ? AND pair = ? AND subject = ? AND excused = 0').run(sid, date, l.pair, l.subject);
    if (ids.has(sid)) db.prepare('INSERT OR IGNORE INTO absences (student_id, date, pair, subject, excused) VALUES (?,?,?,?,0)').run(sid, date, l.pair, l.subject);
  }
  return { ok: true, absent: [...ids].filter((x) => students.includes(x)).length };
}
function teacherReschedule(db, user, { group, date, start, to_date, to_start, to_end, to_room, reason }) {
  const l = findTeacherLesson(db, user.id, group, date, start);
  if (!l || !S.isActive(l)) return { status: 404, error: 'Пара не найдена' };
  if (!A.parseDate(String(to_date)) || !TIME.test(String(to_start)) || !TIME.test(String(to_end)) || to_start >= to_end) return { status: 400, error: 'Укажите новую дату и время' };
  if (to_date < A.isoDate(new Date())) return { status: 400, error: 'Нельзя перенести пару в прошлое' };
  if (typeof reason !== 'string' || !reason.trim()) return { status: 400, error: 'Укажите причину переноса' };
  const clash = S.daySchedule(db, l.group, to_date).lessons.filter((x) => S.isActive(x) && !(to_date === date && x.start === start) && S.overlaps(to_start, to_end, x));
  if (clash.length) return { status: 409, error: `Новое время пересекается: ${clash.map(S.pairName).join(' и ')}.`, conflicts: clash.map(S.pairName) };
  if (l.pending) return { status: 409, error: 'По этой паре уже есть заявка на перенос' };
  db.prepare(`INSERT INTO reschedules (teacher_id, group_name, subject, kind, room, from_date, from_start, from_end, from_pair, to_date, to_start, to_end, to_room, reason, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?)`).run(user.id, l.group, l.subject, l.kind, l.room, date, l.start, l.end, l.pair, to_date, to_start, to_end, String(to_room || '').trim().slice(0, 40) || l.room, reason.trim().slice(0, 500), nowIso());
  notify(db, 'staff', 'schedule', `Заявка на перенос: ${l.subject}`, `${short(user)}, группа ${l.group}: ${ddmm(date)} ${l.start} → ${ddmm(to_date)} ${to_start}.`, '#/staff/schedule', short(user));
  return { ok: true };
}

module.exports = { studentMessage, studentCancel, staffSetStatus, staffMessage, decideReschedule, teacherDay, findTeacherLesson, teacherAttendance, teacherReschedule, short };
