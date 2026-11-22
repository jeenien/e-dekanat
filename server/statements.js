// Документы в PDF одного оформления (A4, Liberation Serif):
// — типовые заявления: шапка справа («Декану … от студентки …»), заголовок, текст, дата и подпись;
// — справка об обучении: бланк университета, номер, текст, подпись ЭП и QR-код для проверки.
// Род и падежи берутся из grammar.js: «студентки Ветровой Анны Сергеевны», «Дана Северцеву Тимуру Андреевичу».
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const S = require('./services');
const G = require('./grammar');
const { facultyGenitive } = require('./documents');
const { TYPES, AID_GROUNDS } = require('./catalog');

const FONT = path.join(__dirname, 'fonts', 'LiberationSerif-Regular.ttf');
const FONT_B = path.join(__dirname, 'fonts', 'LiberationSerif-Bold.ttf');
const ruDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const ruLong = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const FORM_GEN = { 'Очная': 'очной', 'Заочная': 'заочной', 'Очно-заочная': 'очно-заочной' };
const M = { top: 56, bottom: 56, left: 70, right: 56 };

function newDoc(title) {
  const doc = new PDFDocument({ size: 'A4', margins: M, info: { Title: title, Author: 'Орбита (демо)' } });
  doc.registerFont('r', FONT); doc.registerFont('b', FONT_B);
  return { doc, W: doc.page.width - M.left - M.right };
}

function footer(doc, W, text) {
  doc.font('r').fontSize(8.5).fillColor('#888').text(text, M.left, doc.page.height - M.bottom - 14, { width: W, align: 'center' });
}

// Водяной знак демо-прототипа (обязателен для справок, см. CLAUDE.md)
function watermark(doc) {
  doc.save();
  doc.rotate(-28, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.font('b').fontSize(54).fillColor('#1f3a7a').fillOpacity(0.07)
    .text('ДЕМО-ПРОТОТИП', 0, doc.page.height / 2 - 60, { width: doc.page.width, align: 'center' })
    .fontSize(26).text('не является документом', 0, doc.page.height / 2 + 4, { width: doc.page.width, align: 'center' });
  doc.restore();
  doc.fillOpacity(1).fillColor('#000');
}

// Текст заявления по типу услуги. Пустые поля остаются линиями — их можно дописать от руки.
function bodyText(type, p) {
  const line = '____________________';
  switch (type) {
    case 'financial_aid':
      return [
        `Прошу оказать мне материальную помощь ${AID_GROUNDS[p.reason] || line}.`,
        p.details || '',
        p.docs ? `К заявлению прилагаю: ${p.docs}.` : '',
      ];
    case 'academic_leave':
      return [`Прошу предоставить мне академический отпуск с ${p.from ? ruDate(p.from) : line} по основанию: ${p.reason ? p.reason.toLowerCase() : line}.`, p.details || ''];
    case 'rector_retake':
      return [`Прошу разрешить мне пересдачу дисциплины «${p.discipline || line}» комиссии с разрешения проректора по учебной работе.`, p.reason || ''];
    default:
      return [''];
  }
}

function statementPdf(db, userId, type, payload = {}, requestId = null) {
  const st = S.getStudent(db, userId);
  const g = G.genderOf(st);
  const t = TYPES[type];
  const { doc, W } = newDoc(`Заявление: ${t.title}`);
  const head = facultyGenitive(st.faculty);
  const chief = /^института/.test(head) ? 'Директору' : 'Декану';

  // Шапка справа
  doc.font('r').fontSize(12);
  const right = { width: 250, align: 'left' };
  const x = M.left + W - 250;
  doc.text(`${chief} ${head}`, x, M.top, right);
  doc.text('Университета «Горизонт»', x, doc.y, right);
  doc.moveDown(0.6);
  doc.text(`от ${G.byGender(g, 'студента', 'студентки')} ${st.course} курса, группы ${st.group}`, x, doc.y, right);
  doc.text(`${FORM_GEN[st.study_form] || st.study_form.toLowerCase()} формы обучения, ${st.funding === 'Бюджет' ? 'бюджетная основа' : 'обучение по договору'}`, x, doc.y, right);
  doc.text(`направление ${st.program_code} «${st.program}»`, x, doc.y, right);
  doc.moveDown(0.4);
  doc.font('b').text(G.fio(st, 'gen'), x, doc.y, right);
  doc.font('r').text(`зачетная книжка № ${st.record_book || '__________'}`, x, doc.y, right);
  doc.text('тел.: ____________________', x, doc.y, right);

  doc.moveDown(2.5);
  doc.font('b').fontSize(14).text('ЗАЯВЛЕНИЕ', M.left, doc.y, { width: W, align: 'center', characterSpacing: 2 });
  doc.moveDown(1.2);

  doc.font('r').fontSize(12);
  for (const par of bodyText(type, payload)) {
    if (!par) continue;
    doc.text(par, M.left, doc.y, { width: W, align: 'justify', indent: 36, lineGap: 3 });
    doc.moveDown(0.6);
  }
  doc.moveDown(0.4);
  for (let i = 0; i < 3; i++) { const y = doc.y + 18; doc.moveTo(M.left, y).lineTo(M.left + W, y).lineWidth(0.5).strokeColor('#888').stroke(); doc.y = y; }
  doc.moveDown(1.5);
  if (!payload.docs) doc.text('Приложения: _______________________________________________', M.left, doc.y, { width: W });

  doc.moveDown(3);
  const yy = doc.y;
  doc.text('«____» ______________ 20___ г.', M.left, yy, { width: W / 2 });
  doc.text(`_____________ / ${G.initials(st)} /`, M.left + W / 2, yy, { width: W / 2, align: 'right' });
  doc.fontSize(9).fillColor('#777').text('подпись', M.left + W - 170, doc.y + 2, { width: 80, align: 'center' });

  footer(doc, W, `Сформировано в «Орбите»${requestId ? ` по заявке ${requestId}` : ''}. Демонстрационный прототип: университет и данные вымышлены.`);
  doc.end();
  return doc;
}

// Справка об обучении: тот же шрифт и поля, что у заявлений
async function studyCertPdf(db, request, verifyUrl) {
  const st = S.getStudent(db, request.student_id);
  const g = G.genderOf(st);
  const payload = JSON.parse(request.payload || '{}');
  const signer = db.prepare("SELECT last_name, first_name, middle_name, position, gender FROM users WHERE role = 'staff' ORDER BY id LIMIT 1").get();
  const qr = await QRCode.toBuffer(verifyUrl, { type: 'png', margin: 0, width: 300, color: { dark: '#141a2e', light: '#ffffff' } });
  const { doc, W } = newDoc(`Справка об обучении ${request.doc_code}`);
  watermark(doc);

  // Бланк
  doc.font('b').fontSize(13).text('УНИВЕРСИТЕТ «ГОРИЗОНТ»', M.left, M.top, { width: W, align: 'center', characterSpacing: 1 });
  doc.font('r').fontSize(11).text(st.faculty, { width: W, align: 'center' });
  doc.fontSize(9).fillColor('#666').text('вымышленный вуз · демонстрационный прототип «Орбита»', { width: W, align: 'center' });
  doc.fillColor('#000');
  const ly = doc.y + 8;
  doc.moveTo(M.left, ly).lineTo(M.left + W, ly).lineWidth(1.2).strokeColor('#000').stroke();
  doc.y = ly + 36;

  doc.font('b').fontSize(14).text('СПРАВКА', M.left, doc.y, { width: W, align: 'center', characterSpacing: 2 });
  doc.font('r').fontSize(11).fillColor('#444').text(`№ ${request.doc_code} от ${ruLong(request.created_at)}`, { width: W, align: 'center' });
  doc.fillColor('#000').moveDown(1.6);

  const par = (text, opts = {}) => { doc.font('r').fontSize(12).text(text, M.left, doc.y, { width: W, align: 'justify', indent: 36, lineGap: 3, ...opts }); doc.moveDown(0.6); };
  const birth = st.birth_date ? `, ${new Date(st.birth_date).toLocaleDateString('ru-RU')} года рождения,` : '';
  doc.font('r').fontSize(12).text('Дана ', M.left, doc.y, { width: W, align: 'justify', indent: 36, lineGap: 3, continued: true })
    .font('b').text(G.fio(st, 'dat'), { continued: true })
    .font('r').text(`${birth} в том, что ${G.byGender(g, 'он', 'она')} действительно является ${G.byGender(g, 'студентом', 'студенткой')} ${st.course} курса ${FORM_GEN[st.study_form] || st.study_form.toLowerCase()} формы обучения ${facultyGenitive(st.faculty)} Университета «Горизонт» по направлению подготовки ${st.program_code} «${st.program}».`);
  doc.moveDown(0.6);
  par(`Основа обучения: ${st.funding === 'Бюджет' ? 'за счет бюджетных ассигнований' : 'по договору об оказании платных образовательных услуг'}.`);
  par(`Зачетная книжка № ${st.record_book}. Год поступления: ${st.enrolled_year}. Нормативный срок окончания обучения: 30 июня ${st.enrolled_year + 4} г.`);
  doc.font('r').fontSize(12).text('Справка выдана для предоставления: ', M.left, doc.y, { width: W, indent: 36, lineGap: 3, continued: true })
    .font('b').text(String(payload.purpose || 'по месту требования').toLowerCase() + '.');
  doc.moveDown(2.5);

  // Подпись и QR
  const y0 = doc.y;
  const qrSize = 96;
  doc.image(qr, M.left + W - qrSize, y0, { width: qrSize });
  doc.font('r').fontSize(8.5).fillColor('#555').text(`Проверить подлинность:\n${request.doc_code}`, M.left + W - qrSize - 10, y0 + qrSize + 4, { width: qrSize + 20, align: 'center' });
  doc.fillColor('#000').font('r').fontSize(12);
  if (signer) {
    doc.text(signer.position || 'Специалист деканата', M.left, y0, { width: W - qrSize - 30 });
    doc.text(`${G.byGender(G.genderOf(signer), 'Подготовил', 'Подготовила')}: ${G.initials(signer, false)}`, M.left, doc.y + 2, { width: W - qrSize - 30 });
  }
  doc.moveDown(0.6);
  const sx = M.left, sy = doc.y + 4, sw = 260, sh = 42;
  doc.save().rotate(-2, { origin: [sx + sw / 2, sy + sh / 2] })
    .roundedRect(sx, sy, sw, sh, 6).lineWidth(1.5).strokeColor('#4338ca').stroke()
    .font('b').fontSize(9.5).fillColor('#1f3a7a')
    .text('ПОДПИСАНО ЭЛЕКТРОННОЙ ПОДПИСЬЮ', sx + 8, sy + 7, { width: sw - 16, align: 'center', lineBreak: false })
    .font('r').text(`деканата · ${new Date(request.updated_at).toLocaleString('ru-RU')}`, sx + 8, sy + 24, { width: sw - 16, align: 'center', lineBreak: false })
    .restore();
  doc.fillColor('#000');

  footer(doc, W, 'Демонстрационный документ конкурсного прототипа «Орбита». Университет и все данные вымышлены.');
  doc.end();
  return doc;
}

module.exports = { statementPdf, studyCertPdf };
