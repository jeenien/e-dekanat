// Наполнение базы ВЫМЫШЛЕННЫМИ данными. Все ФИО, оценки и номера придуманы.
// Даты считаются от сегодняшнего дня, поэтому демо всегда выглядит «живым».
const { tx } = require('./db');
const { hashPassword, encrypt, publicId } = require('./security');
const A = require('./academic');

const DEMO_ACCOUNTS = [
  { login: 'anna', password: 'Orbita-Anna-2026', role: 'student' },
  { login: 'timur', password: 'Orbita-Timur-2026', role: 'student' },
  { login: 'nika', password: 'Orbita-Nika-2026', role: 'student' },
  { login: 'dekanat', password: 'Orbita-Staff-2026', role: 'staff' },
  { login: 'teacher', password: 'Orbita-Teacher-2026', role: 'teacher' },
];

// Расписание групп — по открытому расписанию вуза (ФИО преподавателей исключены)
const SCHEDULE = require('./schedule-data');
// Дисциплины группы в порядке первого появления в расписании
const subjectsOf = (g) => [...new Set(SCHEDULE[g].map((r) => r[2]))];
const MAIN_ROOM = (g, name) => SCHEDULE[g].find((r) => r[2] === name && r[4] !== 'Спортзал')?.[4] || SCHEDULE[g].find((r) => r[2] === name)?.[4] || '—';

// Форма контроля в текущем семестре (по умолчанию — зачет)
const CONTROL = {
  'Сравнительная политология': 'exam', 'Китайский язык': 'exam', 'Мировая экономика': 'exam', 'Английский язык': 'exam',
  'Международные конфликты': 'diff_credit', 'Японский язык': 'exam', 'Теория права и правовые системы современности': 'exam',
  'История Востока': 'exam', 'История международных отношений и внешней политики России': 'diff_credit',
  'История страны / региона специализации': 'diff_credit', 'Немецкий язык': 'diff_credit', 'Теория и практика рекламы': 'exam',
  'Основы теории коммуникации': 'exam', 'Современная пресс-служба': 'diff_credit',
  'Профессионально-ознакомительная практика (Основы спичрайтинга)': 'diff_credit',
};

// Курсы прошлых семестров: [название, вид контроля, з.е.]
const PAST = {
  '2УП-05': {
    1: [['Введение в политологию', 'exam', 5], ['История России', 'exam', 4], ['Китайский язык', 'exam', 6], ['Английский язык', 'diff_credit', 4], ['Основы российской государственности', 'credit', 2], ['Физическая культура', 'credit', 1]],
    2: [['История политических учений', 'exam', 5], ['Политическая социология', 'exam', 4], ['Китайский язык', 'exam', 6], ['Английский язык', 'diff_credit', 4], ['Философия', 'credit', 3], ['Физическая культура', 'credit', 1]],
  },
  '2МЖ-05': {
    1: [['Введение в теорию массовых коммуникаций', 'exam', 5], ['История России', 'exam', 4], ['Английский язык', 'diff_credit', 4], ['Немецкий язык', 'credit', 4], ['Русский язык и культура речи', 'credit', 2]],
    2: [['История отечественной журналистики', 'exam', 5], ['Основы маркетинга', 'exam', 4], ['Английский язык', 'diff_credit', 4], ['Немецкий язык', 'credit', 4], ['Философия', 'credit', 3]],
  },
  '1МО-01': {},
};

// Профиль успеваемости: базовый уровень (0…1) и отдельные дисциплины
const STUDENTS = [
  {
    login: 'anna', last: 'Ветрова', first: 'Анна', middle: 'Сергеевна',
    faculty: 'Факультет управления и политики', code: '41.03.04', program: 'Политология', profile: 'Сравнительная политология и мировые политические процессы',
    course: 2, group: '2УП-05', form: 'Очная', funding: 'Бюджет', year: 2025, stipend: 'Академическая повышенная',
    curator: 'Мирская Елена Викторовна', book: '25-УП-0417', email: 'a.vetrova@student.gorizont.example', phone: '+7 900 000-14-17', birth: '2007-03-14',
    base: 0.92, special: {}, past: [['отлично', 'отлично', 'хорошо', 'хорошо', 'зачтено', 'зачтено'], ['отлично', 'отлично', 'отлично', 'хорошо', 'зачтено', 'зачтено']],
  },
  {
    login: 'timur', last: 'Северцев', first: 'Тимур', middle: 'Андреевич',
    faculty: 'Факультет международной журналистики', code: '42.03.01', program: 'Реклама и связи с общественностью', profile: 'Международные связи с общественностью',
    course: 2, group: '2МЖ-05', form: 'Очная', funding: 'Договор', year: 2025, stipend: 'Не назначена',
    curator: 'Лаптева Ольга Геннадьевна', book: '25-МЖ-1183', email: 't.severtsev@student.gorizont.example', phone: '+7 900 000-11-83', birth: '2006-09-02',
    base: 0.7, special: { 'Теория и практика рекламы': 0.45, 'Основы теории коммуникации': 0.5 },
    past: [['хорошо', 'удовлетворительно', 'хорошо', 'зачтено', 'зачтено'], ['удовлетворительно', 'неудовлетворительно', 'хорошо', 'зачтено', 'зачтено']],
    debt: 'Основы маркетинга',
  },
  {
    login: 'nika', last: 'Полярная', first: 'Ника', middle: 'Олеговна',
    faculty: 'Факультет международных отношений', code: '41.03.01', program: 'Зарубежное регионоведение', profile: 'Страны Восточной Азии',
    course: 1, group: '1МО-01', form: 'Очная', funding: 'Бюджет', year: 2026, stipend: 'Академическая',
    curator: 'Северина Марина Игоревна', book: '26-МО-0032', email: 'n.polyarnaya@student.gorizont.example', phone: '+7 900 000-00-32', birth: '2008-07-21',
    base: 0.82, special: { 'Японский язык': 0.9 }, past: [],
  },
];

// Детерминированный генератор, чтобы данные не «прыгали» при пересоздании базы
// Дата сдачи для прошедшего семестра k: нечетные (осенние) закрываются в январе, четные — в июне
function pastSemesterDate(startYear, currentSem, k, i) {
  // Идем назад от последнего закрытого семестра: июнь/январь попеременно
  let year = currentSem % 2 === 1 ? startYear : startYear + 1;
  let month = currentSem % 2 === 1 ? 5 : 0;
  for (let s = currentSem - 1; s > k; s--) {
    if (month === 5) month = 0; else { month = 5; year -= 1; }
  }
  return A.isoDate(new Date(year, month, 12 + i * 3));
}

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function seed(db) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = (n) => A.isoDate(A.addDays(today, n));
  const dt = (n, time = '10:00') => `${d(n)}T${time}:00`;
  const nowIso = () => new Date().toISOString();
  const rand = rng(42);
  const sess = A.sessionInfo(today);
  const semStart = A.academicYearStart(today);

  tx(db, () => {
    const insUser = db.prepare('INSERT INTO users (login, password_hash, role, last_name, first_name, middle_name, position) VALUES (?,?,?,?,?,?,?)');
    const pwd = Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.login, a.password]));

    // Сотрудник деканата
    insUser.run('dekanat', hashPassword(pwd.dekanat), 'staff', 'Ладогина', 'Ольга', 'Викторовна', 'Специалист по учебной работе');
    // Преподаватель (вымышленный): ведет «Мировую экономику» в трех группах
    const teacherId = insUser.run('teacher', hashPassword(pwd.teacher), 'teacher', 'Кравцова', 'Елена', 'Михайловна', 'Доцент кафедры мировой экономики').lastInsertRowid;
    const TEACHES = [['2УП-05', 'Мировая экономика'], ['2МЖ-05', 'Мировая экономика'], ['1МО-01', 'Мировая экономика']];
    const insTS = db.prepare('INSERT INTO teacher_subjects (teacher_id, group_name, subject) VALUES (?,?,?)');
    for (const [g, subj] of TEACHES) insTS.run(teacherId, g, subj);

    // Расписание групп (одна пара в слот, неделя одинаковая)
    const insLesson = db.prepare('INSERT INTO lessons (group_name, weekday, pair, week, subject, kind, room, teacher, online_url) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const [g, rows] of Object.entries(SCHEDULE)) {
      const seen = new Set();
      for (const [wd, pair, subject, kind, room] of rows) {
        if (seen.has(`${wd}-${pair}`)) continue;
        seen.add(`${wd}-${pair}`);
        const teacher = TEACHES.some(([tg, ts]) => tg === g && ts === subject) ? 'Кравцова Е. М.' : '';
        insLesson.run(g, wd, pair, 'all', subject, kind, room, teacher, null);
      }
    }

    // Изменения в расписании на ближайшие дни — чтобы было видно, как они подсвечиваются
    const findLesson = (g, offsetFrom) => {
      for (let i = offsetFrom; i < offsetFrom + 7; i++) {
        const day = A.addDays(today, i);
        const wk = A.weekInfo(day).parity;
        const l = db.prepare("SELECT * FROM lessons WHERE group_name=? AND weekday=? AND week IN ('all',?) ORDER BY pair").all(g, A.weekday(day), wk);
        if (l.length >= 2) return { date: A.isoDate(day), lessons: l, offset: i };
      }
      return null;
    };
    const insChange = db.prepare('INSERT INTO schedule_changes (group_name, date, pair, type, subject, kind, new_room, new_teacher, new_date, new_pair, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insNotif = db.prepare('INSERT INTO notifications (audience, category, title, body, link, important, pinned, author, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const g of Object.keys(SCHEDULE)) {
      const a = findLesson(g, 0);
      if (a) {
        const l = [...a.lessons].reverse().find((x) => x.room !== 'Спортзал') || a.lessons[0];
        insChange.run(g, a.date, l.pair, 'room', l.subject, l.kind, '4138 (Корпус МО)', null, null, null, 'Аудитория на ремонте');
        insNotif.run(`group:${g}`, 'schedule', `Смена аудитории: ${l.subject}`, `${a.offset === 0 ? 'Сегодня' : 'В ближайший учебный день'} занятие (${l.pair} пара) пройдет в аудитории 4138 (Корпус МО) вместо ${l.room}.`, '#/schedule', 1, 0, 'Деканат', new Date(Date.now() - 3 * 3600e3).toISOString());
      }
      const b = findLesson(g, (a ? a.offset : 0) + 1);
      if (b) {
        const l = b.lessons[0];
        insChange.run(g, b.date, l.pair, 'cancel', l.subject, l.kind, null, null, null, null, 'Преподаватель на конференции');
        insNotif.run(`group:${g}`, 'schedule', `Отмена пары: ${l.subject}`, `${l.pair} пара (${l.kind.toLowerCase()}) ${b.date.split('-').reverse().join('.')} отменена — преподаватель на конференции. Отработка будет объявлена дополнительно.`, '#/schedule', 1, 0, 'Деканат', new Date(Date.now() - 20 * 3600e3).toISOString());
      }
      const c = findLesson(g, (b ? b.offset : 2) + 2);
      if (c) {
        const subj = subjectsOf(g).find((x) => CONTROL[x] === 'exam') || subjectsOf(g)[0];
        insChange.run(g, c.date, 7, 'extra', subj, 'Консультация', '3162 (Корпус МО)', '', null, null, 'Дополнительная консультация перед контрольной');
      }
    }

    // Студенты
    const insStudent = db.prepare(`INSERT INTO students (user_id, faculty, program_code, program, profile, course, group_name, study_form, funding, enrolled_year, stipend, curator, record_book_enc, email_enc, phone_enc, birth_date_enc)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insDisc = db.prepare('INSERT INTO disciplines (group_name, semester, name, control, credits, hours, teacher, exam_date, exam_room, consult_date, group_avg) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insItem = db.prepare('INSERT INTO grade_items (student_id, discipline_id, title, score, max_score, date) VALUES (?,?,?,?,?,?)');
    const insFinal = db.prepare('INSERT INTO final_grades (student_id, discipline_id, mark, points, date, attempt) VALUES (?,?,?,?,?,?)');
    const sessStart = A.parseDate(sess.start);

    for (const s of STUDENTS) {
      const uid = insUser.run(s.login, hashPassword(pwd[s.login]), 'student', s.last, s.first, s.middle, null).lastInsertRowid;
      insStudent.run(uid, s.faculty, s.code, s.program, s.profile, s.course, s.group, s.form, s.funding, s.year, s.stipend, s.curator,
        encrypt(s.book), encrypt(s.email), encrypt(s.phone), encrypt(s.birth));

      // Прошлые семестры
      const pastSems = PAST[s.group];
      Object.entries(pastSems).forEach(([sem, list], si) => {
        list.forEach(([name, control, credits], i) => {
          const semDate = pastSemesterDate(semStart.getFullYear(), A.semesterFor(s.course, today), Number(sem), i);
          const did = insDisc.run(s.group, Number(sem), name, control, credits, credits * 36, '', semDate, null, null, null).lastInsertRowid;
          const mark = (s.past[si] || [])[i] || 'зачтено';
          const points = mark === 'отлично' ? 90 + Math.floor(rand() * 11) : mark === 'хорошо' ? 75 + Math.floor(rand() * 15) : mark === 'удовлетворительно' ? 60 + Math.floor(rand() * 15) : mark === 'зачтено' ? 62 + Math.floor(rand() * 36) : 35 + Math.floor(rand() * 20);
          insFinal.run(uid, did, mark, points, semDate, 1);
        });
      });

      // Текущий семестр
      const sem = A.semesterFor(s.course, today);
      subjectsOf(s.group).forEach((name, i) => {
        const control = CONTROL[name] || 'credit';
        const isExam = control === 'exam';
        const examDay = isExam ? A.addDays(sessStart, 1 + i * 3) : A.addDays(A.parseDate(sess.credits_week[0]), i % 6);
        const consult = isExam ? A.addDays(examDay, -1) : null;
        const did = insDisc.run(s.group, sem, name, control, isExam ? 5 : 3, isExam ? 180 : 108, '',
          `${A.isoDate(examDay)}T${isExam ? '09:00' : '14:30'}`, MAIN_ROOM(s.group, name),
          consult ? `${A.isoDate(consult)}T16:00` : null, Math.round(64 + rand() * 16)).lastInsertRowid;
        // Контрольные точки: часть прошла, часть впереди
        // Срез 1 уже написан, срезы 2 и 3 впереди; работа на парах оценивается по ходу семестра
        const items = [['Срез 1', -14], ['Срез 2', 12], ['Срез 3', 30], ['Работа на парах', -1]];
        const sk = s.special[name] ?? Math.min(1, s.base + (rand() - 0.5) * 0.12);
        items.forEach(([title, off]) => {
          const passed = off < 0;
          const score = passed ? Math.max(0, Math.min(100, Math.round(100 * (sk - 0.08 + rand() * 0.14)))) : null;
          insItem.run(uid, did, title, score, 100, d(off));
        });
      });
    }

    const uid = (login) => db.prepare('SELECT id FROM users WHERE login = ?').get(login).id;
    const lessonsOn = (g, day) => db.prepare("SELECT * FROM lessons WHERE group_name=? AND weekday=? AND week IN ('all',?) ORDER BY pair").all(g, A.weekday(day), A.weekInfo(day).parity);
    const cancelled = (g, date, pair) => Boolean(db.prepare("SELECT 1 FROM schedule_changes WHERE group_name=? AND date=? AND pair=? AND type='cancel'").get(g, date, pair));

    // Пересдачу назначают деканат и кафедра: у Тимура долг по прошлому семестру
    let rd = A.addDays(today, 2);
    while (A.weekday(rd) > 5 || lessonsOn('2МЖ-05', rd).some((l) => l.pair === 5)) rd = A.addDays(rd, 1);
    db.prepare('INSERT INTO retakes (student_id, discipline, date, pair, room, examiner, attempt, set_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(uid('timur'), 'Основы маркетинга', A.isoDate(rd), 5, '4138 (Корпус МО)', 'Комиссия кафедры', 1, 'Ладогина О. В.');

    // Пропуски: по 2 академических часа за пару. Уважительные (по справке) не учитываются в лимите.
    const insAbs = db.prepare('INSERT OR IGNORE INTO absences (student_id, date, pair, subject, excused, note) VALUES (?,?,?,?,?,?)');
    const plan = { anna: { group: '2УП-05', unexcused: 3, excused: 2 }, timur: { group: '2МЖ-05', unexcused: 12, excused: 2 }, nika: { group: '1МО-01', unexcused: 0, excused: 0 } };
    const absentDays = {};
    for (const [login, cfg] of Object.entries(plan)) {
      const id = uid(login);
      const slots = [];
      for (let day = new Date(semStart); day < today; day = A.addDays(day, 1)) {
        if (A.weekday(day) > 6) continue;
        for (const l of lessonsOn(cfg.group, day)) slots.push({ date: A.isoDate(day), pair: l.pair, subject: l.subject });
      }
      const pick = (n, excused) => {
        for (let k = 0; k < n && slots.length; k++) {
          const sl = slots.splice(Math.floor(rand() * slots.length), 1)[0];
          insAbs.run(id, sl.date, sl.pair, sl.subject, excused ? 1 : 0, excused ? 'По справке из поликлиники' : null);
          (absentDays[login] ||= {})[sl.date] = ((absentDays[login] || {})[sl.date] || 0) + 1;
        }
      };
      pick(cfg.unexcused, false);
      // уважительные пропуски — подряд, как при болезни
      if (cfg.excused) {
        const start = slots[Math.floor(rand() * slots.length)];
        const sameDay = slots.filter((x) => x.date === start.date).slice(0, cfg.excused);
        for (const sl of sameDay) { insAbs.run(id, sl.date, sl.pair, sl.subject, 1, 'По справке из поликлиники'); (absentDays[login] ||= {})[sl.date] = 99; }
      }
    }

    // Проходы через турникеты (СКУД) за последние 3 недели
    const insPass = db.prepare('INSERT INTO campus_passes (user_id, at, direction, gate) VALUES (?,?,?,?)');
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    for (const [login, cfg] of Object.entries(plan)) {
      const id = uid(login);
      for (let i = 21; i >= 0; i--) {
        const day = A.addDays(today, -i);
        const date = A.isoDate(day);
        const ls = lessonsOn(cfg.group, day).filter((l) => !cancelled(cfg.group, date, l.pair));
        if (!ls.length || (absentDays[login] || {})[date] >= ls.length) continue;
        const lateness = login === 'timur' ? Math.floor(rand() * 30) - 8 : -(5 + Math.floor(rand() * 20));
        const inM = toMin(A.PAIRS[ls[0].pair][0]) + lateness;
        const outM = toMin(A.PAIRS[ls[ls.length - 1].pair][1]) + 3 + Math.floor(rand() * (login === 'anna' ? 70 : 25));
        const gateIn = /Новый корпус/.test(ls[0].room) ? 'Новый корпус, вход' : /МЭО/.test(ls[0].room) ? 'Корпус МЭО, турникет 1' : ls[0].room === 'Спортзал' ? 'Спорткомплекс' : 'Корпус МО, турникет 2';
        if (i === 0 && inM > nowMin) continue;
        insPass.run(id, `${date}T${hm(inM)}:00`, 'in', gateIn);
        // иногда выходит на обед
        if (ls.length >= 3 && rand() < 0.35 && (i > 0 || nowMin > 14 * 60 + 25)) {
          insPass.run(id, `${date}T${hm(13 * 60 + 32 + Math.floor(rand() * 10))}:00`, 'out', gateIn);
          insPass.run(id, `${date}T${hm(14 * 60 + 5 + Math.floor(rand() * 15))}:00`, 'in', gateIn);
        }
        if (i === 0 && outM > nowMin) continue; // сегодня еще в университете
        insPass.run(id, `${date}T${hm(outM)}:00`, 'out', gateIn);
      }
    }

    // Дедлайны групп
    const dls = {
      '2УП-05': [['Сравнительная политология', 'Эссе: модели демократического транзита', 1, 'essay'], ['Китайский язык', 'Иероглифический диктант, урок 9', 3, 'test'], ['Мировая экономика', 'Кейс: торговые войны', 6, 'project'], ['Международные конфликты', 'Аналитическая записка по конфликту', 9, 'essay'], ['Английский язык', 'Презентация «Global Governance»', 12, 'project']],
      '2МЖ-05': [['Теория и практика рекламы', 'Медиаплан рекламной кампании', 0, 'project'], ['Основы теории коммуникации', 'Реферат: модели коммуникации', 4, 'essay'], ['Немецкий язык', 'Контрольная: Perfekt', 8, 'test'], ['Современная пресс-служба', 'Пресс-релиз к мероприятию', 11, 'project']],
      '1МО-01': [['Японский язык', 'Кандзи: урок 6', 2, 'homework'], ['История Востока', 'Доклад о реформах Мэйдзи', 7, 'essay'], ['Теория права и правовые системы современности', 'Тест по источникам права', 10, 'test']],
    };
    // Задание привязано к ближайшей паре по дисциплине (если пара есть до срока), дедлайн — к заданию
    const insDl2 = db.prepare('INSERT INTO deadlines (group_name, discipline, title, due_at, kind, description, lesson_date, lesson_start, teacher_id) VALUES (?,?,?,?,?,?,?,?,?)');
    const lessonBefore = (g, disc, off) => {
      // Задание выдано на уже прошедшей паре (сегодня или раньше)
      for (let i = 0; i >= -10; i--) {
        const day = A.addDays(today, i);
        const l = lessonsOn(g, day).find((x) => x.subject === disc);
        if (l) return { date: A.isoDate(day), start: A.pairsFor(g)[l.pair][0] };
      }
      return null;
    };
    for (const [g, list] of Object.entries(dls)) for (const [disc, title, off, kind, desc] of list) {
      const lsn = lessonBefore(g, disc, off);
      const tid = TEACHES.some(([tg, ts]) => tg === g && ts === disc) ? teacherId : null;
      // Контрольные и домашние задания сдаются к следующей паре, проекты и эссе — к своей дате
      let due = dt(off, off === 0 ? '23:59' : '18:00');
      if (lsn && ['test', 'homework'].includes(kind)) {
        for (let k = 1; k <= 14; k++) {
          const nd = A.addDays(A.parseDate(lsn.date), k);
          const nl = lessonsOn(g, nd).find((x) => x.subject === disc);
          if (nl) { due = `${A.isoDate(nd)}T${A.pairsFor(g)[nl.pair][0]}:00`; break; }
        }
      }
      insDl2.run(g, disc, title, due, kind, desc || null, lsn?.date || null, lsn?.start || null, tid);
    }
    // Самостоятельный дедлайн без пары
    insDl2.run('2УП-05', 'Учебный офис', 'Выбрать дисциплины по выбору на весну', dt(10, '23:59'), 'admin', 'Выбор в разделе «Учебный план».', null, null, null);
    const anna = db.prepare("SELECT id FROM users WHERE login='anna'").get().id;
    const timur = db.prepare("SELECT id FROM users WHERE login='timur'").get().id;
    const firstAnnaDl = db.prepare("SELECT id FROM deadlines WHERE group_name='2УП-05' ORDER BY due_at LIMIT 1").get().id;
    db.prepare('INSERT INTO deadline_done (user_id, deadline_id) VALUES (?,?)').run(anna, firstAnnaDl);

    // Общие объявления
    const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    insNotif.run('all', 'news', `${sess.name}: расписание опубликовано`, `Расписание экзаменов и консультаций уже в разделе «Успеваемость → Сессия». Зачетная неделя: ${sess.credits_week.map((x) => x.split('-').reverse().join('.')).join(' – ')}.`, '#/grades/session', 1, 1, 'Деканат', ago(30));
    insNotif.run('all', 'news', 'Выбор дисциплин по выбору на весенний семестр', 'До конца месяца откройте раздел «Учебный план» и выберите два курса по выбору. Если не выбрать, курсы назначат автоматически.', null, 0, 0, 'Учебный офис', ago(52));
    insNotif.run('all', 'finance', 'Стипендия за текущий месяц перечислена', 'Выплата поступит на карту в течение двух рабочих дней. Справку о размере стипендии можно заказать онлайн.', '#/requests/new/stipend_cert', 0, 0, 'Бухгалтерия', ago(76));
    insNotif.run('all', 'news', 'Зимний кампус: набор волонтеров', 'Студенческий совет ищет волонтеров на новогодний фестиваль. Волонтерские часы учитываются в портфолио.', null, 0, 0, 'Студсовет', ago(120));
    insNotif.run('faculty:Факультет управления и политики', 'news', 'Модель ООН: регистрация команд', 'Регистрация команд до пятницы. Участие засчитывается как проектная работа по «Международным конфликтам».', null, 0, 0, 'Деканат ФИТ', ago(8));
    insNotif.run(`user:${timur}`, 'grades', 'Назначена пересдача', `«Основы маркетинга»: ${rd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, 16:00, аудитория 4138 (Корпус МО).`, '#/schedule/' + A.isoDate(rd), 1, 1, 'Деканат', ago(5));

    // Заявки с историей
    const insReq = db.prepare('INSERT INTO requests (public_id, student_id, type, title, payload, status, created_at, updated_at, eta, assignee, doc_code) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insEv = db.prepare('INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?,?,?,?,?,?,?)');
    const staffName = 'Ладогина О. В.';

    let rid = insReq.run(publicId('Z'), anna, 'study_cert', 'Справка об обучении', JSON.stringify({ purpose: 'По месту работы родителей', format: 'electronic' }), 'ready', ago(240), ago(240), null, null, publicId('D')).lastInsertRowid;
    insEv.run(rid, 'status', 'submitted', 'student', null, null, ago(240));
    insEv.run(rid, 'status', 'ready', 'system', 'Орбита', 'Электронная справка сформирована и подписана.', ago(240));

    rid = insReq.run(publicId('Z'), anna, 'financial_aid', 'Материальная помощь', JSON.stringify({ reason: 'Утрата имущества', details: 'Сломался ноутбук, на котором я выполняю лабораторные. Прилагаю чек из сервиса.' }), 'in_progress', ago(70), ago(20), d(9), staffName, null).lastInsertRowid;
    insEv.run(rid, 'status', 'submitted', 'student', null, null, ago(70));
    insEv.run(rid, 'status', 'in_progress', 'staff', staffName, 'Заявление передано в стипендиальную комиссию. Заседание — в следующую среду.', ago(20));
    insEv.run(rid, 'message', null, 'student', 'Анна Ветрова', 'Спасибо! Нужно ли приносить оригинал чека?', ago(19));
    insEv.run(rid, 'message', null, 'staff', staffName, 'Достаточно скана — он уже приложен. Оригинал храните у себя.', ago(18));

    rid = insReq.run(publicId('Z'), timur, 'academic_leave', 'Академический отпуск', JSON.stringify({ reason: 'Семейные обстоятельства', from: d(14), details: 'Прошу предоставить академический отпуск на один год в связи с уходом за родственником.' }), 'need_info', ago(50), ago(26), d(4), staffName, null).lastInsertRowid;
    insEv.run(rid, 'status', 'submitted', 'student', null, null, ago(50));
    insEv.run(rid, 'status', 'need_info', 'staff', staffName, 'Прошу вас по возможности предоставить подтверждающие документы (например, медицинское заключение о состоянии родственника). Без них заявление не сможет рассмотреть комиссия. Скан можно отправить ответом сюда.', ago(26));

    rid = insReq.run(publicId('Z'), timur, 'stipend_cert', 'Справка о размере стипендии', JSON.stringify({ period: '6 месяцев', purpose: 'Для налогового вычета' }), 'rejected', ago(300), ago(280), null, staffName, null).lastInsertRowid;
    insEv.run(rid, 'status', 'submitted', 'student', null, null, ago(300));
    insEv.run(rid, 'status', 'rejected', 'staff', staffName, 'Вы обучаетесь по договору, стипендия за этот период не начислялась. Если нужна справка об оплате обучения — напишите вопрос в деканат.', ago(280));

    // Мероприятия: публикуются в ленте, их можно добавить в свой календарь
    const insEvent = db.prepare('INSERT INTO events (title, description, place, start_at, end_at, audience, organizer, author_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    const evNote = db.prepare("INSERT INTO notifications (audience, category, title, body, link, important, author, created_at) VALUES (?, 'event', ?, ?, ?, 0, ?, ?)");
    const addEvent = (title, desc, place, date, start, end, audience, organizer, author, h) => {
      const id = insEvent.run(title, desc, place, `${date}T${start}`, `${date}T${end}`, audience, organizer, author, ago(h)).lastInsertRowid;
      const dd = date.split('-').reverse().join('.');
      evNote.run(audience, title, `${dd}, ${start}–${end} · ${place}`, `#/events/${id}`, organizer, ago(h));
      return id;
    };
    // Конференция намеренно ставится на время пар группы 2УП-05 — чтобы показать предупреждение о пересечении
    let cd = A.addDays(today, 1);
    while (A.weekday(cd) > 6 || !lessonsOn('2УП-05', cd).some((l) => l.pair === 3)) cd = A.addDays(cd, 1);
    addEvent('Научная студенческая конференция «Мир в 2030 году»',
      'Ежегодная конференция студентов и аспирантов. Секции: международная безопасность, мировая экономика, медиа и коммуникации, регионоведение.\n\nПрограмма: пленарное заседание, работа секций, вручение дипломов лучшим докладчикам. Участие в качестве слушателя свободное, для выступления нужна регистрация до начала конференции.',
      'Актовый зал (Корпус МО)', A.isoDate(cd), '12:10', '15:50', 'all', 'Научное студенческое общество', null, 20);
    let ed = A.addDays(today, 3);
    while (A.weekday(ed) > 5) ed = A.addDays(ed, 1);
    addEvent('Открытая лекция «Дипломатия в цифровую эпоху»',
      'Лекция приглашенного эксперта о том, как социальные сети и большие данные меняют работу дипломатов. После лекции — ответы на вопросы.',
      'зал 2 (Корпус МО)', A.isoDate(ed), '18:00', '19:30', 'all', 'Деканат', null, 30);
    let md = A.addDays(today, 5);
    while (A.weekday(md) !== 6) md = A.addDays(md, 1);
    addEvent('Мастер-класс «Как читать экономические новости»',
      'Практическое занятие для студентов МЖ: откуда берутся цифры в новостях, как проверять данные и не путать инфляцию с ростом цен. Возьмите ноутбук.',
      '3019 (Корпус МЭО)', A.isoDate(md), '14:30', '16:00', 'faculty:Факультет международной журналистики', 'Кравцова Е. М.', teacherId, 6);
    // Анна уже добавила открытую лекцию в свой календарь
    db.prepare('INSERT INTO user_events (user_id, event_id, added_at) VALUES (?,?,?)').run(anna, 2, ago(4));

    // Заявка преподавателя на перенос пары — ждет решения деканата
    let rsd = A.addDays(today, 1);
    while (!lessonsOn('2МЖ-05', rsd).some((l) => l.subject === 'Мировая экономика')) rsd = A.addDays(rsd, 1);
    const rl = lessonsOn('2МЖ-05', rsd).find((l) => l.subject === 'Мировая экономика');
    let rtd = A.addDays(rsd, 1);
    while (A.weekday(rtd) > 5) rtd = A.addDays(rtd, 1);
    db.prepare(`INSERT INTO reschedules (teacher_id, group_name, subject, kind, room, from_date, from_start, from_end, from_pair, to_date, to_start, to_end, to_room, reason, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?)`).run(teacherId, '2МЖ-05', rl.subject, rl.kind, rl.room, A.isoDate(rsd), A.PAIRS[rl.pair][0], A.PAIRS[rl.pair][1], rl.pair,
      A.isoDate(rtd), '19:00', '20:20', rl.room, 'Участвую в отраслевой конференции в первой половине дня', ago(3));
  });
}

module.exports = { seed, DEMO_ACCOUNTS };
