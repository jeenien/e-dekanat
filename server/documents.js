// Электронные справки с QR-кодом и публичная страница проверки подлинности.
const QRCode = require('qrcode');
const S = require('./services');
const A = require('./academic');
const G = require('./grammar');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ruDate = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const PAGE_CSS = `
@font-face{font-family:Manrope;font-weight:400;src:url(/fonts/manrope-cyrillic-400-normal.woff2) format('woff2')}
@font-face{font-family:Manrope;font-weight:700;src:url(/fonts/manrope-cyrillic-700-normal.woff2) format('woff2')}
@font-face{font-family:Manrope;font-weight:800;src:url(/fonts/manrope-cyrillic-800-normal.woff2) format('woff2')}
*{box-sizing:border-box}body{margin:0;background:#eef0f6;font:15px/1.55 Manrope,system-ui,sans-serif;color:#141a2e}
.bar{max-width:820px;margin:16px auto;display:flex;gap:8px;justify-content:space-between;padding:0 16px;flex-wrap:wrap}
.bar a{color:#1f3a7a;font-weight:700;text-decoration:none}
.paper{position:relative;max-width:820px;margin:0 auto 32px;background:#fff;padding:56px 64px;border-radius:12px;box-shadow:0 10px 40px rgba(20,26,46,.08);overflow:hidden}
.wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:64px;font-weight:800;color:rgba(31,58,122,.06);transform:rotate(-24deg);text-align:center;line-height:1.1}
.head{display:flex;gap:14px;align-items:center;border-bottom:2px solid #141a2e;padding-bottom:16px;margin-bottom:28px}
.head b{font-size:17px;letter-spacing:.02em}.head small{display:block;color:#5b6276}
h1{text-align:center;font-size:22px;margin:8px 0 4px;letter-spacing:.06em}.num{text-align:center;color:#5b6276;margin-bottom:28px}
table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #d9dce6;padding:6px 8px;text-align:left;font-size:13px}th{background:#f4f5f9}
.sign{display:flex;justify-content:space-between;align-items:flex-end;margin-top:40px;gap:24px}
.qr{width:132px;text-align:center;font-size:11px;color:#5b6276}.qr svg{width:132px;height:132px}
.stamp{border:2px solid #4338ca;color:#1f3a7a;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;transform:rotate(-3deg);display:inline-block}
.note{margin-top:28px;font-size:12px;color:#8a5a00;background:#fff6e0;border-radius:8px;padding:10px 12px}
@media (max-width:640px){.paper{padding:28px 20px}.sign{flex-direction:column;align-items:flex-start}.wm{font-size:36px}}
@media print{body{background:#fff}.bar{display:none}.paper{box-shadow:none;margin:0;max-width:none}}
`;
const LOGO = `<svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="14" fill="#1f3a7a"/><ellipse cx="24" cy="24" rx="15" ry="7" fill="none" stroke="#fff" stroke-width="2.5" transform="rotate(-25 24 24)"/><circle cx="24" cy="24" r="5" fill="#fff"/><circle cx="37" cy="17" r="2.6" fill="#fff"/></svg>`;

// «Экономический факультет» → «экономического факультета»
function facultyGenitive(f) {
  const words = f.split(' ');
  const n = words.findIndex((w) => /^(факультет|институт)$/i.test(w));
  return words.map((w, i) => {
    if (i > n) return w; // «информационных технологий» уже в нужной форме
    const lw = w.toLowerCase();
    if (i === n) return lw + 'а';
    return lw.replace(/(ий|ый)$/, 'ого');
  }).join(' ');
}

async function renderDocument(db, req, request) {
  const st = S.getStudent(db, request.student_id);
  const origin = `${req.protocol}://${req.get('host')}`;
  const verifyUrl = `${origin}/verify/${request.doc_code}`;
  const qr = await QRCode.toString(verifyUrl, { type: 'svg', margin: 0, color: { dark: '#141a2e', light: '#ffffff' } });
  const payload = JSON.parse(request.payload);
  const fio = `${st.last_name} ${st.first_name} ${st.middle_name || ''}`.trim();
  let body;
  if (request.type === 'transcript') {
    const g = S.gradesOverview(db, request.student_id);
    const rows = Object.entries(g.semesters).flatMap(([sem, list]) => list.map((x) => `<tr><td>${esc(sem)}</td><td>${esc(x.name)}</td><td>${esc(x.control_label)}</td><td>${x.credits}</td><td>${esc(x.mark)}${x.points ? ` (${x.points}, ${x.ects})` : ''}</td></tr>`)).join('');
    body = `<h1>ВЫПИСКА ИЗ ЗАЧЕТНОЙ КНИЖКИ</h1><div class="num">№ ${esc(request.doc_code)} от ${ruDate(request.created_at)}</div>
      <p>${G.byGender(G.genderOf(st), 'Студент', 'Студентка')}: <b>${esc(fio)}</b>, ${st.course} курс, группа ${esc(st.group)}, направление ${esc(st.program_code)} «${esc(st.program)}», зачетная книжка № ${esc(st.record_book)}.</p>
      ${rows ? `<table><tr><th>Сем.</th><th>Дисциплина</th><th>Форма</th><th>З.е.</th><th>Оценка</th></tr>${rows}</table>` : '<p><i>Сессии еще не сдавались — оценок нет.</i></p>'}
      <p>Средний балл: <b>${g.summary.gpa ?? '—'}</b>. Освоено зачетных единиц: <b>${g.summary.credits}</b>.</p>`;
  } else {
    body = `<h1>СПРАВКА</h1><div class="num">№ ${esc(request.doc_code)} от ${ruDate(request.created_at)}</div>
      <p>Дана <b>${esc(G.fio(st, 'dat'))}</b>${st.birth_date ? `, ${new Date(st.birth_date).toLocaleDateString('ru-RU')} г. р.,` : ''} в том, что ${G.byGender(G.genderOf(st), 'он', 'она')} действительно является ${G.byGender(G.genderOf(st), 'студентом', 'студенткой')} ${st.course} курса
      ${{ 'Очная': 'очной', 'Заочная': 'заочной', 'Очно-заочная': 'очно-заочной' }[st.study_form] || st.study_form.toLowerCase()} формы обучения (${st.funding === 'Бюджет' ? 'за счет бюджетных ассигнований' : 'по договору об оказании платных образовательных услуг'})
      ${esc(facultyGenitive(st.faculty))}
      Университета «Горизонт» по направлению подготовки ${esc(st.program_code)} «${esc(st.program)}».</p>
      <p>Зачетная книжка № ${esc(st.record_book)}. Год поступления — ${st.enrolled_year}. Нормативный срок окончания обучения — 30 июня ${st.enrolled_year + 4} г.</p>
      <p>Справка выдана для предоставления: <b>${esc(payload.purpose || 'по месту требования')}</b>.</p>`;
  }
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Документ ${esc(request.doc_code)}</title><style>${PAGE_CSS}</style></head><body>
  <div class="bar"><a href="/#/requests/${esc(request.public_id)}">← Вернуться в кабинет</a><a href="#" id="print">Сохранить PDF / распечатать</a></div>
  <div class="paper"><div class="wm">ДЕМО-КОНЦЕПТ<br>не является документом</div>
    <div class="head">${LOGO}<div><b>УНИВЕРСИТЕТ «ГОРИЗОНТ»</b><small>вымышленный вуз · концепт «Орбита — цифровой деканат»</small></div></div>
    ${body}
    <div class="sign"><div><div>Начальник учебного отдела</div><div style="margin-top:6px"><span class="stamp">Подписано ЭП деканата<br>${new Date(request.updated_at).toLocaleString('ru-RU')}</span></div></div>
      <div class="qr">${qr}<div>Проверить подлинность:<br>${esc(request.doc_code)}</div></div></div>
    <div class="note">Это демонстрационный документ конкурсного прототипа. Университет и все данные вымышлены.</div>
  </div><script src="/js/print.js"></script></body></html>`;
}

function maskName(st) {
  return `${st.last_name[0]}${'*'.repeat(Math.max(2, st.last_name.length - 2))}${st.last_name.slice(-1)} ${st.first_name[0]}. ${st.middle_name ? st.middle_name[0] + '.' : ''}`;
}

function renderVerify(db, code) {
  const r = /^D-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) ? db.prepare("SELECT * FROM requests WHERE doc_code = ? AND status IN ('ready','done')").get(code) : null;
  let inner;
  if (r) {
    const st = S.getStudent(db, r.student_id);
    inner = `<div style="font-size:56px">✅</div><h1 style="letter-spacing:0">Документ подлинный</h1>
      <table><tr><th>Документ</th><td>${esc(r.title)}</td></tr><tr><th>Номер</th><td>${esc(r.doc_code)}</td></tr>
      <tr><th>Выдан</th><td>${ruDate(r.updated_at)}</td></tr><tr><th>Кому</th><td>${esc(maskName(st))}, ${st.course} курс</td></tr>
      <tr><th>Статус обучения</th><td>Обучается</td></tr></table>
      <p style="color:#5b6276;font-size:13px">Мы показываем минимум данных: ФИО скрыто частично, оценки и контакты не раскрываются.</p>`;
  } else {
    inner = `<div style="font-size:56px">⚠️</div><h1 style="letter-spacing:0">Документ не найден</h1><p>Проверьте номер. Если документ выдан недавно, обратитесь в деканат.</p>`;
  }
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Проверка документа</title><style>${PAGE_CSS}</style></head><body>
  <div class="paper" style="margin-top:24px;text-align:center"><div class="head" style="justify-content:center">${LOGO}<div style="text-align:left"><b>Проверка документа</b><small>Орбита · концепт цифрового деканата (не официальный сервис)</small></div></div>${inner}</div></body></html>`;
}

module.exports = { renderDocument, renderVerify, maskName, facultyGenitive };
