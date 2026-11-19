// Учебный календарь вымышленного «Университета Горизонт»:
// время пар, четность недель, семестры, шкала оценок.

// Время пар. МО, ФУП, МЖ: обед после 3-й пары. МЭО, МП, МБ, ИМТУР: обед после 2-й пары.
const PAIRS = {
  1: ['09:00', '10:20'], 2: ['10:35', '11:55'], 3: ['12:10', '13:30'], 4: ['14:30', '15:50'],
  5: ['16:00', '17:20'], 6: ['17:30', '18:50'], 7: ['19:00', '20:20'], 8: ['20:30', '21:50'],
};
const PAIRS_MEO = { ...PAIRS, 3: ['12:55', '14:15'] };
const FACULTIES = {
  'МО': 'Факультет международных отношений', 'МП': 'Международно-правовой факультет', 'МЭО': 'Факультет международных экономических отношений',
  'МЖ': 'Факультет международной журналистики', 'МБ': 'Факультет международного бизнеса', 'ИМТУР': 'Институт международной торговли и устойчивого развития',
  'ФУП': 'Факультет управления и политики', 'МИЭП': 'Международный институт энергетической политики и дипломатии',
};
// Код факультета по группе: 2УП-05 → ФУП, 1МО-01 → МО и т. д.
const facultyOf = (group) => { const m = String(group).match(/^\d*([А-ЯЁ]+)/); const c = m ? m[1] : ''; return c === 'УП' ? 'ФУП' : c; };
const pairsFor = (group) => (['МЭО', 'МП', 'МБ', 'ИМТУР'].includes(facultyOf(group)) ? PAIRS_MEO : PAIRS);

const pad = (n) => String(n).padStart(2, '0');
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) || dt.getMonth() !== m - 1 ? null : dt;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function weekday(d) { return ((d.getDay() + 6) % 7) + 1; } // 1 = понедельник … 7 = воскресенье
function mondayOf(d) { return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), 1 - weekday(d)); }

function academicYearStart(d) {
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, 8, 1);
}
// Номер учебной недели (с недели, в которую попадает 1 сентября) и ее четность
function weekInfo(d) {
  const start = mondayOf(academicYearStart(d));
  const n = Math.floor((mondayOf(d) - start) / (7 * 864e5)) + 1;
  return { number: n, parity: n % 2 === 1 ? 'odd' : 'even' };
}
// Осенний семестр — сентябрь…январь, весенний — февраль…июнь
function semesterFor(course, d = new Date()) {
  const m = d.getMonth();
  const autumn = m >= 8 || m === 0;
  return autumn ? course * 2 - 1 : course * 2;
}
function sessionInfo(d = new Date()) {
  const y = academicYearStart(d).getFullYear();
  const autumn = d.getMonth() >= 8 || d.getMonth() === 0;
  return autumn
    ? { name: 'Зимняя сессия', credits_week: [`${y}-12-21`, `${y}-12-29`], start: `${y + 1}-01-09`, end: `${y + 1}-01-29` }
    : { name: 'Летняя сессия', credits_week: [`${y + 1}-06-01`, `${y + 1}-06-07`], start: `${y + 1}-06-09`, end: `${y + 1}-06-30` };
}

// Рейтинговая система: 100 баллов (процентов) за дисциплину, европейская шкала ECTS.
// Экзамен: до 60 баллов в семестре + до 40 на экзамене, допуск от 35.
// Зачет: все 100 баллов в семестре, «зачтено» от 60.
const SCALE = [
  { min: 90, mark: 'отлично', short: '5', ects: 'A' },
  { min: 82, mark: 'хорошо', short: '4', ects: 'B' },
  { min: 75, mark: 'хорошо', short: '4', ects: 'C' },
  { min: 67, mark: 'удовлетворительно', short: '3', ects: 'D' },
  { min: 60, mark: 'удовлетворительно', short: '3', ects: 'E' },
  { min: 0, mark: 'неудовлетворительно', short: '2', ects: 'F' },
];
const markFor = (points) => SCALE.find((s) => points >= s.min);
const ectsFor = (points) => (points == null ? null : markFor(points).ects);
const MARK_MIN = [['отлично', 90], ['хорошо', 75], ['удовлетворительно', 60]];
const RULES = { examSemesterMax: 60, examAdmission: 35, creditPass: 60 };
const MARK_VALUE = { 'отлично': 5, 'хорошо': 4, 'удовлетворительно': 3, 'неудовлетворительно': 2 };

module.exports = { PAIRS, PAIRS_MEO, FACULTIES, facultyOf, pairsFor, ectsFor, MARK_MIN, isoDate, parseDate, addDays, weekday, mondayOf, weekInfo, semesterFor, sessionInfo, SCALE, markFor, RULES, MARK_VALUE, academicYearStart };
