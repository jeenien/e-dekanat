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
];

// Расписание групп: [день, пара, неделя, индекс предмета, вид, аудитория]
const GROUPS = {
  'ПИ-21': {
    subjects: [
      ['Алгоритмы и структуры данных', 'Колосов Д. А.'],
      ['Базы данных', 'Мирская Е. В.'],
      ['Математический анализ', 'Ветлугин П. С.'],
      ['Веб-разработка', 'Аристова Л. М.'],
      ['Английский язык', 'Брукс-Андреева Н. Ю.'],
      ['Теория вероятностей', 'Шахов И. Р.'],
      ['Физическая культура', 'Гордеев А. А.'],
    ],
    plan: [
      [1, 1, 'all', 0, 'Лекция', 'А-301'], [1, 2, 'all', 0, 'Практика', 'Б-214'], [1, 3, 'odd', 4, 'Практика', 'Л-105'],
      [2, 2, 'all', 1, 'Лекция', 'А-210'], [2, 3, 'all', 1, 'Лаб. работа', 'Б-318'], [2, 4, 'even', 6, 'Практика', 'Спорткомплекс'],
      [3, 1, 'all', 2, 'Лекция', 'А-101'], [3, 2, 'all', 2, 'Практика', 'А-115'], [3, 4, 'odd', 5, 'Лекция', 'А-301'],
      [4, 2, 'all', 3, 'Лекция', 'Онлайн'], [4, 3, 'all', 3, 'Лаб. работа', 'Б-320'], [4, 4, 'all', 4, 'Практика', 'Л-105'],
      [5, 1, 'even', 5, 'Практика', 'А-118'], [5, 2, 'all', 0, 'Лаб. работа', 'Б-214'], [5, 3, 'all', 6, 'Практика', 'Спорткомплекс'],
      [6, 2, 'odd', 1, 'Практика', 'Б-318'],
    ],
  },
  'ЭК-31': {
    subjects: [
      ['Эконометрика', 'Лаптева О. Г.'],
      ['Корпоративные финансы', 'Рябинин С. В.'],
      ['Маркетинг', 'Зорина А. К.'],
      ['Налоги и налогообложение', 'Ольховский М. Т.'],
      ['Деловой английский', 'Хэмптон-Сафронова Е. Д.'],
      ['Анализ данных в Python', 'Колосов Д. А.'],
    ],
    plan: [
      [1, 3, 'all', 0, 'Лекция', 'Э-401'], [1, 4, 'all', 0, 'Практика', 'Э-212'],
      [2, 1, 'all', 1, 'Лекция', 'Э-401'], [2, 2, 'all', 1, 'Семинар', 'Э-305'], [2, 3, 'odd', 4, 'Практика', 'Л-210'],
      [3, 3, 'all', 2, 'Лекция', 'Э-120'], [3, 4, 'even', 2, 'Семинар', 'Э-306'],
      [4, 2, 'all', 3, 'Лекция', 'Э-401'], [4, 3, 'all', 3, 'Семинар', 'Э-302'], [4, 4, 'all', 5, 'Лаб. работа', 'Б-120'],
      [5, 2, 'all', 5, 'Лекция', 'Онлайн'], [5, 3, 'all', 4, 'Практика', 'Л-210'],
    ],
  },
  'ЛН-11': {
    subjects: [
      ['Введение в языкознание', 'Северина М. И.'],
      ['Практический курс английского языка', 'Доусон-Ильина К. П.'],
      ['Второй иностранный язык (немецкий)', 'Краус Е. А.'],
      ['История России', 'Белозёров Г. Н.'],
      ['Цифровая грамотность', 'Аристова Л. М.'],
      ['Физическая культура', 'Гордеев А. А.'],
    ],
    plan: [
      [1, 2, 'all', 0, 'Лекция', 'Г-201'], [1, 3, 'all', 1, 'Практика', 'Г-310'], [1, 4, 'all', 1, 'Практика', 'Г-310'],
      [2, 2, 'all', 2, 'Практика', 'Г-312'], [2, 3, 'all', 3, 'Лекция', 'А-101'], [2, 4, 'odd', 5, 'Практика', 'Спорткомплекс'],
      [3, 1, 'all', 1, 'Практика', 'Г-310'], [3, 2, 'all', 4, 'Лаб. работа', 'Б-110'], [3, 3, 'even', 3, 'Семинар', 'Г-204'],
      [4, 3, 'all', 0, 'Семинар', 'Г-204'], [4, 4, 'all', 2, 'Практика', 'Г-312'],
      [5, 2, 'all', 1, 'Практика', 'Г-310'], [5, 3, 'all', 5, 'Практика', 'Спорткомплекс'],
    ],
  },
};

// Курсы прошлых семестров: [название, вид контроля, з.е.]
const PAST = {
  'ПИ-21': {
    1: [['Программирование на Python', 'exam', 5], ['Линейная алгебра', 'exam', 4], ['Дискретная математика', 'exam', 4], ['История России', 'credit', 2], ['Английский язык', 'credit', 3], ['Физическая культура', 'credit', 1]],
    2: [['Объектно-ориентированное программирование', 'exam', 5], ['Математический анализ (часть 1)', 'exam', 5], ['Архитектура ЭВМ', 'diff_credit', 3], ['Философия', 'credit', 2], ['Английский язык', 'diff_credit', 3], ['Учебная практика', 'diff_credit', 3]],
  },
  'ЭК-31': {
    1: [['Микроэкономика', 'exam', 5], ['Высшая математика', 'exam', 5], ['История России', 'credit', 2], ['Английский язык', 'credit', 3]],
    2: [['Макроэкономика', 'exam', 5], ['Статистика', 'exam', 4], ['Философия', 'credit', 2], ['Английский язык', 'diff_credit', 3]],
    3: [['Бухгалтерский учёт', 'exam', 5], ['Финансы', 'exam', 4], ['Менеджмент', 'diff_credit', 3], ['Правоведение', 'credit', 2]],
    4: [['Мировая экономика', 'exam', 4], ['Теория вероятностей и статистика', 'exam', 5], ['Деньги, кредит, банки', 'diff_credit', 3], ['Курсовая работа по экономике фирмы', 'coursework', 2]],
  },
  'ЛН-11': {},
};

const CURRENT_CONTROL = {
  'ПИ-21': ['exam', 'exam', 'exam', 'diff_credit', 'credit', 'credit', 'credit'],
  'ЭК-31': ['exam', 'exam', 'diff_credit', 'exam', 'credit', 'credit'],
  'ЛН-11': ['exam', 'exam', 'credit', 'exam', 'credit', 'credit'],
};

// Профиль успеваемости студента: насколько хорошо он набирает баллы (0…1)
const STUDENTS = [
  {
    login: 'anna', last: 'Ветрова', first: 'Анна', middle: 'Сергеевна',
    faculty: 'Факультет информационных технологий', code: '09.03.04', program: 'Программная инженерия', profile: 'Разработка программных систем',
    course: 2, group: 'ПИ-21', form: 'Очная', funding: 'Бюджет', year: 2025, stipend: 'Академическая повышенная',
    curator: 'Мирская Елена Викторовна', book: '25-ПИ-0417', email: 'a.vetrova@student.gorizont.example', phone: '+7 900 000-14-17', birth: '2007-03-14',
    skill: [0.95, 0.88, 0.8, 0.97, 0.9, 0.85, 1], past: [['отлично', 'отлично', 'хорошо', 'зачтено', 'зачтено', 'зачтено'], ['отлично', 'хорошо', 'отлично', 'зачтено', 'отлично', 'отлично']],
  },
  {
    login: 'timur', last: 'Северцев', first: 'Тимур', middle: 'Андреевич',
    faculty: 'Экономический факультет', code: '38.03.01', program: 'Экономика', profile: 'Финансы и кредит',
    course: 3, group: 'ЭК-31', form: 'Очная', funding: 'Контракт', year: 2024, stipend: 'Не назначена',
    curator: 'Лаптева Ольга Геннадьевна', book: '24-ЭК-1183', email: 't.severtsev@student.gorizont.example', phone: '+7 900 000-11-83', birth: '2006-09-02',
    skill: [0.45, 0.7, 0.82, 0.38, 0.6, 0.9],
    past: [['хорошо', 'удовлетворительно', 'зачтено', 'зачтено'], ['удовлетворительно', 'хорошо', 'зачтено', 'хорошо'], ['хорошо', 'удовлетворительно', 'отлично', 'зачтено'], ['хорошо', 'неудовлетворительно', 'хорошо', 'отлично']],
  },
  {
    login: 'nika', last: 'Полярная', first: 'Ника', middle: 'Олеговна',
    faculty: 'Институт гуманитарных наук', code: '45.03.02', program: 'Лингвистика', profile: 'Перевод и переводоведение',
    course: 1, group: 'ЛН-11', form: 'Очная', funding: 'Бюджет', year: 2026, stipend: 'Академическая',
    curator: 'Северина Марина Игоревна', book: '26-ЛН-0032', email: 'n.polyarnaya@student.gorizont.example', phone: '+7 900 000-00-32', birth: '2008-07-21',
    skill: [0.8, 0.9, 0.7, 0.75, 0.95, 1], past: [],
  },
];

// Детерминированный генератор, чтобы данные не «прыгали» при пересоздании базы
// Дата сдачи для прошедшего семестра k: нечётные (осенние) закрываются в январе, чётные — в июне
function pastSemesterDate(startYear, currentSem, k, i) {
  // Идём назад от последнего закрытого семестра: июнь/январь попеременно
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

    // Расписание групп
    const insLesson = db.prepare('INSERT INTO lessons (group_name, weekday, pair, week, subject, kind, room, teacher, online_url) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const [g, cfg] of Object.entries(GROUPS)) {
      for (const [wd, pair, week, si, kind, room] of cfg.plan) {
        const [subject, teacher] = cfg.subjects[si];
        insLesson.run(g, wd, pair, week, subject, kind, room, teacher, room === 'Онлайн' ? 'https://meet.gorizont.example/' + g : null);
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
    for (const g of Object.keys(GROUPS)) {
      const a = findLesson(g, 0);
      if (a) {
        const l = a.lessons[a.lessons.length - 1];
        insChange.run(g, a.date, l.pair, 'room', l.subject, l.kind, 'А-405', null, null, null, 'Аудитория на ремонте');
        insNotif.run(`group:${g}`, 'schedule', `Смена аудитории: ${l.subject}`, `${a.offset === 0 ? 'Сегодня' : 'В ближайший учебный день'} занятие (${l.pair} пара) пройдёт в аудитории А-405 вместо ${l.room}.`, '#/schedule', 1, 0, 'Деканат', new Date(Date.now() - 3 * 3600e3).toISOString());
      }
      const b = findLesson(g, (a ? a.offset : 0) + 1);
      if (b) {
        const l = b.lessons[0];
        insChange.run(g, b.date, l.pair, 'cancel', l.subject, l.kind, null, null, null, null, 'Преподаватель на конференции');
        insNotif.run(`group:${g}`, 'schedule', `Отмена пары: ${l.subject}`, `${l.pair} пара (${l.kind.toLowerCase()}) ${b.date.split('-').reverse().join('.')} отменена — преподаватель на конференции. Отработка будет объявлена дополнительно.`, '#/schedule', 1, 0, 'Деканат', new Date(Date.now() - 20 * 3600e3).toISOString());
        const l2 = b.lessons[1];
        insChange.run(g, b.date, l2.pair, 'teacher', l2.subject, l2.kind, null, 'Шахов И. Р.', null, null, 'Замена преподавателя');
      }
      const c = findLesson(g, (b ? b.offset : 2) + 2);
      if (c) {
        const subj = GROUPS[g].subjects[0];
        insChange.run(g, c.date, 6, 'extra', subj[0], 'Консультация', 'А-301', subj[1], null, null, 'Дополнительная консультация перед контрольной');
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
          const did = insDisc.run(s.group, Number(sem), name, control, credits, credits * 36, 'Преподаватель кафедры', semDate, null, null, null).lastInsertRowid;
          const mark = (s.past[si] || [])[i] || 'зачтено';
          const points = mark === 'отлично' ? 86 + Math.floor(rand() * 13) : mark === 'хорошо' ? 71 + Math.floor(rand() * 13) : mark === 'удовлетворительно' ? 56 + Math.floor(rand() * 12) : mark === 'зачтено' ? 60 + Math.floor(rand() * 35) : 30 + Math.floor(rand() * 20);
          insFinal.run(uid, did, mark, points, semDate, 1);
        });
      });

      // Текущий семестр
      const sem = A.semesterFor(s.course, today);
      const cfg = GROUPS[s.group];
      cfg.subjects.forEach(([name, teacher], i) => {
        const control = CURRENT_CONTROL[s.group][i];
        const isExam = control === 'exam';
        const examDay = isExam ? A.addDays(sessStart, 1 + i * 4) : A.addDays(A.parseDate(sess.credits_week[0]), i % 6);
        const consult = isExam ? A.addDays(examDay, -1) : null;
        const did = insDisc.run(s.group, sem, name, control, isExam ? 5 : 3, isExam ? 180 : 108, teacher,
          `${A.isoDate(examDay)}T${isExam ? '09:00' : '13:50'}`, [cfg.plan.find((p) => p[3] === i)?.[5]].map((r) => (!r || r === 'Онлайн' ? 'А-301' : r))[0],
          consult ? `${A.isoDate(consult)}T15:30` : null, Math.round((isExam ? 38 : 64) + rand() * 12)).lastInsertRowid;
        // Контрольные точки: часть прошла, часть впереди
        const items = isExam
          ? [['Посещаемость', 10, -50], ['Контрольная точка 1', 15, -35], ['Лабораторные / практика', 15, -12], ['Контрольная точка 2', 20, 18]]
          : [['Посещаемость', 15, -50], ['Практические задания', 30, -30], ['Контрольная точка 1', 25, -8], ['Итоговый проект', 30, 24]];
        const sk = s.skill[i] ?? 0.8;
        items.forEach(([title, max, off]) => {
          const passed = off < 0;
          const score = passed ? Math.max(0, Math.min(max, Math.round(max * (sk - 0.08 + rand() * 0.14)))) : null;
          insItem.run(uid, did, title, score, max, d(off));
        });
      });
    }

    // Задолженность Тимура: пересдача по прошлому семестру
    // (в его прошлых оценках есть «неудовлетворительно» по теории вероятностей)

    // Дедлайны групп
    const insDl = db.prepare('INSERT INTO deadlines (group_name, discipline, title, due_at, kind) VALUES (?,?,?,?,?)');
    const dls = {
      'ПИ-21': [['Алгоритмы и структуры данных', 'Лабораторная №5: AVL-дерево', 1, 'lab'], ['Базы данных', 'Курсовой проект: ER-диаграмма', 3, 'project'], ['Математический анализ', 'Контрольная точка 2', 6, 'test'], ['Веб-разработка', 'Сдать макет личного кабинета', 9, 'project'], ['Английский язык', 'Эссе «Technology and Society»', 12, 'essay']],
      'ЭК-31': [['Эконометрика', 'Домашнее задание: регрессия', 0, 'homework'], ['Корпоративные финансы', 'Кейс: оценка проекта NPV', 4, 'project'], ['Налоги и налогообложение', 'Реферат', 8, 'essay'], ['Анализ данных в Python', 'Ноутбук с EDA', 11, 'lab']],
      'ЛН-11': [['Практический курс английского языка', 'Аудирование: unit 7', 2, 'homework'], ['Введение в языкознание', 'Доклад о языковых семьях', 7, 'essay'], ['Цифровая грамотность', 'Тест по информационной безопасности', 10, 'test']],
    };
    for (const [g, list] of Object.entries(dls)) for (const [disc, title, off, kind] of list) insDl.run(g, disc, title, dt(off, off === 0 ? '23:59' : '18:00'), kind);
    const anna = db.prepare("SELECT id FROM users WHERE login='anna'").get().id;
    const timur = db.prepare("SELECT id FROM users WHERE login='timur'").get().id;
    const firstAnnaDl = db.prepare("SELECT id FROM deadlines WHERE group_name='ПИ-21' ORDER BY due_at LIMIT 1").get().id;
    db.prepare('INSERT INTO deadline_done (user_id, deadline_id) VALUES (?,?)').run(anna, firstAnnaDl);

    // Общие объявления
    const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    insNotif.run('all', 'news', `${sess.name}: расписание опубликовано`, `Расписание экзаменов и консультаций уже в разделе «Успеваемость → Сессия». Зачётная неделя: ${sess.credits_week.map((x) => x.split('-').reverse().join('.')).join(' – ')}.`, '#/grades/session', 1, 1, 'Деканат', ago(30));
    insNotif.run('all', 'news', 'Выбор дисциплин по выбору на весенний семестр', 'До конца месяца откройте раздел «Учебный план» и выберите два курса по выбору. Если не выбрать, курсы назначат автоматически.', null, 0, 0, 'Учебный офис', ago(52));
    insNotif.run('all', 'finance', 'Стипендия за текущий месяц перечислена', 'Выплата поступит на карту в течение двух рабочих дней. Справку о размере стипендии можно заказать онлайн.', '#/requests/new/stipend_cert', 0, 0, 'Бухгалтерия', ago(76));
    insNotif.run('all', 'news', 'Зимний кампус: набор волонтёров', 'Студенческий совет ищет волонтёров на новогодний фестиваль. Волонтёрские часы учитываются в портфолио.', null, 0, 0, 'Студсовет', ago(120));
    insNotif.run('faculty:Факультет информационных технологий', 'news', 'Хакатон факультета ИТ', 'Регистрация команд до пятницы. Призёры получают автомат по «Веб-разработке».', null, 0, 0, 'Деканат ФИТ', ago(8));
    insNotif.run(`user:${timur}`, 'grades', 'Академическая задолженность', 'У вас задолженность по дисциплине «Теория вероятностей и статистика». Подайте заявление на пересдачу до конца месяца.', '#/requests/new/retake', 1, 0, 'Деканат', ago(5));

    // Заявки с историей
    const insReq = db.prepare('INSERT INTO requests (public_id, student_id, type, title, payload, status, created_at, updated_at, eta, assignee, doc_code) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insEv = db.prepare('INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?,?,?,?,?,?,?)');
    const staffName = 'Ладогина О. В.';

    let rid = insReq.run(publicId('Z'), anna, 'study_cert', 'Справка об обучении', JSON.stringify({ purpose: 'По месту работы родителей', format: 'electronic' }), 'ready', ago(240), ago(240), null, null, publicId('D')).lastInsertRowid;
    insEv.run(rid, 'status', 'submitted', 'student', null, null, ago(240));
    insEv.run(rid, 'status', 'ready', 'system', 'Орбита', 'Электронная справка сформирована автоматически и подписана.', ago(240));

    rid = insReq.run(publicId('Z'), anna, 'financial_aid', 'Материальная помощь', JSON.stringify({ reason: 'Утрата имущества', details: 'Сломался ноутбук, на котором я выполняю лабораторные. Прилагаю чек из сервиса.' }), 'in_progress', ago(70), ago(20), d(9), staffName, null).lastInsertRowid;
    insEv.run(rid, 'status', 'submitted', 'student', null, null, ago(70));
    insEv.run(rid, 'status', 'in_progress', 'staff', staffName, 'Заявление передано в стипендиальную комиссию. Заседание — в следующую среду.', ago(20));
    insEv.run(rid, 'message', null, 'student', 'Анна Ветрова', 'Спасибо! Нужно ли приносить оригинал чека?', ago(19));
    insEv.run(rid, 'message', null, 'staff', staffName, 'Достаточно скана — он уже приложен. Оригинал храните у себя.', ago(18));

    rid = insReq.run(publicId('Z'), timur, 'individual_plan', 'Индивидуальный график', JSON.stringify({ reason: 'Работа по специальности', details: 'Работаю аналитиком на полставки, прошу свободное посещение по вторникам.' }), 'need_info', ago(50), ago(26), d(4), staffName, null).lastInsertRowid;
    insEv.run(rid, 'status', 'submitted', 'student', null, null, ago(50));
    insEv.run(rid, 'status', 'need_info', 'staff', staffName, 'Пожалуйста, приложите справку с места работы с указанием графика. Её можно принести в деканат (каб. А-112) или отправить скан ответом сюда.', ago(26));

    rid = insReq.run(publicId('Z'), timur, 'stipend_cert', 'Справка о размере стипендии', JSON.stringify({ period: '6 месяцев', purpose: 'Для налогового вычета' }), 'rejected', ago(300), ago(280), null, staffName, null).lastInsertRowid;
    insEv.run(rid, 'status', 'submitted', 'student', null, null, ago(300));
    insEv.run(rid, 'status', 'rejected', 'staff', staffName, 'Вы обучаетесь на контрактной основе, стипендия за этот период не начислялась. Если нужна справка об оплате обучения — напишите вопрос в деканат.', ago(280));
  });
}

module.exports = { seed, DEMO_ACCOUNTS };
