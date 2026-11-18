// Бизнес-логика: расписание с изменениями, расчёт успеваемости, уведомления.
// Каждая функция получает id пользователя из сессии — никогда из адреса или тела запроса.
const A = require('./academic');
const { decrypt } = require('./security');

function getStudent(db, userId) {
  const s = db.prepare('SELECT u.id, u.login, u.last_name, u.first_name, u.middle_name, st.* FROM users u JOIN students st ON st.user_id = u.id WHERE u.id = ?').get(userId);
  if (!s) return null;
  return {
    id: s.id, login: s.login, last_name: s.last_name, first_name: s.first_name, middle_name: s.middle_name,
    faculty: s.faculty, program_code: s.program_code, program: s.program, profile: s.profile,
    course: s.course, group: s.group_name, study_form: s.study_form, funding: s.funding,
    enrolled_year: s.enrolled_year, stipend: s.stipend, curator: s.curator,
    record_book: decrypt(s.record_book_enc), email: decrypt(s.email_enc), phone: decrypt(s.phone_enc), birth_date: decrypt(s.birth_date_enc),
    semester: A.semesterFor(s.course),
  };
}

// ---------- Расписание ----------
function daySchedule(db, group, dateStr) {
  const date = A.parseDate(dateStr);
  if (!date) return null;
  const wd = A.weekday(date);
  const { parity, number } = A.weekInfo(date);
  const base = db.prepare("SELECT * FROM lessons WHERE group_name = ? AND weekday = ? AND week IN ('all', ?) ORDER BY pair").all(group, wd, parity);
  const changes = db.prepare('SELECT * FROM schedule_changes WHERE group_name = ? AND (date = ? OR new_date = ?)').all(group, dateStr, dateStr);

  const lessons = base.map((l) => ({
    pair: l.pair, start: A.PAIRS[l.pair][0], end: A.PAIRS[l.pair][1],
    subject: l.subject, kind: l.kind, room: l.room, teacher: l.teacher, online: l.room === 'Онлайн', online_url: l.online_url, change: null,
  }));
  for (const c of changes) {
    if (c.type === 'extra' && c.date === dateStr) {
      lessons.push({ pair: c.pair, start: A.PAIRS[c.pair][0], end: A.PAIRS[c.pair][1], subject: c.subject, kind: c.kind || 'Занятие', room: c.new_room || '—', teacher: c.new_teacher || '—', online: false, change: { type: 'extra', note: c.note } });
      continue;
    }
    if (c.type === 'move' && c.new_date === dateStr && c.date !== dateStr) {
      lessons.push({ pair: c.new_pair, start: A.PAIRS[c.new_pair][0], end: A.PAIRS[c.new_pair][1], subject: c.subject, kind: c.kind || 'Занятие', room: c.new_room || '—', teacher: c.new_teacher || '—', online: false, change: { type: 'moved_in', note: c.note, from: c.date } });
      continue;
    }
    const l = lessons.find((x) => x.pair === c.pair && c.date === dateStr);
    if (!l) continue;
    if (c.type === 'cancel') l.change = { type: 'cancel', note: c.note };
    if (c.type === 'room') { l.change = { type: 'room', note: c.note, old_room: l.room }; l.room = c.new_room; l.online = false; }
    if (c.type === 'teacher') { l.change = { type: 'teacher', note: c.note, old_teacher: l.teacher }; l.teacher = c.new_teacher; }
    if (c.type === 'move') l.change = { type: 'move', note: c.note, new_date: c.new_date, new_pair: c.new_pair };
  }
  lessons.sort((a, b) => a.pair - b.pair);
  return { date: dateStr, weekday: wd, week: number, parity, lessons };
}

function rangeSchedule(db, group, fromStr, days) {
  const from = A.parseDate(fromStr);
  if (!from) return null;
  const out = [];
  for (let i = 0; i < days; i++) out.push(daySchedule(db, group, A.isoDate(A.addDays(from, i))));
  return out;
}

// ---------- Успеваемость ----------
const CONTROL_LABEL = { exam: 'Экзамен', credit: 'Зачёт', diff_credit: 'Дифф. зачёт', coursework: 'Курсовая' };

function disciplineProgress(d, items) {
  const isExam = d.control === 'exam';
  const semMax = items.reduce((s, i) => s + i.max_score, 0);
  const earned = items.filter((i) => i.score != null).reduce((s, i) => s + i.score, 0);
  const maxSoFar = items.filter((i) => i.score != null).reduce((s, i) => s + i.max_score, 0);
  const remaining = semMax - maxSoFar;
  const pace = maxSoFar ? earned / maxSoFar : 0.75;
  const projected = Math.round(earned + pace * remaining);
  const threshold = isExam ? A.RULES.examAdmission : A.RULES.creditPass;
  const need = Math.max(0, threshold - earned);
  let status, label;
  if (d.control === 'diff_credit' && projected >= threshold) { status = projected - threshold < 8 ? 'watch' : 'ok'; label = `Прогноз: «${A.markFor(projected).mark}» (≈${projected} б.)`; }
  else if (earned >= threshold) { status = 'ok'; label = isExam ? 'Допуск к экзамену есть' : 'Зачёт автоматом'; }
  else if (need > remaining) { status = 'risk'; label = 'Баллов уже не хватит — нужна отработка'; }
  else if (projected < threshold) { status = 'risk'; label = `Не хватает ${need} б. — темп ниже нужного`; }
  else if (projected - threshold < 8) { status = 'watch'; label = `Ещё ${need} б. до ${isExam ? 'допуска' : 'зачёта'}`; }
  else { status = 'ok'; label = `Ещё ${need} б. до ${isExam ? 'допуска' : 'зачёта'} — вы в графике`; }

  // Что нужно на экзамене для каждой оценки (при максимуме в семестре)
  let examTargets = null;
  if (isExam) {
    const semFinal = Math.min(A.RULES.examSemesterMax, projected);
    examTargets = A.SCALE.slice(0, 3).map((s) => ({ mark: s.mark, need: Math.max(0, s.min - semFinal), possible: s.min - semFinal <= 40 }));
  }
  return {
    id: d.id, name: d.name, teacher: d.teacher, control: d.control, control_label: CONTROL_LABEL[d.control], credits: d.credits,
    exam_date: d.exam_date, exam_room: d.exam_room, consult_date: d.consult_date, group_avg: d.group_avg,
    sem_max: semMax, earned, max_so_far: maxSoFar, projected, threshold, need, status, label, exam_targets: examTargets,
    items: items.map((i) => ({ title: i.title, score: i.score, max: i.max_score, date: i.date })),
  };
}

function gradesOverview(db, userId) {
  const st = getStudent(db, userId);
  const discs = db.prepare('SELECT * FROM disciplines WHERE group_name = ? AND semester = ? ORDER BY id').all(st.group, st.semester);
  const itemsStmt = db.prepare('SELECT * FROM grade_items WHERE student_id = ? AND discipline_id = ? ORDER BY date');
  const current = discs.map((d) => disciplineProgress(d, itemsStmt.all(userId, d.id)));

  const finals = db.prepare(`SELECT f.*, d.name, d.semester, d.control, d.credits FROM final_grades f JOIN disciplines d ON d.id = f.discipline_id
    WHERE f.student_id = ? ORDER BY d.semester, d.id`).all(userId);
  const semesters = {};
  for (const f of finals) (semesters[f.semester] ||= []).push({ name: f.name, control: f.control, control_label: CONTROL_LABEL[f.control], credits: f.credits, mark: f.mark, points: f.points, date: f.date });
  const graded = finals.filter((f) => A.MARK_VALUE[f.mark]);
  const gpa = graded.length ? Math.round((graded.reduce((s, f) => s + A.MARK_VALUE[f.mark], 0) / graded.length) * 100) / 100 : null;
  const debts = finals.filter((f) => f.mark === 'неудовлетворительно' || f.mark === 'не зачтено').map((f) => ({ name: f.name, semester: f.semester, control_label: CONTROL_LABEL[f.control] }));
  const credits = finals.filter((f) => !['неудовлетворительно', 'не зачтено'].includes(f.mark)).reduce((s, f) => s + f.credits, 0);
  const excellentShare = graded.length ? Math.round(graded.filter((f) => f.mark === 'отлично').length / graded.length * 100) : null;

  // Прогноз стипендии на следующий семестр
  let stipend;
  const risks = current.filter((c) => c.status === 'risk');
  if (st.funding !== 'Бюджет') stipend = { level: 'none', title: 'Не предусмотрена', text: 'Вы учитесь по договору — академическая стипендия не назначается. Можно претендовать на именные стипендии и материальную помощь.' };
  else if (debts.length) stipend = { level: 'bad', title: 'Под угрозой', text: 'Есть академическая задолженность — закройте её до конца сессии, чтобы сохранить стипендию.' };
  else if (risks.length) stipend = { level: 'warn', title: 'Есть риск', text: `${risks.length} ${risks.length === 1 ? 'дисциплина' : 'дисциплины'} в зоне риска. Сдав всё на «хорошо» и «отлично», вы сохраните стипендию.` };
  else if (current.every((c) => c.projected >= (c.control === 'exam' ? 51 : 85))) stipend = { level: 'great', title: 'Повышенная — реально', text: 'Если сдадите сессию на «отлично», сохраните повышенную стипендию.' };
  else stipend = { level: 'good', title: 'Сохраняется', text: 'При сдаче сессии без троек стипендия сохранится.' };

  return {
    semester: st.semester, current, semesters, debts,
    summary: { gpa, credits, debts: debts.length, risks: risks.length, excellent_share: excellentShare, stipend },
    session: { ...A.sessionInfo(), exams: current.filter((c) => c.exam_date).map((c) => ({ name: c.name, control_label: c.control_label, date: c.exam_date, room: c.exam_room, consult: c.consult_date, teacher: c.teacher, admitted: c.status === 'ok' || c.earned >= c.threshold })).sort((a, b) => a.date.localeCompare(b.date)) },
  };
}

// ---------- Дедлайны ----------
function deadlinesFor(db, userId, group) {
  return db.prepare(`SELECT dl.*, CASE WHEN dd.deadline_id IS NULL THEN 0 ELSE 1 END AS done FROM deadlines dl
    LEFT JOIN deadline_done dd ON dd.deadline_id = dl.id AND dd.user_id = ? WHERE dl.group_name = ? ORDER BY dl.due_at`).all(userId, group)
    .map((x) => ({ id: x.id, discipline: x.discipline, title: x.title, due_at: x.due_at, kind: x.kind, done: Boolean(x.done) }));
}

// ---------- Уведомления ----------
function audiencesFor(st, userId) {
  return ['all', `user:${userId}`, ...(st ? [`group:${st.group}`, `faculty:${st.faculty}`] : ['staff'])];
}
function notificationsFor(db, userId, st) {
  const aud = audiencesFor(st, userId);
  const rows = db.prepare(`SELECT n.*, CASE WHEN r.notification_id IS NULL THEN 0 ELSE 1 END AS read FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.audience IN (${aud.map(() => '?').join(',')}) ORDER BY n.pinned DESC, n.created_at DESC LIMIT 100`).all(userId, ...aud);
  const list = rows.map((n) => ({ id: n.id, category: n.category, title: n.title, body: n.body, link: n.link, important: Boolean(n.important), pinned: Boolean(n.pinned), author: n.author, created_at: n.created_at, read: Boolean(n.read) }));
  // Напоминания о дедлайнах формируются на лету: ближайшие 48 часов, ещё не отмеченные выполненными
  if (st) {
    const soon = deadlinesFor(db, userId, st.group).filter((d) => !d.done && new Date(d.due_at) > Date.now() && new Date(d.due_at) - Date.now() < 48 * 3600e3);
    for (const d of soon) list.unshift({ id: `dl-${d.id}`, category: 'deadline', title: `Дедлайн скоро: ${d.title}`, body: `${d.discipline}. Сдать до ${d.due_at.slice(11, 16)}, ${d.due_at.slice(0, 10).split('-').reverse().join('.')}.`, link: '#/today', important: true, pinned: false, author: 'Напоминание', created_at: new Date().toISOString(), read: false, virtual: true });
  }
  return list;
}

module.exports = { getStudent, daySchedule, rangeSchedule, gradesOverview, deadlinesFor, notificationsFor, audiencesFor, CONTROL_LABEL };
