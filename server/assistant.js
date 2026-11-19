// «Спроси Орбиту» — помощник по учебе и порядкам деканата.
// Если на сервере задан ANTHROPIC_API_KEY, отвечает Claude; иначе — встроенный
// локальный режим на правилах. Ключ живет только в переменных окружения сервера.
const A = require('./academic');
const S = require('./services');
const { TYPES } = require('./catalog');
const { AI_ENABLED, ANTHROPIC_MODEL } = require('./config');

// База знаний о порядках (вымышленного) вуза — то, о чем обычно спрашивают в деканате
const KNOWLEDGE = `
- Деканат: корпус А, кабинет А-112. Прием: пн–пт 10:00–17:00, обед 13:00–14:00. Запись на прием онлайн — услуга «Запись на прием».
- Справка об обучении: электронная с QR-кодом формируется сразу, бумажная — 2 рабочих дня, забирать в А-112.
- Выписка из зачетки: на русском — сразу, на английском — 5 рабочих дней.
- Справка в военкомат — только бумажная, 3 рабочих дня.
- Рейтинг по дисциплине (0–100) = срезы 1–3 (вес 1) + посещаемость в % (вес 0,5) + работа на парах (вес 0,3). Зачет: рейтинг от 70 — автомат, ниже — выход на зачет. Экзамен: допуск от 50, итог = 60% рейтинга + 40% экзамена.
- Шкала (рейтинг в процентах / ECTS): 90–100 — «отлично» (A), 82–89 — «хорошо» (B), 75–81 — «хорошо» (C), 67–74 — «удовлетворительно» (D), 60–66 — «удовлетворительно» (E), меньше 60 — «неудовлетворительно» (F).
- Пересдачи назначают деканат и кафедра сами, заявление не нужно: дата, время и аудитория появляются в расписании и на главной. Если обычные пересдачи использованы — можно подать заявление «Ректорская пересдача».
- Пропуски: пара = 2 академических часа. Неуважительные пропуски: 30 ч (15 пар) — выговор, 60 ч — отчисление. Пропуски по справке не учитываются.
- Проходы через турникеты (СКУД) видны в разделе «Посещаемость».
- Академическая стипендия назначается по итогам сессии студентам бюджета без троек и долгов; повышенная — при сессии на «отлично» и активности.
- Материальная помощь рассматривается стипендиальной комиссией раз в 2 недели.
- Академический отпуск — до 2 лет, основания: медицинские, семейные, призыв.
- Индивидуальный график — для работающих по специальности, спортсменов, по семейным обстоятельствам. Нужна подтверждающая справка.
- Пропуск по болезни: справку из поликлиники принести в деканат в течение 3 дней после выздоровления.
`.trim();

function buildContext(db, userId, today) {
  const st = S.getStudent(db, userId);
  const g = S.gradesOverview(db, userId);
  const todayS = S.daySchedule(db, st.group, today, userId);
  const tomorrow = S.daySchedule(db, st.group, A.isoDate(A.addDays(A.parseDate(today), 1)), userId);
  const week = S.rangeSchedule(db, st.group, today, 7, userId);
  const retakes = S.retakesFor(db, userId);
  const abs = S.absencesFor(db, userId);
  const deadlines = S.deadlinesFor(db, userId, st.group).filter((d) => !d.done && new Date(d.due_at) > Date.now()).slice(0, 6);
  const requests = db.prepare('SELECT title, status, eta FROM requests WHERE student_id = ? ORDER BY created_at DESC LIMIT 6').all(userId);
  return { st, g, todayS, tomorrow, week, deadlines, requests, retakes, abs };
}

const fmtLesson = (l) => `${l.pair} пара ${l.start}–${l.end}: ${l.subject} (${l.kind.toLowerCase()}), ${l.room}${l.teacher ? ', ' + l.teacher : ''}${l.change ? ` [изменение: ${l.change.type === 'cancel' ? 'ОТМЕНА' : l.change.type === 'room' ? 'новая аудитория, было ' + l.change.old_room : l.change.type === 'teacher' ? 'замена преподавателя' : l.change.type === 'extra' ? 'дополнительное занятие' : 'перенос'}]` : ''}`;
const ruDay = (iso) => new Date(iso).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

// Сводка для модели: БЕЗ ФИО, контактов, номера зачетки — только то, что нужно для ответа
function contextText(c) {
  const { st, g } = c;
  return [
    `Студент: ${st.course} курс, группа ${st.group}, ${st.program}, ${st.funding.toLowerCase()}, текущий семестр ${g.semester}. ${st.funding === 'Бюджет' ? `Стипендия: ${st.stipend}.` : 'Обучение по договору.'}`,
    `Сегодня (${ruDay(c.todayS.date)}, ${c.todayS.week}-я неделя, ${c.todayS.parity === 'odd' ? 'нечетная' : 'четная'}): ${c.todayS.lessons.length ? c.todayS.lessons.map(fmtLesson).join('; ') : 'пар нет'}.`,
    `Неделя: ${c.week.slice(1).map((d) => `${ruDay(d.date)} — ${d.lessons.length ? d.lessons.map(fmtLesson).join('; ') : 'пар нет'}`).join(' | ')}.`,
    `Текущая успеваемость: ${g.current.map((x) => `${x.name} — рейтинг ${x.earned} из 100, прогноз ${x.projected}, ${x.control_label.toLowerCase()}, статус: ${x.label}`).join('; ')}.`,
    `Средний балл за прошлые сессии: ${g.summary.gpa ?? 'сессий еще не было'}. Долги: ${g.debts.length ? g.debts.map((d) => d.name).join(', ') : 'нет'}. ${g.summary.stipend ? `Прогноз стипендии: ${g.summary.stipend.title} — ${g.summary.stipend.text}` : ''}`,
    `Сессия: ${g.session.name} ${g.session.start}…${g.session.end}. Экзамены/зачеты: ${g.session.exams.map((e) => `${e.name} ${e.date.replace('T', ' ')} ${e.room}`).join('; ')}.`,
    `Дедлайны: ${c.deadlines.length ? c.deadlines.map((d) => `${d.title} (${d.discipline}) до ${d.due_at.replace('T', ' ').slice(0, 16)}`).join('; ') : 'нет'}.`,
    `Пересдачи: ${c.retakes.length ? c.retakes.map((r) => `${r.discipline} ${r.date} ${r.start}, ${r.room}`).join('; ') : 'нет'}.`,
    `Пропуски (неуважительные): ${c.abs.hours} ак. ч. из 30 до выговора; по справке ${c.abs.excused_hours} ак. ч.`,
    `Заявки: ${c.requests.length ? c.requests.map((r) => `${r.title} — ${r.status}`).join('; ') : 'нет'}.`,
  ].join('\n');
}

// --- Локальный режим: понимает типовые вопросы и отвечает по данным кабинета ---
const ACTIONS = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { label: `Оформить: ${t.title}`, href: `#/requests/new/${k}` }]));
function localAnswer(c, text) {
  const t = text.toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  const actions = [];
  let answer;
  if (has('завтра')) {
    const d = c.tomorrow;
    answer = d.lessons.length ? `Завтра, ${ruDay(d.date)}, у вас ${d.lessons.length} ${d.lessons.length === 1 ? 'пара' : d.lessons.length < 5 ? 'пары' : 'пар'}:\n${d.lessons.map((l) => '• ' + fmtLesson(l)).join('\n')}` : `Завтра (${ruDay(d.date)}) пар нет — можно выдохнуть 🙂`;
    actions.push({ label: 'Открыть расписание', href: '#/schedule' });
  } else if (has('сегодня', 'пара', 'расписан', 'аудитор', 'где занят', 'куда идти')) {
    const d = c.todayS;
    const live = d.lessons.filter((l) => l.change?.type !== 'cancel');
    answer = d.lessons.length ? `Сегодня ${live.length} ${live.length === 1 ? 'занятие' : 'занятия'}:\n${d.lessons.map((l) => '• ' + fmtLesson(l)).join('\n')}` : 'Сегодня пар нет.';
    const ch = c.week.flatMap((x) => x.lessons.filter((l) => l.change).map((l) => ({ ...l, date: x.date })));
    if (ch.length) answer += `\n\nНа неделе есть изменения: ${ch.length}. Они подсвечены в расписании.`;
    actions.push({ label: 'Открыть расписание', href: '#/schedule' });
  } else if (has('стипенд')) {
    answer = c.g.summary.stipend ? `Сейчас: ${c.st.stipend}. Прогноз на следующий семестр — «${c.g.summary.stipend.title}». ${c.g.summary.stipend.text}` : 'Вы учитесь по договору, академическая стипендия к вам не относится. Если нужна поддержка, можно подать заявление на материальную помощь.';
    actions.push(c.g.summary.stipend ? ACTIONS.stipend_cert : ACTIONS.financial_aid);
  } else if (has('долг', 'пересда', 'хвост')) {
    if (c.retakes.length) {
      const r = c.retakes[0];
      answer = `У вас назначена пересдача: «${r.discipline}» — ${new Date(r.date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}, ${r.start}, аудитория ${r.room}, принимает ${r.examiner}. Заявление не нужно — пересдачу назначили деканат и кафедра.`;
      actions.push({ label: 'Открыть в расписании', href: `#/schedule/${r.date}` });
    } else if (c.g.debts.length) {
      answer = `Есть задолженность: ${c.g.debts.map((d) => `«${d.name}»`).join(', ')}. Дату пересдачи назначат деканат и кафедра — она появится в расписании и на главной. Если обычные пересдачи уже использованы, можно подать заявление на ректорскую.`;
      actions.push(ACTIONS.rector_retake);
    } else answer = 'Задолженностей и назначенных пересдач нет 🎉';
  } else if (has('пропус', 'прогул', 'выговор', 'отчисл')) {
    answer = c.abs.hours >= 30 ? `Пропусков без уважительной причины: ${c.abs.hours} ак. ч. из 60 ак. ч. — это риск отчисления. Пропуски по справке (${c.abs.excused_hours} ак. ч.) не учитываются.` : `Пропусков без уважительной причины: ${c.abs.hours} ак. ч. из 30 ак. ч. (${c.abs.hours / 2} пар). Пропуски по справке (${c.abs.excused_hours} ак. ч.) не учитываются.`;
    actions.push({ label: 'Открыть «Посещаемость»', href: '#/campus' });
  } else if (has('допуск', 'балл', 'успева', 'оценк', 'экзамен', 'сесси', 'автомат', 'зачет', 'зачет')) {
    const risk = c.g.current.filter((x) => x.status !== 'ok');
    answer = `Коротко по семестру:\n${c.g.current.map((x) => `• ${x.name}: рейтинг ${x.earned} из 100, ${x.label.toLowerCase()}`).join('\n')}`;
    answer += risk.length ? `\n\nОбратите внимание на: ${risk.map((x) => x.name).join(', ')}.` : '\n\nВсе в графике — так держать!';
    const ex = c.g.session.exams.find((e) => e.control_label === 'Экзамен');
    if (ex) answer += `\nПервый экзамен — ${ex.name}, ${new Date(ex.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.`;
    actions.push({ label: 'Открыть успеваемость', href: '#/grades' });
  } else if (has('дедлайн', 'сдать', 'задани', 'домашк', 'лаб')) {
    answer = c.deadlines.length ? `Ближайшие дедлайны:\n${c.deadlines.map((d) => `• ${d.title} — ${d.discipline}, до ${new Date(d.due_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`).join('\n')}` : 'Открытых дедлайнов нет.';
    actions.push({ label: 'Все дедлайны', href: '#/today' });
  } else if (has('военкомат')) {
    answer = 'Справка в военкомат оформляется по форме приложения № 2, только бумажная. Срок — 3 рабочих дня, забрать в А-112.';
    actions.push(ACTIONS.military);
  } else if (has('выписк', 'зачетк', 'зачетк')) {
    answer = 'Выписку из зачетной книжки можно получить онлайн: на русском — сразу, электронный документ с QR-кодом; на английском — за 5 рабочих дней.';
    actions.push(ACTIONS.transcript);
  } else if (has('справк')) {
    answer = 'Справку об обучении можно получить прямо сейчас: электронная с QR-кодом формируется мгновенно и принимается там, где можно проверить подлинность онлайн. Бумажная с печатью — за 2 рабочих дня.';
    actions.push(ACTIONS.study_cert);
  } else if (has('академ', 'отпуск')) {
    answer = 'Академический отпуск дается до 2 лет по медицинским, семейным основаниям или в связи с призывом. Заявление подается онлайн, к нему нужны подтверждающие документы. Рассмотрение — до 10 рабочих дней.';
    actions.push(ACTIONS.academic_leave);
  } else if (has('матпом', 'материальн', 'деньг')) {
    answer = 'Материальную помощь рассматривает стипендиальная комиссия раз в две недели. Опишите ситуацию в заявлении — подтверждающие документы можно приложить позже в переписке.';
    actions.push(ACTIONS.financial_aid);
  } else if (has('болел', 'болезн', 'справка из поликлин')) {
    answer = 'Если вы болели, принесите справку из поликлиники в деканат (А-112) в течение 3 дней после выздоровления. Пропущенные контрольные точки согласуйте с преподавателем.';
    actions.push(ACTIONS.appointment);
  } else if (has('график', 'работа', 'свободн')) {
    answer = 'Индивидуальный график (свободное посещение) дают работающим по специальности, спортсменам и по семейным обстоятельствам. Понадобится справка, подтверждающая основание.';
    actions.push(ACTIONS.individual_plan);
  } else if (has('деканат', 'прием', 'прием', 'кабинет', 'часы работы', 'где находится')) {
    answer = 'Деканат: корпус А, кабинет А-112. Прием пн–пт 10:00–17:00, обед 13:00–14:00. Запишитесь онлайн — и не придется стоять в очереди.';
    actions.push(ACTIONS.appointment);
  } else if (has('привет', 'здравств', 'добрый')) {
    answer = `Привет, ${c.st.first_name}! Я помогу разобраться с расписанием, баллами, справками и заявлениями. Спросите, например: «Что у меня завтра?» или «Как дела с допуском?»`;
  } else {
    answer = 'Пока не знаю точного ответа на этот вопрос. Задайте его сотрудникам деканата — ответ придет в переписку по обращению.';
    actions.push(ACTIONS.question);
  }
  return { answer, actions: actions.filter(Boolean).slice(0, 2), mode: 'local' };
}

// --- Режим Claude ---
let client = null;
function getClient() {
  if (!client) { const Anthropic = require('@anthropic-ai/sdk'); client = new Anthropic(); }
  return client;
}
const SYSTEM = `Ты — «Орбита», дружелюбный помощник в личном кабинете студента вымышленного Университета «Горизонт» (конкурсный концепт цифрового деканата).
Отвечай по-русски, коротко (до 120 слов), по делу, на «вы». Опирайся ТОЛЬКО на данные студента и правила ниже; если данных нет — честно скажи и предложи задать вопрос деканату.
Не выдумывай оценки, даты и правила. Не давай медицинских и юридических советов.
Если уместно действие в кабинете, в последней строке напиши ACTIONS: и через запятую коды из списка: ${Object.keys(TYPES).join(', ')}, schedule, grades.

Правила вуза:
${KNOWLEDGE}`;

async function claudeAnswer(c, text, history) {
  const msgs = [];
  for (const h of (history || []).slice(-6)) {
    if ((h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim()) msgs.push({ role: h.role, content: h.text.slice(0, 1500) });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  msgs.push({ role: 'user', content: `Данные студента на сегодня:\n${contextText(c)}\n\nВопрос: ${text}` });
  const resp = await getClient().beta.messages.create({
    model: ANTHROPIC_MODEL, max_tokens: 2000,
    // при отказе модели сервер API сам повторит запрос на резервной модели
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM, messages: msgs,
  });
  if (resp.stop_reason === 'refusal') return null;
  let out = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const actions = [];
  const m = out.match(/\n?ACTIONS:\s*(.+)\s*$/);
  if (m) {
    out = out.slice(0, m.index).trim();
    for (const code of m[1].split(',').map((x) => x.trim())) {
      if (ACTIONS[code]) actions.push(ACTIONS[code]);
      else if (code === 'schedule') actions.push({ label: 'Открыть расписание', href: '#/schedule' });
      else if (code === 'grades') actions.push({ label: 'Открыть успеваемость', href: '#/grades' });
    }
  }
  return out ? { answer: out, actions: actions.slice(0, 2), mode: 'claude' } : null;
}

async function ask(db, userId, text, history, today) {
  const c = buildContext(db, userId, today);
  if (AI_ENABLED) {
    try { const r = await claudeAnswer(c, text, history); if (r) return r; } catch (e) { console.error('assistant: Claude недоступен, локальный режим:', e.status || e.message); }
  }
  return localAnswer(c, text);
}

module.exports = { ask, KNOWLEDGE };
