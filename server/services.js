// Бизнес-логика: расписание с изменениями, расчет успеваемости, уведомления.
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
function daySchedule(db, group, dateStr, userId = null) {
  const date = A.parseDate(dateStr);
  if (!date) return null;
  const wd = A.weekday(date);
  const { parity, number } = A.weekInfo(date);
  const P = A.pairsFor(group);
  const base = db.prepare("SELECT * FROM lessons WHERE group_name = ? AND weekday = ? AND week IN ('all', ?) ORDER BY pair").all(group, wd, parity);
  const changes = db.prepare('SELECT * FROM schedule_changes WHERE group_name = ? AND (date = ? OR new_date = ?)').all(group, dateStr, dateStr);

  const lessons = base.map((l) => ({
    pair: l.pair, start: P[l.pair][0], end: P[l.pair][1],
    subject: l.subject, kind: l.kind, room: l.room, teacher: l.teacher, online: l.room === 'Онлайн', online_url: l.online_url, change: null,
  }));
  for (const c of changes) {
    if (c.type === 'extra' && c.date === dateStr) {
      lessons.push({ pair: c.pair, start: P[c.pair][0], end: P[c.pair][1], subject: c.subject, kind: c.kind || 'Занятие', room: c.new_room || '—', teacher: c.new_teacher || '—', online: false, change: { type: 'extra', note: c.note } });
      continue;
    }
    if (c.type === 'move' && c.new_date === dateStr && c.date !== dateStr) {
      lessons.push({ pair: c.new_pair, start: P[c.new_pair][0], end: P[c.new_pair][1], subject: c.subject, kind: c.kind || 'Занятие', room: c.new_room || '—', teacher: c.new_teacher || '—', online: false, change: { type: 'moved_in', note: c.note, from: c.date } });
      continue;
    }
    const l = lessons.find((x) => x.pair === c.pair && c.date === dateStr);
    if (!l) continue;
    if (c.type === 'cancel') l.change = { type: 'cancel', note: c.note };
    if (c.type === 'room') { l.change = { type: 'room', note: c.note, old_room: l.room }; l.room = c.new_room; l.online = false; }
    if (c.type === 'teacher') { l.change = { type: 'teacher', note: c.note, old_teacher: l.teacher }; l.teacher = c.new_teacher; }
    if (c.type === 'move') l.change = { type: 'move', note: c.note, new_date: c.new_date, new_pair: c.new_pair };
  }
  // Личные пересдачи студента (их назначают деканат и кафедра)
  if (userId) {
    for (const r of db.prepare('SELECT * FROM retakes WHERE student_id = ? AND date = ?').all(userId, dateStr)) {
      lessons.push({ pair: r.pair, start: P[r.pair][0], end: P[r.pair][1], subject: r.discipline, kind: 'Пересдача', room: r.room, teacher: r.examiner, online: false, change: { type: 'retake', note: `Попытка ${r.attempt}` } });
    }
  }
  lessons.sort((a, b) => a.pair - b.pair);
  return { date: dateStr, weekday: wd, week: number, parity, lessons };
}

function rangeSchedule(db, group, fromStr, days, userId = null) {
  const from = A.parseDate(fromStr);
  if (!from) return null;
  const out = [];
  for (let i = 0; i < days; i++) out.push(daySchedule(db, group, A.isoDate(A.addDays(from, i)), userId));
  return out;
}

// ---------- Успеваемость ----------
const CONTROL_LABEL = { exam: 'Экзамен', credit: 'Зачет', diff_credit: 'Дифф. зачет', coursework: 'Курсовая' };

// Рейтинг по дисциплине (0–100): взвешенное среднее
//   срезы 1–3 — вес 1, посещаемость (% посещенных пар) — вес 0,5, работа на парах — вес 0,3.
// Зачет: рейтинг от 70 — автомат, ниже — выход на зачет.
// Экзамен: допуск при рейтинге от 50; итог = 60% рейтинга + 40% результата экзамена.
const W = { srez: 1, attendance: 0.5, work: 0.3 };
const weighted = (parts) => { const w = parts.reduce((x, p) => x + p.w, 0); return w ? Math.round(parts.reduce((x, p) => x + p.v * p.w, 0) / w) : 0; };

function disciplineProgress(d, items, attendancePct) {
  const isExam = d.control === 'exam';
  const srez = items.filter((i) => /^Срез/.test(i.title));
  const work = items.find((i) => i.title === 'Работа на парах');
  const done = srez.filter((i) => i.score != null);
  const known = [...done.map((i) => ({ v: i.score, w: W.srez })), { v: attendancePct, w: W.attendance }, ...(work?.score != null ? [{ v: work.score, w: W.work }] : [])];
  const earned = weighted(known);
  // Прогноз: будущие срезы — на уровне уже написанных
  const avgSrez = done.length ? done.reduce((x, i) => x + i.score, 0) / done.length : (work?.score ?? 70);
  const projected = weighted([...srez.map((i) => ({ v: i.score ?? avgSrez, w: W.srez })), { v: attendancePct, w: W.attendance }, ...(work?.score != null ? [{ v: work.score, w: W.work }] : [])]);
  const threshold = isExam ? A.RULES.examAdmission : A.RULES.autoPass;
  const need = Math.max(0, threshold - projected);
  let status, label;
  if (isExam) {
    if (projected >= threshold) { status = projected - threshold < 8 ? 'watch' : 'ok'; label = done.length === srez.length ? 'Допуск к экзамену есть' : 'Допуск по прогнозу'; }
    else { status = 'risk'; label = `Для допуска нужно еще ${need} б.`; }
  } else if (projected >= threshold) {
    status = projected - threshold < 6 ? 'watch' : 'ok';
    label = d.control === 'diff_credit' ? `Автомат: «${A.markFor(projected).mark}», ${A.markFor(projected).ects}` : 'Зачет автоматом по прогнозу';
  } else { status = projected >= A.RULES.creditPass ? 'watch' : 'risk'; label = `Выход на зачет · до автомата ${need} б.`; }

  // Сколько нужно набрать на экзамене (из 100) для каждой оценки
  let examTargets = null;
  if (isExam) {
    examTargets = A.MARK_MIN.map(([mark, min]) => {
      const x = Math.max(0, Math.ceil((min - A.RULES.examRatingShare * projected) / (1 - A.RULES.examRatingShare)));
      return { mark, need: x, possible: x <= 100 };
    });
  }
  const parts = [
    ...srez.map((i) => ({ title: i.title, weight: W.srez, score: i.score, date: i.date })),
    { title: 'Посещаемость', weight: W.attendance, score: attendancePct, unit: '%' },
    ...(work ? [{ title: 'Работа на парах', weight: W.work, score: work.score }] : []),
  ];
  return {
    id: d.id, name: d.name, teacher: d.teacher, control: d.control, control_label: CONTROL_LABEL[d.control], credits: d.credits,
    exam_date: d.exam_date, exam_room: d.exam_room, consult_date: d.consult_date, group_avg: d.group_avg,
    sem_max: 100, earned, projected, threshold, need, status, label, exam_targets: examTargets, attendance: attendancePct, items: parts,
  };
}

// Посещаемость дисциплины: доля пар, на которых студент был (пропуски по справке не снижают)
function attendanceFor(db, userId, group, subject) {
  const start = A.academicYearStart(new Date());
  const today = A.isoDate(new Date());
  const lessons = db.prepare("SELECT weekday, pair FROM lessons WHERE group_name = ? AND subject = ? AND week = 'all'").all(group, subject);
  const cancels = new Set(db.prepare("SELECT date || '-' || pair k FROM schedule_changes WHERE group_name = ? AND subject = ? AND type = 'cancel'").all(group, subject).map((x) => x.k));
  let total = 0;
  for (let d = new Date(start); A.isoDate(d) < today; d = A.addDays(d, 1)) {
    const wd = A.weekday(d);
    for (const l of lessons) if (l.weekday === wd && !cancels.has(`${A.isoDate(d)}-${l.pair}`)) total++;
  }
  const missed = db.prepare('SELECT COUNT(*) n FROM absences WHERE student_id = ? AND subject = ? AND excused = 0').get(userId, subject).n;
  return total ? Math.max(0, Math.round((1 - missed / total) * 100)) : 100;
}

function gradesOverview(db, userId) {
  const st = getStudent(db, userId);
  const discs = db.prepare('SELECT * FROM disciplines WHERE group_name = ? AND semester = ? ORDER BY id').all(st.group, st.semester);
  const itemsStmt = db.prepare('SELECT * FROM grade_items WHERE student_id = ? AND discipline_id = ? ORDER BY date');
  const current = discs.map((d) => disciplineProgress(d, itemsStmt.all(userId, d.id), attendanceFor(db, userId, st.group, d.name)));

  const finals = db.prepare(`SELECT f.*, d.name, d.semester, d.control, d.credits FROM final_grades f JOIN disciplines d ON d.id = f.discipline_id
    WHERE f.student_id = ? ORDER BY d.semester, d.id`).all(userId);
  const semesters = {};
  for (const f of finals) (semesters[f.semester] ||= []).push({ name: f.name, control: f.control, control_label: CONTROL_LABEL[f.control], credits: f.credits, mark: f.mark, points: f.points, ects: A.ectsFor(f.points), date: f.date });
  const graded = finals.filter((f) => A.MARK_VALUE[f.mark]);
  const gpa = graded.length ? Math.round((graded.reduce((s, f) => s + A.MARK_VALUE[f.mark], 0) / graded.length) * 100) / 100 : null;
  const debts = finals.filter((f) => f.mark === 'неудовлетворительно' || f.mark === 'не зачтено').map((f) => ({ name: f.name, semester: f.semester, control_label: CONTROL_LABEL[f.control] }));
  const credits = finals.filter((f) => !['неудовлетворительно', 'не зачтено'].includes(f.mark)).reduce((s, f) => s + f.credits, 0);
  const excellentShare = graded.length ? Math.round(graded.filter((f) => f.mark === 'отлично').length / graded.length * 100) : null;

  // Прогноз стипендии на следующий семестр
  let stipend;
  const risks = current.filter((c) => c.status === 'risk');
  // Для обучающихся по договору блок о стипендии не показывается вовсе
  if (st.funding !== 'Бюджет') stipend = null;
  else if (debts.length) stipend = { level: 'bad', title: 'Пока нет оснований', text: 'Есть академическая задолженность. После ее закрытия основания для стипендии появятся.' };
  else if (risks.length) stipend = { level: 'warn', title: 'Основания зависят от сессии', text: `${risks.length} ${risks.length === 1 ? 'дисциплина требует' : 'дисциплины требуют'} внимания. При сдаче сессии на «хорошо» и «отлично» основания сохранятся.` };
  else if (current.every((c) => c.projected >= (c.control === 'exam' ? 51 : 85))) stipend = { level: 'great', title: 'Есть основания для повышенной', text: 'При сдаче сессии на «отлично» основания для повышенной стипендии сохранятся.' };
  else stipend = { level: 'good', title: 'Есть основания', text: 'При сдаче сессии без троек стипендия сохранится.' };

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
  // Напоминания о дедлайнах формируются на лету: ближайшие 48 часов, еще не отмеченные выполненными
  if (st) {
    const soon = deadlinesFor(db, userId, st.group).filter((d) => !d.done && new Date(d.due_at) > Date.now() && new Date(d.due_at) - Date.now() < 48 * 3600e3);
    for (const d of soon) list.unshift({ id: `dl-${d.id}`, category: 'deadline', title: `Дедлайн скоро: ${d.title}`, body: `${d.discipline}. Сдать до ${d.due_at.slice(11, 16)}, ${d.due_at.slice(0, 10).split('-').reverse().join('.')}.`, link: '#/today', important: true, pinned: false, author: 'Напоминание', created_at: new Date().toISOString(), read: false, virtual: true });
  }
  return list;
}

// ---------- Посещаемость ----------
// Пара — 80 минут, это 2 академических часа (по 45 минут). Лимит: 30 ч — выговор, 60 ч — отчисление.
const ABSENCE = { hoursPerPair: 2, warning: 30, expulsion: 60 };
function retakesFor(db, userId) {
  return db.prepare('SELECT discipline, date, pair, room, examiner, attempt FROM retakes WHERE student_id = ? AND date >= ? ORDER BY date, pair').all(userId, A.isoDate(new Date()))
    .map((r) => ({ ...r, start: A.PAIRS[r.pair][0], end: A.PAIRS[r.pair][1] }));
}
function absencesFor(db, userId) {
  const list = db.prepare('SELECT date, pair, subject, excused, note FROM absences WHERE student_id = ? ORDER BY date DESC, pair').all(userId)
    .map((a) => ({ ...a, excused: Boolean(a.excused), hours: ABSENCE.hoursPerPair, start: A.PAIRS[a.pair][0] }));
  const hours = list.filter((a) => !a.excused).length * ABSENCE.hoursPerPair;
  const excusedHours = list.filter((a) => a.excused).length * ABSENCE.hoursPerPair;
  const level = hours >= ABSENCE.expulsion ? 'expulsion' : hours >= ABSENCE.warning ? 'warning' : hours >= ABSENCE.warning - 8 ? 'near' : 'ok';
  return { hours, excused_hours: excusedHours, pairs: hours / ABSENCE.hoursPerPair, limits: ABSENCE, level,
    left_to_warning: Math.max(0, ABSENCE.warning - hours), list };
}
// Проходы СКУД, сгруппированные по дням: первый вход, последний выход, время внутри
function campusFor(db, userId, days = 14) {
  const from = A.isoDate(A.addDays(new Date(), -(days - 1)));
  const rows = db.prepare('SELECT at, direction, gate FROM campus_passes WHERE user_id = ? AND at >= ? ORDER BY at').all(userId, from);
  const byDay = {};
  for (const r of rows) (byDay[r.at.slice(0, 10)] ||= []).push(r);
  const out = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const date = A.isoDate(A.addDays(new Date(), -i));
    const ev = byDay[date] || [];
    let minutes = 0, open = null;
    const intervals = [];
    for (const e of ev) {
      const t = new Date(e.at);
      if (e.direction === 'in') open = t;
      else if (open) { minutes += (t - open) / 60000; intervals.push([open.toTimeString().slice(0, 5), e.at.slice(11, 16)]); open = null; }
    }
    const inside = Boolean(open) && i === 0;
    if (open && i === 0) { minutes += (now - open) / 60000; intervals.push([open.toTimeString().slice(0, 5), null]); }
    out.push({ date, first_in: ev.find((e) => e.direction === 'in')?.at.slice(11, 16) || null, last_out: [...ev].reverse().find((e) => e.direction === 'out')?.at.slice(11, 16) || null,
      minutes: Math.round(minutes), inside, intervals, events: ev.map((e) => ({ time: e.at.slice(11, 16), direction: e.direction, gate: e.gate })) });
  }
  const week = out.slice(0, 7);
  return { days: out, week_minutes: week.reduce((s2, d) => s2 + d.minutes, 0), week_days: week.filter((d) => d.minutes > 0).length, inside: out[0]?.inside || false };
}

module.exports = { ABSENCE, retakesFor, absencesFor, campusFor, getStudent, daySchedule, rangeSchedule, gradesOverview, deadlinesFor, notificationsFor, audiencesFor, CONTROL_LABEL };
