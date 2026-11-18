// Учебный календарь вымышленного «Университета Горизонт»:
// время пар, чётность недель, семестры, шкала оценок.

const PAIRS = {
  1: ['08:30', '10:00'], 2: ['10:10', '11:40'], 3: ['12:10', '13:40'],
  4: ['13:50', '15:20'], 5: ['15:30', '17:00'], 6: ['17:10', '18:40'], 7: ['18:50', '20:20'],
};

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
// Номер учебной недели (с недели, в которую попадает 1 сентября) и её чётность
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

// Балльно-рейтинговая система: 100 баллов за дисциплину
// Экзамен: до 60 баллов в семестре + до 40 на экзамене, допуск от 35.
// Зачёт: все 100 баллов в семестре, «зачтено» от 55.
const SCALE = [
  { min: 85, mark: 'отлично', short: '5' },
  { min: 70, mark: 'хорошо', short: '4' },
  { min: 55, mark: 'удовлетворительно', short: '3' },
  { min: 0, mark: 'неудовлетворительно', short: '2' },
];
const markFor = (points) => SCALE.find((s) => points >= s.min);
const RULES = { examSemesterMax: 60, examAdmission: 35, creditPass: 55 };
const MARK_VALUE = { 'отлично': 5, 'хорошо': 4, 'удовлетворительно': 3, 'неудовлетворительно': 2 };

module.exports = { PAIRS, isoDate, parseDate, addDays, weekday, mondayOf, weekInfo, semesterFor, sessionInfo, SCALE, markFor, RULES, MARK_VALUE, academicYearStart };
