// Заявки и справки: проверка формы по схеме каталога, статусы, переписка.
const A = require('./academic');
const { TYPES, STATUS } = require('./catalog');
const { publicId } = require('./security');
const S = require('./services');

const nowIso = () => new Date().toISOString();

// Свободные окна приема в деканате: ближайшие 5 рабочих дней, 10:00–16:30, кроме обеда
function appointmentSlots(db) {
  const taken = new Set(db.prepare("SELECT payload FROM requests WHERE type = 'appointment' AND status NOT IN ('rejected','done')").all().map((r) => JSON.parse(r.payload).slot));
  const days = [];
  let d = A.addDays(new Date(), 1);
  while (days.length < 5) {
    if (A.weekday(d) <= 5) {
      const date = A.isoDate(d);
      const times = [];
      for (let m = 10 * 60; m <= 16 * 60 + 30; m += 30) {
        if (m >= 13 * 60 && m < 14 * 60) continue;
        const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        // Часть окон «занята» другими студентами — детерминированно
        const busy = taken.has(`${date}T${t}`) || ((d.getDate() * 7 + m / 30) % 5 === 0);
        times.push({ time: t, free: !busy });
      }
      days.push({ date, times });
    }
    d = A.addDays(d, 1);
  }
  return days;
}

function disciplineOptions(db, userId) {
  const g = S.gradesOverview(db, userId);
  return [...g.debts.map((d) => `${d.name} (задолженность, ${d.semester} сем.)`), ...g.current.map((c) => c.name)];
}

function catalogFor(db, userId) {
  return Object.entries(TYPES).map(([id, t]) => {
    const fields = t.fields.map((f) => {
      if (f.type === 'discipline') return { ...f, type: 'select', options: disciplineOptions(db, userId) };
      if (f.type === 'slot') return { ...f, slots: appointmentSlots(db) };
      return f;
    });
    return { id, title: t.title, group: t.group, icon: t.icon, popular: Boolean(t.popular), description: t.description, sla_days: t.sla_days, instant: Boolean(t.instant), instant_if: t.instant_if || null, fields };
  });
}

// Проверка ввода строго по схеме: лишние поля отбрасываются
function validate(type, body, db, userId) {
  const t = TYPES[type];
  const errors = {};
  const clean = {};
  const catalog = catalogFor(db, userId).find((c) => c.id === type);
  for (const f of catalog.fields) {
    if (f.showIf && Object.entries(f.showIf).some(([k, v]) => body[k] !== v)) continue;
    let v = body[f.name];
    if (v === undefined || v === null || v === '') v = f.default;
    if ((v === undefined || v === '') && f.required) { errors[f.name] = 'Заполните поле'; continue; }
    if (v === undefined || v === '') continue;
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < f.min || n > f.max) { errors[f.name] = `Число от ${f.min} до ${f.max}`; continue; }
      clean[f.name] = n; continue;
    }
    v = String(v).trim();
    if (f.type === 'select' && !f.options.includes(v)) { errors[f.name] = 'Выберите вариант из списка'; continue; }
    if (f.type === 'segmented' && !f.options.some((o) => o.value === v)) { errors[f.name] = 'Выберите вариант'; continue; }
    if (f.type === 'date') {
      const d = A.parseDate(v);
      if (!d || d < A.addDays(new Date(), -1)) { errors[f.name] = 'Укажите дату не раньше сегодняшней'; continue; }
    }
    if (f.type === 'slot') {
      const ok = f.slots.some((day) => day.times.some((tm) => tm.free && `${day.date}T${tm.time}` === v));
      if (!ok) { errors[f.name] = 'Это время уже занято — выберите другое'; continue; }
    }
    if ((f.type === 'text' || f.type === 'textarea') && v.length > (f.maxLength || 500)) { errors[f.name] = `Не длиннее ${f.maxLength} символов`; continue; }
    clean[f.name] = v;
  }
  return { errors, clean, t };
}

function addDaysWorking(n) {
  let d = new Date(); let left = n;
  while (left > 0) { d = A.addDays(d, 1); if (A.weekday(d) <= 5) left--; }
  return A.isoDate(d);
}

function serialize(r, events) {
  const t = TYPES[r.type];
  return {
    id: r.public_id, type: r.type, title: r.title, status: r.status, status_label: STATUS[r.status],
    payload: JSON.parse(r.payload), created_at: r.created_at, updated_at: r.updated_at, eta: r.eta, assignee: r.assignee,
    has_document: Boolean(r.doc_code && t?.document && ['ready', 'done'].includes(r.status)), rating: r.rating,
    events: events?.map((e) => ({ kind: e.kind, status: e.status, status_label: e.status ? STATUS[e.status] : null, author_role: e.author_role, author_name: e.author_name, text: e.text, created_at: e.created_at })),
  };
}

function createRequest(db, user, type, body) {
  if (!TYPES[type]) return { status: 400, body: { error: 'Неизвестный тип заявки' } };
  const { errors, clean, t } = validate(type, body || {}, db, user.id);
  if (Object.keys(errors).length) return { status: 422, body: { error: 'Проверьте поля формы', fields: errors } };
  // Защита от случайных дублей: та же заявка, еще не закрытая, в течение 2 минут
  const dup = db.prepare("SELECT public_id FROM requests WHERE student_id = ? AND type = ? AND payload = ? AND created_at > ?").get(user.id, type, JSON.stringify(clean), new Date(Date.now() - 120e3).toISOString());
  if (dup) return { status: 200, body: { id: dup.public_id, duplicate: true } };

  const instant = t.instant || (t.instant_if && Object.entries(t.instant_if).every(([k, v]) => clean[k] === v));
  const status = instant ? 'ready' : 'submitted';
  const now = nowIso();
  const pid = publicId('Z');
  const docCode = instant && t.document ? publicId('D') : null;
  let title = t.title;
  if (type === 'appointment') title = `Прием в деканате · ${clean.slot.slice(8, 10)}.${clean.slot.slice(5, 7)} в ${clean.slot.slice(11)}`;
  const r = db.prepare('INSERT INTO requests (public_id, student_id, type, title, payload, status, created_at, updated_at, eta, doc_code) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(pid, user.id, type, title, JSON.stringify(clean), status, now, now, instant ? null : addDaysWorking(Math.max(1, t.sla_days)), docCode);
  const ev = db.prepare('INSERT INTO request_events (request_id, kind, status, author_role, author_name, text, created_at) VALUES (?,?,?,?,?,?,?)');
  ev.run(r.lastInsertRowid, 'status', 'submitted', 'student', null, clean.comment || clean.text || null, now);
  if (instant) {
    const text = type === 'appointment'
      ? `Вы записаны на ${clean.slot.slice(8, 10)}.${clean.slot.slice(5, 7)} в ${clean.slot.slice(11)}. Кабинет А-112, возьмите студенческий билет.`
      : 'Документ сформирован автоматически и подписан электронной подписью деканата. Подлинность проверяется по QR-коду.';
    ev.run(r.lastInsertRowid, 'status', 'ready', 'system', 'Орбита', text, now);
  }
  return { status: 201, body: { id: pid, status } };
}

function notifyStudent(db, studentId, title, body, link) {
  db.prepare("INSERT INTO notifications (audience, category, title, body, link, important, author, created_at) VALUES (?, 'request', ?, ?, ?, 1, 'Деканат', ?)")
    .run(`user:${studentId}`, title, body, link, nowIso());
}

module.exports = { catalogFor, createRequest, serialize, notifyStudent, appointmentSlots, STATUS };
