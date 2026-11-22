// Проверки безопасности и основных сценариев: node --test
const test = require('node:test');
const assert = require('node:assert');
const { createApp, initDb } = require('../server/index');
const { DEMO_ACCOUNTS } = require('../server/seed');

let server, base, db;
test.before(async () => {
  db = initDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const pwd = (login) => DEMO_ACCOUNTS.find((a) => a.login === login).password;
async function call(path, { method = 'GET', body, cookie, csrf = true } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-Orbita': '1' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}
async function login(name) {
  const r = await call('/api/auth/login', { method: 'POST', body: { login: name, password: pwd(name) } });
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  return sc.split(';')[0];
}

test('пароли хранятся только в виде scrypt-хеша', () => {
  for (const u of db.prepare('SELECT login, password_hash FROM users').all()) {
    assert.match(u.password_hash, /^scrypt\$/);
    assert.ok(!u.password_hash.includes(pwd(u.login)));
  }
});

test('персональные данные в базе зашифрованы', () => {
  const raw = JSON.stringify(db.prepare('SELECT * FROM students').all());
  assert.ok(!raw.includes('+7 900'));
  assert.ok(!raw.includes('@student.gorizont'));
  assert.ok(!raw.includes('25-ПИ-0417'));
});

test('токен сессии в базе хранится как хеш', async () => {
  const c = await login('nika');
  const token = c.split('=')[1];
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash = ?').get(token).n, 0);
});

test('без входа данные недоступны', async () => {
  for (const p of ['/api/dashboard', '/api/grades', '/api/requests', '/api/schedule', '/api/notifications']) {
    assert.equal((await call(p)).status, 401, p);
  }
});

test('изменяющие запросы без заголовка X-Orbita отклоняются (CSRF)', async () => {
  const r = await call('/api/auth/login', { method: 'POST', body: { login: 'anna', password: pwd('anna') }, csrf: false });
  assert.equal(r.status, 403);
});

test('студент видит только свои данные и не открывает чужую заявку', async () => {
  const anna = await login('anna');
  const nika = await login('nika');
  const annaReqs = (await call('/api/requests', { cookie: anna })).json;
  assert.ok(annaReqs.length > 0);
  const nikaReqs = (await call('/api/requests', { cookie: nika })).json;
  assert.equal(nikaReqs.length, 0, 'у Ники нет заявок — она не видит заявки Анны');

  const foreign = annaReqs[0].id;
  assert.equal((await call(`/api/requests/${foreign}`, { cookie: nika })).status, 404);
  assert.equal((await call(`/api/requests/${foreign}/messages`, { method: 'POST', cookie: nika, body: { text: 'hi' } })).status, 404);
  assert.equal((await call(`/api/requests/${foreign}/cancel`, { method: 'POST', cookie: nika })).status, 404);
  const withDoc = annaReqs.find((r) => r.has_document);
  assert.equal((await call(`/api/requests/${withDoc.id}/document`, { cookie: nika })).status, 404);
  assert.equal((await call(`/api/requests/${withDoc.id}/document`, { cookie: anna })).status, 200);

  const meA = (await call('/api/auth/me', { cookie: anna })).json.user;
  const meN = (await call('/api/auth/me', { cookie: nika })).json.user;
  assert.notEqual(meA.group, meN.group);
  // Параметры в адресе не позволяют подменить пользователя
  const g = await call('/api/grades?student_id=' + meA.id, { cookie: nika });
  assert.deepEqual(Object.keys(g.json.semesters), []);
});

test('студент не может пользоваться функциями деканата', async () => {
  const anna = await login('anna');
  assert.equal((await call('/api/staff/requests', { cookie: anna })).status, 403);
  assert.equal((await call('/api/staff/notifications', { method: 'POST', cookie: anna, body: { audience: 'all', title: 'x', body: 'y' } })).status, 403);
});

test('сценарий: электронная справка готова сразу и проверяется по QR', async () => {
  const anna = await login('anna');
  const r = await call('/api/requests', { method: 'POST', cookie: anna, body: { type: 'study_cert', fields: { purpose: 'По месту требования', format: 'electronic' } } });
  assert.equal(r.status, 201); assert.equal(r.json.status, 'ready');
  const doc = await call(`/api/requests/${r.json.id}/document`, { cookie: anna });
  assert.equal(doc.status, 200); assert.match(doc.headers.get('content-type'), /application\/pdf/);
  const code = doc.headers.get('content-disposition').match(/D-[A-Z0-9]{4}-[A-Z0-9]{4}/)[0];
  const v = await call(`/verify/${code}`);
  assert.match(v.text, /Документ подлинный/);
  assert.ok(!v.text.includes('Ветрова'), 'на странице проверки ФИО скрыто');
  assert.match((await call('/verify/D-AAAA-BBBB')).text, /не найден/);
});

test('сценарий: проверка формы и работа деканата со статусом', async () => {
  const timur = await login('timur');
  const bad = await call('/api/requests', { method: 'POST', cookie: timur, body: { type: 'stipend_cert', fields: {} } });
  assert.equal(bad.status, 422); assert.ok(bad.json.fields.period);
  const ok = await call('/api/requests', { method: 'POST', cookie: timur, body: { type: 'stipend_cert', fields: { period: '3 месяца', purpose: 'Другое', extra: '<script>' } } });
  assert.equal(ok.status, 201); assert.equal(ok.json.status, 'submitted');
  const created = (await call(`/api/requests/${ok.json.id}`, { cookie: timur })).json;
  assert.deepEqual(Object.keys(created.payload).sort(), ['period', 'purpose'], 'лишние поля отбрасываются');

  const staff = await login('dekanat');
  assert.equal((await call(`/api/staff/requests/${ok.json.id}/status`, { method: 'POST', cookie: staff, body: { status: 'rejected' } })).status, 400, 'отказ без причины запрещен');
  assert.equal((await call(`/api/staff/requests/${ok.json.id}/status`, { method: 'POST', cookie: staff, body: { status: 'ready', comment: 'Заберите в А-112' } })).status, 200);
  const after = (await call(`/api/requests/${ok.json.id}`, { cookie: timur })).json;
  assert.equal(after.status, 'ready');
  const notes = (await call('/api/notifications', { cookie: timur })).json;
  assert.ok(notes.some((n) => n.title.includes('Справка о размере стипендии')));
  const anna = await login('anna');
  assert.ok(!(await call('/api/notifications', { cookie: anna })).json.some((n) => n.title.includes('Справка о размере стипендии')), 'уведомление Тимура не видно Анне');
});

test('посещаемость и СКУД: студент видит только свое, деканат — всех', async () => {
  const anna = await login('anna');
  const timur = await login('timur');
  const a = (await call('/api/attendance', { cookie: anna })).json;
  const t = (await call('/api/attendance', { cookie: timur })).json;
  assert.ok(a.absences.hours < t.absences.hours, 'у Тимура пропусков больше');
  assert.equal(a.absences.limits.warning, 30); assert.equal(a.absences.limits.expulsion, 60);
  assert.equal(a.absences.hours % 2, 0, 'пара = 2 академических часа');
  assert.equal(t.retakes.length, 1, 'у Тимура назначена пересдача');
  assert.equal(a.retakes.length, 0);
  // пересдача видна в расписании Тимура и не видна Анне
  const sched = (await call(`/api/schedule?from=${t.retakes[0].date}&days=1`, { cookie: timur })).json;
  assert.ok(sched.days[0].lessons.some((l) => l.change?.type === 'retake'));
  assert.equal((await call('/api/staff/students', { cookie: anna })).status, 403);
  const staff = await login('dekanat');
  const list = (await call('/api/staff/students', { cookie: staff })).json;
  assert.equal(list.length, 3);
  const me = list.find((x) => x.name.startsWith('Ветрова'));
  const det = await call(`/api/staff/students/${me.id}/attendance`, { cookie: staff });
  assert.equal(det.status, 200); assert.ok(Array.isArray(det.json.campus.days));
  // назначение пересдачи деканатом приходит студенту уведомлением
  const r = await call('/api/staff/retakes', { method: 'POST', cookie: staff, body: { student_id: me.id, discipline: 'Базы данных', date: t.retakes[0].date, pair: 6, room: 'Б-318', examiner: 'Мирская Е. В.' } });
  assert.equal(r.status, 201);
  assert.ok((await call('/api/notifications', { cookie: anna })).json.some((n) => n.title === 'Назначена пересдача'));
  assert.equal((await call('/api/staff/retakes', { method: 'POST', cookie: anna, body: {} })).status, 403);
});

test('услуги: обычной пересдачи нет, есть ректорская', async () => {
  const timur = await login('timur');
  const types = (await call('/api/request-types', { cookie: timur })).json.map((x) => x.id);
  assert.ok(!types.includes('retake')); assert.ok(types.includes('rector_retake'));
});

test('облегченная версия: вход формой, только свои данные, защита форм', async () => {
  const form = (body, headers = {}) => fetch(base + '/lite/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(body) });
  const evil = await form({ login: 'anna', password: pwd('anna') }, { Origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  const bad = await form({ login: 'anna', password: 'nope' });
  assert.equal(bad.status, 401);
  const ok = await form({ login: 'anna', password: pwd('anna') });
  assert.equal(ok.status, 303);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  const home = await call('/lite', { cookie });
  assert.match(home.text, /Здравствуйте, Анна/);
  assert.ok(!/<script/i.test(home.text), 'без скриптов');
  const timur = await login('timur');
  const foreign = (await call('/api/requests', { cookie: timur })).json[0].id;
  assert.equal((await call(`/lite/requests/${foreign}`, { cookie })).status, 404);
  assert.match((await call('/lite')).text, /Вход/);
});

test('шкала оценок: проценты и ECTS', () => {
  const A = require('../server/academic');
  assert.deepEqual([95, 85, 78, 70, 62, 40].map((p) => A.markFor(p).ects), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(A.markFor(82).mark, 'хорошо'); assert.equal(A.markFor(67).mark, 'удовлетворительно'); assert.equal(A.markFor(59).mark, 'неудовлетворительно');
  assert.equal(A.pairsFor('2УП-05')[3][0], '12:10'); assert.equal(A.pairsFor('3МЭО-01')[3][0], '12:55');
});

test('деканат ставит пару в любое время, пересечение с парами отклоняется', async () => {
  const staff = await login('dekanat');
  const A = require('../server/academic');
  let d = new Date(); let day;
  for (let i = 0; i < 7; i++) { day = (await call(`/api/staff/schedule?group=2УП-05&date=${A.isoDate(d)}`, { cookie: staff })).json; if (day.lessons.length >= 2) break; d = A.addDays(d, 1); }
  const [l1, l2] = day.lessons;
  const body = { type: 'extra', group: '2УП-05', date: day.date, subject: 'Консультация', kind: 'Консультация', room: '4138 (Корпус МО)' };
  const clash = await call('/api/staff/schedule-changes', { method: 'POST', cookie: staff, body: { ...body, start: l1.start, end: l2.end } });
  assert.equal(clash.status, 409); assert.equal(clash.json.conflicts.length, 2);
  const ok = await call('/api/staff/schedule-changes', { method: 'POST', cookie: staff, body: { ...body, start: '20:00', end: '21:00' } });
  assert.equal(ok.status, 201);
  const anna = await login('anna');
  const sched = (await call(`/api/schedule?from=${day.date}&days=1`, { cookie: anna })).json.days[0];
  assert.ok(sched.lessons.some((l) => l.start === '20:00' && l.change?.type === 'extra'));
});

test('мероприятия: добавление в календарь с предупреждением о пересечении', async () => {
  const anna = await login('anna');
  const feed = (await call('/api/notifications', { cookie: anna })).json.filter((n) => n.event_id);
  assert.ok(feed.length >= 2);
  const conf = feed.find((n) => n.title.startsWith('Научная'));
  const first = await call(`/api/events/${conf.event_id}/add`, { method: 'POST', cookie: anna, body: {} });
  assert.equal(first.status, 409); assert.ok(first.json.conflicts.length >= 1);
  assert.equal((await call(`/api/events/${conf.event_id}/add`, { method: 'POST', cookie: anna, body: { force: true } })).status, 200);
  const ev = (await call(`/api/events/${conf.event_id}`, { cookie: anna })).json;
  const day = (await call(`/api/schedule?from=${ev.start_at.slice(0, 10)}&days=1`, { cookie: anna })).json.days[0];
  assert.ok(day.lessons.some((l) => l.event_id === conf.event_id), 'мероприятие в расписании');
  // мероприятие факультета МЖ не видно студентке ФУП
  const timur = await login('timur');
  const mz = (await call('/api/notifications', { cookie: timur })).json.find((n) => n.event_id && n.title.startsWith('Мастер-класс'));
  assert.ok(mz); assert.equal((await call(`/api/events/${mz.event_id}`, { cookie: anna })).status, 404);
});

test('преподаватель: посещаемость, задания, перенос через деканат', async () => {
  const teacher = await login('teacher');
  const anna = await login('anna');
  assert.equal((await call('/api/teacher/schedule', { cookie: anna })).status, 403);
  const A = require('../server/academic');
  let found = null;
  for (let i = -6; i <= 0 && !found; i++) {
    const days = (await call(`/api/teacher/schedule?from=${A.isoDate(A.addDays(new Date(), i))}`, { cookie: teacher })).json.days;
    for (const d of days) { const l = d.lessons.find((x) => x.group === '2УП-05'); if (l && d.date <= A.isoDate(new Date())) { found = { ...l, date: d.date }; break; } }
  }
  assert.ok(found, 'есть прошедшая пара');
  const body = { group: '2УП-05', date: found.date, start: found.start };
  const before = (await call('/api/attendance', { cookie: anna })).json.absences.hours;
  const me = (await call('/api/auth/me', { cookie: anna })).json.user;
  assert.equal((await call('/api/teacher/attendance', { method: 'POST', cookie: teacher, body: { ...body, absent: [me.id] } })).status, 200);
  assert.equal((await call('/api/attendance', { cookie: anna })).json.absences.hours, before + 2);
  assert.equal((await call('/api/teacher/attendance', { method: 'POST', cookie: teacher, body: { ...body, group: '2МЖ-05', absent: [] } })).status, 404, 'чужая пара');
  // задание к паре появляется у студентки в дедлайнах и в карточке пары
  assert.equal((await call('/api/teacher/assignments', { method: 'POST', cookie: teacher, body: { ...body, title: 'Тестовое задание', due_date: A.isoDate(A.addDays(new Date(), 5)), due_time: '18:00' } })).status, 201);
  const dl = (await call('/api/deadlines', { cookie: anna })).json.find((d) => d.title === 'Тестовое задание');
  assert.equal(dl.lesson_date, found.date);
  assert.equal(dl.due_kind, 'date');
  // задание «к следующей паре»: срок равен началу следующей пары по дисциплине
  assert.equal((await call('/api/teacher/assignments', { method: 'POST', cookie: teacher, body: { ...body, title: 'К следующей паре', due_mode: 'next' } })).status, 201);
  const nx = (await call('/api/deadlines', { cookie: anna })).json.find((d) => d.title === 'К следующей паре');
  assert.equal(nx.due_kind, 'next_lesson');
  const nextLesson = (await call(`/api/lesson?date=${nx.due_at.slice(0, 10)}&start=${nx.due_at.slice(11, 16)}`, { cookie: anna })).json;
  assert.ok(nextLesson.due.some((t) => t.title === 'К следующей паре'), 'видно в карточке следующей пары');
  const lesson = (await call(`/api/lesson?date=${found.date}&start=${found.start}`, { cookie: anna })).json;
  assert.ok(lesson.tasks.some((t) => t.title === 'Тестовое задание'));
  // перенос: деканат одобряет, у группы появляется изменение
  const staff = await login('dekanat');
  const pending = (await call('/api/staff/reschedules', { cookie: staff })).json.find((x) => x.status === 'pending');
  assert.ok(pending);
  assert.equal((await call(`/api/staff/reschedules/${pending.id}`, { method: 'POST', cookie: staff, body: { decision: 'reject' } })).status, 400, 'отказ без причины');
  assert.equal((await call(`/api/staff/reschedules/${pending.id}`, { method: 'POST', cookie: staff, body: { decision: 'approve' } })).status, 200);
  const timur = await login('timur');
  const moved = (await call(`/api/schedule?from=${pending.to_date}&days=1`, { cookie: timur })).json.days[0].lessons.find((l) => l.change?.type === 'moved_in');
  assert.equal(moved.start, pending.to_start);
  assert.ok((await call('/api/notifications', { cookie: teacher })).json.some((n) => n.title === 'Заявка на перенос одобрена'));
});

test('типовое заявление в PDF только по своей заявке', async () => {
  const timur = await login('timur');
  const anna = await login('anna');
  const req = (await call('/api/requests', { cookie: timur })).json.find((r) => r.type === 'academic_leave');
  const res = await fetch(`${base}/api/statements/academic_leave.pdf?request=${req.id}`, { headers: { Cookie: timur } });
  assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal((await call(`/api/statements/academic_leave.pdf?request=${req.id}`, { cookie: anna })).status, 404);
  assert.equal((await call('/api/statements/study_cert.pdf', { cookie: anna })).status, 404);
});

test('облегченная версия: заявки студента, решение деканата, отметка преподавателя', async () => {
  const form = (path, cookie, body, headers = {}) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, ...headers }, body: new URLSearchParams(body) });
  const nika = await login('nika');
  const created = await form('/lite/requests/new/question', nika, { topic: 'Пропуск по болезни', text: 'Куда принести справку?' });
  assert.equal(created.status, 303);
  const loc = created.headers.get('location');
  assert.match(loc, /^\/lite\/requests\/Z-/);
  const pid = loc.split('/')[3].split('?')[0];
  const bad = await form('/lite/requests/new/question', nika, { topic: '' });
  assert.equal(bad.status, 200); assert.match(await bad.text(), /Заполните поле/);
  // деканат: запрос уточнения без комментария отклоняется, с комментарием — проходит
  const staff = await login('dekanat');
  const noComment = await form(`/lite/staff/requests/${pid}/status`, staff, { status: 'need_info', comment: '' });
  assert.match(noComment.headers.get('location'), /err=/);
  const ok = await form(`/lite/staff/requests/${pid}/status`, staff, { status: 'need_info', comment: 'Уточните даты болезни' });
  assert.match(ok.headers.get('location'), /ok=/);
  assert.equal((await call(`/api/requests/${pid}`, { cookie: nika })).json.status, 'need_info');
  // ответ студента возвращает заявку в работу
  await form(`/lite/requests/${pid}/message`, nika, { text: 'С 10 по 14 ноября' });
  assert.equal((await call(`/api/requests/${pid}`, { cookie: nika })).json.status, 'in_progress');
  // студент не может пользоваться формами деканата, чужой сайт не может отправить форму
  assert.equal((await form(`/lite/staff/requests/${pid}/status`, nika, { status: 'done' })).status, 303);
  assert.equal((await call(`/api/requests/${pid}`, { cookie: nika })).json.status, 'in_progress');
  assert.equal((await form(`/lite/requests/${pid}/cancel`, nika, {}, { Origin: 'https://evil.example' })).status, 403);
  // преподаватель видит свои пары в облегченной версии
  const teacher = await login('teacher');
  assert.match((await call('/lite', { cookie: teacher })).text, /Мои пары/);
});

test('выход завершает сессию', async () => {
  const c = await login('nika');
  await call('/api/auth/logout', { method: 'POST', cookie: c });
  assert.equal((await call('/api/dashboard', { cookie: c })).status, 401);
});

test('заголовки безопасности на месте', async () => {
  const r = await call('/');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

// Последним — блокирует логин nika до конца прогона
test('неверный пароль и блокировка после 5 попыток', async () => {
  // Ответ одинаковый для существующего и несуществующего логина
  const ghost = await call('/api/auth/login', { method: 'POST', body: { login: 'no-such-user', password: 'x' } });
  assert.equal(ghost.json.error, 'Неверный логин или пароль');
  for (let i = 0; i < 5; i++) {
    const r = await call('/api/auth/login', { method: 'POST', body: { login: 'nika', password: 'wrong-' + i } });
    assert.equal(r.status, 401);
    assert.equal(r.json.error, 'Неверный логин или пароль');
  }
  // Даже верный пароль не принимается, пока действует блокировка
  const r = await call('/api/auth/login', { method: 'POST', body: { login: 'nika', password: pwd('nika') } });
  assert.equal(r.status, 429);
});
