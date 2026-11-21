// Типовые заявления в PDF: шапка справа («Декану … от студента …»), заголовок,
// текст по данным заявки, место для даты и подписи. Можно скачать, распечатать и подписать.
const path = require('path');
const PDFDocument = require('pdfkit');
const S = require('./services');
const { facultyGenitive } = require('./documents');
const { TYPES } = require('./catalog');

const FONT = path.join(__dirname, 'fonts', 'LiberationSerif-Regular.ttf');
const FONT_B = path.join(__dirname, 'fonts', 'LiberationSerif-Bold.ttf');
const ruDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };

// Текст заявления по типу услуги. Пустые поля остаются линиями — их можно дописать от руки.
function bodyText(type, p) {
  const line = '____________________';
  switch (type) {
    case 'financial_aid':
      return [`Прошу оказать мне материальную помощь в связи с обстоятельством: ${p.reason ? p.reason.toLowerCase() : line}.`, p.details || ''];
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
  const t = TYPES[type];
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 70, right: 56 }, info: { Title: `Заявление: ${t.title}`, Author: 'Орбита (демо)' } });
  doc.registerFont('r', FONT); doc.registerFont('b', FONT_B);
  const W = doc.page.width - 70 - 56;
  const head = facultyGenitive(st.faculty);
  const chief = /^института/.test(head) ? 'Директору' : 'Декану';

  // Шапка справа
  doc.font('r').fontSize(12);
  const right = { width: 250, align: 'left' };
  const x = 70 + W - 250;
  doc.text(`${chief} ${head}`, x, 56, right);
  doc.text('Университета «Горизонт»', x, doc.y, right);
  doc.moveDown(0.6);
  doc.text(`от студента(ки) ${st.course} курса, группы ${st.group}`, x, doc.y, right);
  doc.text(`${{ 'Очная': 'очной', 'Заочная': 'заочной', 'Очно-заочная': 'очно-заочной' }[st.study_form] || st.study_form.toLowerCase()} формы обучения, ${st.funding === 'Бюджет' ? 'бюджетная основа' : 'обучение по договору'}`, x, doc.y, right);
  doc.text(`направление ${st.program_code} «${st.program}»`, x, doc.y, right);
  doc.moveDown(0.4);
  doc.font('b').text(`${st.last_name} ${st.first_name} ${st.middle_name || ''}`.trim(), x, doc.y, right);
  doc.font('r').text(`зачетная книжка № ${st.record_book || '__________'}`, x, doc.y, right);
  doc.text('тел.: ____________________', x, doc.y, right);

  // Заголовок
  doc.moveDown(2.5);
  doc.font('b').fontSize(14).text('ЗАЯВЛЕНИЕ', 70, doc.y, { width: W, align: 'center', characterSpacing: 2 });
  doc.moveDown(1.2);

  // Текст
  doc.font('r').fontSize(12);
  for (const par of bodyText(type, payload)) {
    if (!par) continue;
    doc.text(par, 70, doc.y, { width: W, align: 'justify', indent: 36, lineGap: 3 });
    doc.moveDown(0.6);
  }
  // Линии для дописывания от руки
  doc.moveDown(0.4);
  for (let i = 0; i < 3; i++) { const y = doc.y + 18; doc.moveTo(70, y).lineTo(70 + W, y).lineWidth(0.5).strokeColor('#888').stroke(); doc.y = y; }
  doc.moveDown(1.5);
  doc.text('Приложения: _______________________________________________', 70, doc.y, { width: W });

  // Дата и подпись
  doc.moveDown(3);
  const yy = doc.y;
  doc.text('«____» ______________ 20___ г.', 70, yy, { width: W / 2 });
  doc.text('_____________ / ' + `${st.last_name} ${st.first_name[0]}. ${st.middle_name ? st.middle_name[0] + '.' : ''}`.trim() + ' /', 70 + W / 2, yy, { width: W / 2, align: 'right' });
  doc.fontSize(9).fillColor('#777').text('подпись', 70 + W - 170, doc.y + 2, { width: 80, align: 'center' });

  // Подвал
  doc.fontSize(8.5).fillColor('#888').text(
    `Сформировано в «Орбите»${requestId ? ` по заявке ${requestId}` : ''}. Демонстрационный прототип: университет и данные вымышлены.`,
    70, doc.page.height - 56 - 14, { width: W, align: 'center' });
  doc.end();
  return doc;
}

module.exports = { statementPdf };
