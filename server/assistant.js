// «Спроси Орбиту» — помощник по учёбе и порядкам деканата.
// Если на сервере задан ANTHROPIC_API_KEY, отвечает Claude; иначе — встроенный
// локальный режим на правилах. Ключ живёт только в переменных окружения сервера.
const A = require('./academic');
const S = require('./services');
const { TYPES } = require('./catalog');
const { AI_ENABLED, ANTHROPIC_MODEL } = require('./config');

// База знаний о порядках (вымышленного) вуза — то, о чём обычно спрашивают в деканате
const KNOWLEDGE = `
- Деканат: корпус А, кабинет А-112. Приём: пн–пт 10:00–17:00, обед 13:00–14:00. Запись на приём онлайн — услуга «Запись на приём».
- Справка об обучении: электронная с QR-кодом формируется сразу, бумажная — 2 рабочих дня, забирать в А-112.
- Выписка из зачётки: на русском — сразу, на английском — 5 рабочих дней.
- Справка в военкомат — только бумажная, 3 рабочих дня.
- БРС: 100 баллов за дисциплину. Экзамен: до 60 баллов в семестре + до 40 на экзамене, допуск от 35 баллов. Зачёт: «зачтено» от 55 баллов в семестре.
- Шкала: 85+ — «отлично», 70–84 — «хорошо», 55–69 — «удовлетворительно».
- Пересдача: подать заявление «Пересдача», деканат согласует дату с преподавателем за 3 рабочих дня. Не более двух пересдач, вторая — комиссии.
- Академическая стипендия назначается по итогам сессии студентам бюджета без троек и долгов; повышенная — при сессии на «отлично» и активности.
- Материальная помощь рассматривается стипендиальной комиссией раз в 2 недели.
- Академический отпуск — до 2 лет, основания: медицинские, семейные, призыв.
- Индивидуальный график — для работающих по специальности, спортсменов, по семейным обстоятельствам. Нужна подтверждающая справка.
- Пропуск по болезни: справку из поликлиники принести в деканат в течение 3 дней после выздоровления.
`.trim();

function buildContext(db, userId, today) {
  const st = S.getStudent(db, userId);
  const g = S.gradesOverview(db, userId);
  const todayS = S.daySchedule(db, st.group, today);
  const tomorrow = S.daySchedule(db, st.group, A.isoDate(A.addDays(A.parseDate(today), 1)));
  const week = S.rangeSchedule(db, st.group, today, 7);
  const deadlines = S.deadlinesFor(db, userId, st.group).filter((d) => !d.done && new Date(d.due_at) > Date.now()).slice(0, 6);
  const requests = db.prepare('SELECT title, status, eta FROM requests WHERE student_id = ? ORDER BY created_at DESC LIMIT 6').all(userId);
  return { st, g, todayS, tomorrow, week, deadlines, requests };
}

const fmtLesson = (l) => `${l.pair} пара ${l.start}–${l.end}: ${l.subject} (${l.kind.toLowerCase()}), ${l.room}, ${l.teacher}${l.change ? ` [изменение: ${l.change.type === 'cancel' ? 'ОТМЕНА' : l.change.type === 'room' ? 'новая аудитория, было ' + l.change.old_room : l.change.type === 'teacher' ? 'замена преподавателя' : l.change.type === 'extra' ? 'дополнительное занятие' : 'перенос'}]` : ''}`;
const ruDay = (iso) => new Date(iso).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

// Сводка для модели: БЕЗ ФИО, контактов, номера зачётки — только то, что нужно для ответа
function contextText(c) {
  const { st, g } = c;
  return [
    `Студент: ${st.course} курс, группа ${st.group}, ${st.program}, ${st.funding.toLowerCase()}, текущий семестр ${g.semester}. Стипендия: ${st.stipend}.`,
    `Сегодня (${ruDay(c.todayS.date)}, ${c.todayS.week}-я неделя, ${c.todayS.parity === 'odd' ? 'нечётная' : 'чётная'}): ${c.todayS.lessons.length ? c.todayS.lessons.map(fmtLesson).join('; ') : 'пар нет'}.`,
    `Неделя: ${c.week.slice(1).map((d) => `${ruDay(d.date)} — ${d.lessons.length ? d.lessons.map(fmtLesson).join('; ') : 'пар нет'}`).join(' | ')}.`,
    `Текущая успеваемость: ${g.current.map((x) => `${x.name} — ${x.earned}/${x.max_so_far} баллов (из ${x.sem_max} в семестре), ${x.control_label.toLowerCase()}, статус: ${x.label}`).join('; ')}.`,
    `Средний балл за прошлые сессии: ${g.summary.gpa ?? 'сессий ещё не было'}. Долги: ${g.debts.length ? g.debts.map((d) => d.name).join(', ') : 'нет'}. Прогноз стипендии: ${g.summary.stipend.title} — ${g.summary.stipend.text}`,
    `Сессия: ${g.session.name} ${g.session.start}…${g.session.end}. Экзамены/зачёты: ${g.session.exams.map((e) => `${e.name} ${e.date.replace('T', ' ')} ${e.room}`).join('; ')}.`,
    `Дедлайны: ${c.deadlines.length ? c.deadlines.map((d) => `${d.title} (${d.discipline}) до ${d.due_at.replace('T', ' ').slice(0, 16)}`).join('; ') : 'нет'}.`,
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
    answer = `Сейчас: ${c.st.stipend}. Прогноз на следующий семестр — «${c.g.summary.stipend.title}». ${c.g.summary.stipend.text}`;
    actions.push(ACTIONS.stipend_cert);
  } else if (has('долг', 'пересда', 'хвост')) {
    answer = c.g.debts.length ? `У вас ${c.g.debts.length === 1 ? 'одна задолженность' : 'задолженности'}: ${c.g.debts.map((d) => `«${d.name}» (${d.semester} семестр)`).join(', ')}. Подайте заявление на пересдачу — деканат согласует дату с преподавателем за 3 рабочих дня. Пересдач может быть не больше двух, вторая — комиссии.` : 'Задолженностей нет 🎉 Если понадобится пересдача для повышения оценки, заявление тоже можно подать онлайн.';
    actions.push(ACTIONS.retake);
  } else if (has('допуск', 'балл', 'успева', 'оценк', 'экзамен', 'сесси', 'автомат', 'зачёт', 'зачет')) {
    const risk = c.g.current.filter((x) => x.status !== 'ok');
    answer = `Коротко по семестру:\n${c.g.current.map((x) => `• ${x.name}: ${x.earned} из ${x.max_so_far} возможных, ${x.label.toLowerCase()}`).join('\n')}`;
    answer += risk.length ? `\n\nОбратите внимание на: ${risk.map((x) => x.name).join(', ')}.` : '\n\nВсё в графике — так держать!';
    const ex = c.g.session.exams.find((e) => e.control_label === 'Экзамен');
    if (ex) answer += `\nПервый экзамен — ${ex.name}, ${new Date(ex.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.`;
    actions.push({ label: 'Открыть успеваемость', href: '#/grades' });
  } else if (has('дедлайн', 'сдать', 'задани', 'домашк', 'лаб')) {
    answer = c.deadlines.length ? `Ближайшие дедлайны:\n${c.deadlines.map((d) => `• ${d.title} — ${d.discipline}, до ${new Date(d.due_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`).join('\n')}` : 'Открытых дедлайнов нет.';
    actions.push({ label: 'Все дедлайны', href: '#/today' });
  } else if (has('военкомат')) {
    answer = 'Справка в военкомат оформляется по форме приложения № 2, только бумажная. Срок — 3 рабочих дня, забрать в А-112.';
    actions.push(ACTIONS.military);
  } else if (has('выписк', 'зачётк', 'зачетк')) {
    answer = 'Выписку из зачётной книжки можно получить онлайн: на русском — сразу, электронный документ с QR-кодом; на английском — за 5 рабочих дней.';
    actions.push(ACTIONS.transcript);
  } else if (has('справк')) {
    answer = 'Справку об обучении можно получить прямо сейчас: электронная с QR-кодом формируется мгновенно и принимается там, где можно проверить подлинность онлайн. Бумажная с печатью — за 2 рабочих дня.';
    actions.push(ACTIONS.study_cert);
  } else if (has('академ', 'отпуск')) {
    answer = 'Академический отпуск даётся до 2 лет по медицинским, семейным основаниям или в связи с призывом. Заявление подаётся онлайн, к нему нужны подтверждающие документы. Рассмотрение — до 10 рабочих дней.';
    actions.push(ACTIONS.academic_leave);
  } else if (has('матпом', 'материальн', 'деньг')) {
    answer = 'Материальную помощь рассматривает стипендиальная комиссия раз в две недели. Опишите ситуацию в заявлении — подтверждающие документы можно приложить позже в переписке.';
    actions.push(ACTIONS.financial_aid);
  } else if (has('болел', 'болезн', 'пропуск', 'пропустил')) {
    answer = 'Если вы болели, принесите справку из поликлиники в деканат (А-112) в течение 3 дней после выздоровления. Пропущенные контрольные точки согласуйте с преподавателем.';
    actions.push(ACTIONS.appointment);
  } else if (has('график', 'работа', 'свободн')) {
    answer = 'Индивидуальный график (свободное посещение) дают работающим по специальности, спортсменам и по семейным обстоятельствам. Понадобится справка, подтверждающая основание.';
    actions.push(ACTIONS.individual_plan);
  } else if (has('деканат', 'приём', 'прием', 'кабинет', 'часы работы', 'где находится')) {
    answer = 'Деканат: корпус А, кабинет А-112. Приём пн–пт 10:00–17:00, обед 13:00–14:00. Запишитесь онлайн — и не придётся стоять в очереди.';
    actions.push(ACTIONS.appointment);
  } else if (has('привет', 'здравств', 'добрый')) {
    answer = `Привет, ${c.st.first_name}! Я помогу разобраться с расписанием, баллами, справками и заявлениями. Спросите, например: «Что у меня завтра?» или «Как дела с допуском?»`;
  } else {
    answer = 'Пока не знаю точного ответа на этот вопрос. Задайте его сотрудникам деканата — ответ придёт в переписку по обращению.';
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
