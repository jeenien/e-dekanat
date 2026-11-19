// «Посещаемость»: пропуски занятий и проходы через турникеты (СКУД). Студент видит только свои данные.
import { api, esc, icon, fmt, parseISO, empty, plural, todayISO } from '../lib.js';
import { absenceMeter, absenceText, absenceChip } from './today.js';

export const hmin = (m) => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60 ? String(m % 60).padStart(2, '0') + ' мин' : ''}` : `${m} мин`).trim();
const DAY_START = 7 * 60, DAY_END = 21 * 60; // шкала дня 7:00–21:00
const toM = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Столбики «часы в университете по дням» — одна серия, подсказка по наведению
export function campusBars(days) {
  const list = [...days].slice(0, 7).reverse();
  const max = Math.max(60, ...list.map((d) => d.minutes));
  return `<div class="bars" role="img" aria-label="Время в университете по дням за неделю">${list.map((d) => {
    const dd = parseISO(d.date);
    return `<div class="b ${d.date === todayISO() ? 'today' : ''}" title="${esc(fmt.dm(dd))}: ${d.minutes ? hmin(d.minutes) : 'не был(а)'}">
      ${d.minutes ? `<em>${(d.minutes / 60).toFixed(1).replace('.0', '')}</em>` : '<em>—</em>'}
      <i class="${d.minutes ? '' : 'zero'}" style="height:${d.minutes ? Math.max(4, Math.round(d.minutes / max * 96)) : 2}px"></i><small>${fmt.wd(dd)}</small></div>`;
  }).join('')}</div>`;
}

// Лента дней: полоса показывает, когда человек был внутри
export function passDays(days) {
  const shown = days.filter((d) => d.events.length);
  if (!shown.length) return empty('pin', 'Проходов нет', 'Здесь появятся входы и выходы через турникеты.');
  const pos = (t) => Math.max(0, Math.min(100, (toM(t) - DAY_START) / (DAY_END - DAY_START) * 100));
  return `<div class="track-axis hide-mob" aria-hidden="true"><span>7:00</span><span>10:00</span><span>13:00</span><span>16:00</span><span>19:00</span><span>21:00</span></div>
    ${shown.map((d) => {
      const dd = parseISO(d.date);
      const nowT = new Date().toTimeString().slice(0, 5);
      return `<details class="pass-day-wrap"><summary class="pass-day" style="cursor:pointer;list-style:none">
        <div><b>${fmt.wd(dd)}, ${dd.getDate()}</b><div class="xs faint">${fmt.mon(dd)}</div></div>
        <div class="track" aria-hidden="true">${d.intervals.map(([a, b]) => `<i style="left:${pos(a)}%;width:${Math.max(1, pos(b || nowT) - pos(a))}%"></i>`).join('')}</div>
        <div style="text-align:right"><b>${hmin(d.minutes)}</b><div class="xs faint">вход ${d.first_in}${d.inside ? '' : d.last_out ? ` · выход ${d.last_out}` : ''}</div></div></summary>
        <div class="small" style="padding:0 0 10px 86px;display:grid;gap:4px">${d.events.map((e) => `<div class="row" style="gap:8px"><span class="chip ${e.direction === 'in' ? 'ok' : ''}">${e.direction === 'in' ? 'вход' : 'выход'}</span><b>${e.time}</b><span class="muted">${esc(e.gate)}</span></div>`).join('')}</div>
      </details>`;
    }).join('')}`;
}

export function absenceList(list) {
  if (!list.length) return empty('checkCircle', 'Пропусков нет', 'Так держать!');
  return `<div class="list">${list.map((a) => `<div class="li" style="padding:10px 0"><div class="ico ${a.excused ? 'info' : 'warn'}">${icon(a.excused ? 'docs' : 'clock')}</div>
    <div class="grow"><div class="t">${esc(a.subject)}</div><div class="s">${fmt.dmShort(parseISO(a.date))}, ${a.pair} пара · ${a.start}</div></div>
    <span class="chip ${a.excused ? 'info' : ''}">${a.excused ? 'по справке' : `${a.hours} ч`}</span></div>`).join('')}</div>`;
}

export async function render(ctx) {
  ctx.setTitle('Посещаемость');
  const d = await api('/attendance');
  if (!ctx.isCurrent()) return;
  const tab = ctx.params.tab === 'passes' ? 'passes' : 'absences';
  const a = d.absences, c = d.campus;
  const t = c.days[0];
  ctx.el.innerHTML = `<div class="page stack">
    <div class="seg" role="tablist"><button role="tab" class="${tab === 'absences' ? 'on' : ''}" aria-selected="${tab === 'absences'}" data-tab="absences">Пропуски</button><button role="tab" class="${tab === 'passes' ? 'on' : ''}" aria-selected="${tab === 'passes'}" data-tab="passes">Входы и выходы</button></div>
    ${tab === 'absences' ? `
      <div class="grid c2" style="align-items:start">
        <section class="card"><div class="row between" style="align-items:flex-end">
            <div><div class="small muted">Без уважительной причины</div><div class="big-num" style="${absenceText(a).over ? 'color:var(--bad)' : ''}">${a.hours} <small>ак. ч из ${absenceText(a).limit} ак. ч</small></div><div style="margin-top:6px">${absenceChip(a)}</div></div>
            ${a.excused_hours ? `<span class="chip info">${icon('docs', 'sm')} ${a.excused_hours} ч по справке</span>` : ''}</div>
          ${absenceMeter(a)}
          <div class="legend"><span><i class="sw" style="background:var(--fill)"></i>1 пара = 2 ак. ч</span><span><i class="sw tick"></i>порог</span><span><i class="sw" style="background:var(--info-soft);border:1px solid var(--info)"></i>по справке — не считается</span></div>
        </section>
        ${d.retakes.length ? `<section class="card"><div class="card-h"><h2>Пересдачи</h2></div>${d.retakes.map((r) => `<a class="li" href="#/schedule/${esc(r.date)}" style="padding:8px 0;border:0"><div class="ico warn">${icon('refresh')}</div><div class="grow"><div class="t">${esc(r.discipline)}</div><div class="s">${fmt.dayTitle(parseISO(r.date))}, ${r.start} · ${esc(r.room)}</div></div>${icon('chevronRight')}</a>`).join('')}</section>` : ''}
      </div>
      <section class="card"><div class="card-h"><h2>История пропусков</h2><span class="chip">${a.list.length}</span></div>${absenceList(a.list)}</section>`
    : `
      <div class="grid c2" style="align-items:start">
        <section class="card"><div class="card-h"><h2>Сегодня</h2></div>
          <div class="big-num">${t.minutes ? hmin(t.minutes) : '—'}</div>
          <div class="small muted" style="margin-top:6px">${t.first_in ? `вход в ${t.first_in}${t.last_out && !t.inside ? ` · выход в ${t.last_out}` : ''}` : 'Сегодня проходов через турникеты не было'}</div></section>
        <section class="card"><div class="card-h"><h2>За неделю</h2><span class="chip">${Math.round(c.week_minutes / 60)} ч · ${c.week_days} ${plural(c.week_days, 'день', 'дня', 'дней')}</span></div>${campusBars(c.days)}</section>
      </div>
      <section class="card"><div class="card-h"><h2>Проходы за 2 недели</h2></div>${passDays(c.days)}</section>`}
  </div>`;
  ctx.el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { location.hash = b.dataset.tab === 'absences' ? '#/campus' : '#/campus/passes'; });
}
