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
  const code = doc.text.match(/D-[A-Z0-9]{4}-[A-Z0-9]{4}/)[0];
  const v = await call(`/verify/${code}`);
  assert.match(v.text, /Документ подлинный/);
  assert.ok(!v.text.includes('Ветрова'), 'на странице проверки ФИО скрыто');
  assert.match((await call('/verify/D-AAAA-BBBB')).text, /не найден/);
});

test('сценарий: проверка формы и работа деканата со статусом', async () => {
  const timur = await login('timur');
  const bad = await call('/api/requests', { method: 'POST', cookie: timur, body: { type: 'military', fields: {} } });
  assert.equal(bad.status, 422); assert.ok(bad.json.fields.office);
  const ok = await call('/api/requests', { method: 'POST', cookie: timur, body: { type: 'military', fields: { office: 'Центральный район', extra: '<script>' } } });
  assert.equal(ok.status, 201); assert.equal(ok.json.status, 'submitted');
  const created = (await call(`/api/requests/${ok.json.id}`, { cookie: timur })).json;
  assert.deepEqual(Object.keys(created.payload), ['office'], 'лишние поля отбрасываются');

  const staff = await login('dekanat');
  assert.equal((await call(`/api/staff/requests/${ok.json.id}/status`, { method: 'POST', cookie: staff, body: { status: 'rejected' } })).status, 400, 'отказ без причины запрещён');
  assert.equal((await call(`/api/staff/requests/${ok.json.id}/status`, { method: 'POST', cookie: staff, body: { status: 'ready', comment: 'Заберите в А-112' } })).status, 200);
  const after = (await call(`/api/requests/${ok.json.id}`, { cookie: timur })).json;
  assert.equal(after.status, 'ready');
  const notes = (await call('/api/notifications', { cookie: timur })).json;
  assert.ok(notes.some((n) => n.title.includes('Справка в военкомат')));
  const anna = await login('anna');
  assert.ok(!(await call('/api/notifications', { cookie: anna })).json.some((n) => n.title.includes('Справка в военкомат')), 'уведомление Тимура не видно Анне');
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
