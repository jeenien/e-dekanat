// Род и падежи для документов: «студент / студентка», «Ветровой Анне Сергеевне», «от Северцева Тимура Андреевича».
// Пол хранится в users.gender ('m' | 'f'); если не задан — определяется по отчеству.

function genderOf(u) {
  if (u?.gender === 'm' || u?.gender === 'f') return u.gender;
  const m = String(u?.middle_name || '').toLowerCase();
  if (/(вна|чна|кызы)$/.test(m)) return 'f';
  if (/(вич|ич|оглы)$/.test(m)) return 'm';
  return /[ая]$/.test(String(u?.first_name || '').toLowerCase()) ? 'f' : 'm';
}

// Слово в форме по роду: g('m'|'f', 'студент', 'студентка')
const byGender = (g, m, f) => (g === 'f' ? f : m);

const SOFT = /[гкхжчшщ]$/;
const cases = (w, gen, dat) => ({ gen, dat });

function lastName(w, g) {
  const l = w.toLowerCase();
  if (/(ых|их|о|е|и|у|ю|ко)$/.test(l)) return cases(w, w, w); // не склоняются: Черных, Шевченко
  if (g === 'f') {
    if (/(ова|ева|ина|ына|ёва)$/.test(l)) return cases(w, w.slice(0, -1) + 'ой', w.slice(0, -1) + 'ой');
    if (/(ая)$/.test(l)) return cases(w, w.slice(0, -2) + 'ой', w.slice(0, -2) + 'ой');
    if (/а$/.test(l)) { const b = w.slice(0, -1); return cases(w, b + (SOFT.test(b) ? 'и' : 'ы'), b + 'е'); }
    if (/я$/.test(l)) { const b = w.slice(0, -1); return cases(w, b + 'и', b + 'е'); }
    return cases(w, w, w); // женские фамилии на согласный не склоняются
  }
  if (/(ский|цкий|ой|ый|ий)$/.test(l)) { const b = w.slice(0, -2); return cases(w, b + 'ого', b + 'ому'); }
  if (/а$/.test(l)) { const b = w.slice(0, -1); return cases(w, b + (SOFT.test(b) ? 'и' : 'ы'), b + 'е'); }
  if (/[йь]$/.test(l)) { const b = w.slice(0, -1); return cases(w, b + 'я', b + 'ю'); }
  return cases(w, w + 'а', w + 'у');
}

function firstName(w, g) {
  const l = w.toLowerCase();
  if (/ия$/.test(l)) { const b = w.slice(0, -1); return cases(w, b + 'и', b + 'и'); }
  if (/а$/.test(l)) { const b = w.slice(0, -1); return cases(w, b + (SOFT.test(b) ? 'и' : 'ы'), b + 'е'); }
  if (/я$/.test(l)) { const b = w.slice(0, -1); return cases(w, b + 'и', b + 'е'); }
  if (g === 'f') return cases(w, w, w); // Любовь, Агнес — оставляем как есть
  if (/[йь]$/.test(l)) { const b = w.slice(0, -1); return cases(w, b + 'я', b + 'ю'); }
  if (/[оеиую]$/.test(l)) return cases(w, w, w);
  return cases(w, w + 'а', w + 'у');
}

function middleName(w, g) {
  if (!w) return cases('', '', '');
  if (g === 'f' && /на$/.test(w)) { const b = w.slice(0, -1); return cases(w, b + 'ы', b + 'е'); }
  if (/ич$/.test(w)) return cases(w, w + 'а', w + 'у');
  return cases(w, w, w);
}

// ФИО в падеже: 'nom' | 'gen' | 'dat'
function fio(u, c = 'nom') {
  const g = genderOf(u);
  const parts = [[u.last_name, lastName], [u.first_name, firstName], [u.middle_name, middleName]].filter(([w]) => w);
  return parts.map(([w, fn]) => (c === 'nom' ? w : fn(w, g)[c])).join(' ');
}

const initials = (u, lastFirst = true) => {
  const i = `${u.first_name[0]}. ${u.middle_name ? u.middle_name[0] + '.' : ''}`.trim();
  return lastFirst ? `${u.last_name} ${i}` : `${i} ${u.last_name}`;
};

module.exports = { genderOf, byGender, fio, initials };
