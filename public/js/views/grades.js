// Успеваемость: «как у меня дела» — баллы, прогноз, что нужно на экзамене, сессия, зачетка.
import { api, esc, icon, fmt, parseISO, empty, markClass, markShort, plural } from '../lib.js';

const STATUS_CHIP = { ok: ['ok', 'В графике'], watch: ['warn', 'Внимание'], risk: ['bad', 'Внимание'] };

const wt = (w) => `×${String(w).replace('.', ',')}`;
function disciplineCard(c) {
  const [cls] = STATUS_CHIP[c.status];
  return `<article class="card disc">
    <div class="disc-h"><div class="grow"><h3>${esc(c.name)}</h3><div class="small muted">${esc(c.control_label)}${c.teacher ? ` · ${esc(c.teacher)}` : ''} · ${c.credits} з.е.</div></div>
      <div class="score">${c.earned}<small> / 100</small></div></div>
    <div class="progress ${c.status}" role="img" aria-label="Рейтинг ${c.earned} из 100, порог ${c.threshold}">
      <i style="width:${Math.min(100, c.earned)}%;position:relative"></i>
      <span class="mark" style="left:${c.threshold}%" title="${c.control === 'exam' ? 'Допуск' : 'Автомат'}: ${c.threshold}"></span></div>
    <div class="row between wrap"><span class="chip ${cls}">${icon(c.status === 'ok' ? 'checkCircle' : 'alert', 'sm')} ${esc(c.label)}</span>
      <span class="xs faint">ср. балл группы ${c.group_avg ?? '—'}</span></div>
    <details class="more"><summary>${icon('chevronRight', 'sm')} Из чего складывается</summary>
      <div class="items" style="margin-top:8px">${c.items.map((i) => `<div class="it ${i.score == null ? 'future' : ''}"><span>${esc(i.title)} <span class="faint xs">${wt(i.weight)}</span></span><span>${i.score == null ? `до ${fmt.dmShort(parseISO(i.date))}` : `<b>${i.score}</b>${i.unit || ' / 100'}`}</span></div>`).join('')}</div>

    </details></article>`;
}

function currentTab(g) {
  return `<div class="grid c2" style="align-items:start">
    <div class="card"><div class="card-h"><h2>Шкала оценивания</h2></div>
      <div class="grading" role="table" aria-label="Шкала оценивания">
        <div class="g-head" role="row"><span>Баллы</span><span>ECTS</span><span>Оценка</span></div>
        ${[['90–100', 'A', 'отлично', 's5'], ['82–89', 'B', 'хорошо', 's4'], ['75–81', 'C', 'хорошо', 's4'], ['67–74', 'D', 'удовлетворительно', 's3'], ['60–66', 'E', 'удовлетворительно', 's3'], ['0–59', 'F', 'неудовлетворительно', 's2']]
          .map(([r, l, m, c]) => `<div class="g-row ${c}" role="row"><span class="g-range">${r}</span><span class="g-letter">${l}</span><span class="g-mark">${m}</span></div>`).join('')}
      </div>
    </div>
    <div class="card"><div class="card-h"><h2>Пороги</h2></div><div class="row wrap" style="gap:8px"><span class="chip ok">автомат от 70 баллов</span><span class="chip">допуск к экзамену от 50 баллов</span></div></div>
  </div>
  <div class="section-title">Семестр ${g.semester} · ${g.current.length} ${plural(g.current.length, 'дисциплина', 'дисциплины', 'дисциплин')}</div>
  <div class="grid c2" style="align-items:start">${g.current.map(disciplineCard).join('')}</div>`;
}

function sessionTab(g) {
  const s = g.session;
  const sd = parseISO(s.start);
  return `<div class="card"><div class="row between wrap"><div><h2 style="font-size:20px">${esc(s.name)}</h2><p class="muted small">Зачетная неделя ${fmt.dmShort(parseISO(s.credits_week[0]))} – ${fmt.dmShort(parseISO(s.credits_week[1]))} · экзамены ${fmt.dmShort(sd)} – ${fmt.dmShort(parseISO(s.end))}</p></div>
    <span class="chip brand">${fmt.until(s.credits_week[0] + 'T09:00')}</span></div></div>
  <div class="card">${s.exams.length ? s.exams.map((e) => {
    const d = new Date(e.date);
    return `<div class="exam-card"><div class="date-tile"><b>${d.getDate()}</b><small>${fmt.mon(d)}</small></div>
      <div><div class="row between wrap" style="gap:6px"><b>${esc(e.name)}</b><span class="chip ${e.admitted ? 'ok' : 'warn'}">${e.admitted ? 'допуск' : 'пока без допуска'}</span></div>
      <div class="small muted">${esc(e.control_label)} · ${fmt.time(e.date)} · ${esc(e.room)}${e.teacher ? ` · ${esc(e.teacher)}` : ''}</div>
      ${e.consult ? `<div class="xs faint" style="margin-top:2px">Консультация: ${esc(fmt.dateTime(e.consult))}</div>` : ''}</div></div>`;
  }).join('') : empty('calendar', 'Расписание сессии еще не опубликовано')}</div>`;
}

function recordTab(g) {
  const sems = Object.entries(g.semesters);
  if (!sems.length) return `<div class="card">${empty('book', 'Зачетка пока пустая', 'Оценки появятся здесь после первой сессии. Удачи!')}</div>`;
  return `<div class="stat-row">
      <div class="stat"><b>${g.summary.gpa ?? '—'}</b><span>средний балл</span></div>
      <div class="stat"><b>${g.summary.credits}</b><span>зачетных единиц</span></div>
      <div class="stat"><b>${g.summary.excellent_share ?? 0}%</b><span>оценок «отлично»</span></div></div>
    ${g.debts.length ? `<div class="card row" style="background:var(--bad-soft);border-color:transparent"><div style="color:var(--bad)">${icon('alert', 'lg')}</div><div class="grow"><b>Академическая задолженность</b><div class="small">${g.debts.map((d) => `${esc(d.name)} (${d.semester} сем.)`).join(', ')}</div><div class="xs muted" style="margin-top:4px">Дату пересдачи назначают деканат и кафедра — она появится в расписании и на главной.</div></div></div>` : ''}
    ${sems.reverse().map(([sem, list]) => `<section class="card pad-0"><div class="card-h" style="padding:14px 16px 4px"><h2>${sem} семестр</h2><span class="chip">${list.length} ${plural(list.length, 'дисциплина', 'дисциплины', 'дисциплин')}</span></div>
      <div class="list">${list.map((x) => `<div class="li"><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${esc(x.control_label)} · ${x.credits} з.е.${x.points ? ` · ${x.points} б.` : ''}</div></div><span class="mark-pill ${markClass(x.mark)}" title="${esc(x.mark)}">${esc(markShort(x.mark))}</span>${x.ects ? `<span class="mark-pill mz" title="ECTS" style="margin-left:6px">${x.ects}</span>` : ''}</div>`).join('')}</div></section>`).join('')}
    <a class="btn ghost" href="#/requests/new/transcript">${icon('download')} Получить выписку из зачетки</a>`;
}

export async function render(ctx) {
  ctx.setTitle('Успеваемость');
  const g = await api('/grades');
  if (!ctx.isCurrent()) return;
  const tabs = [['current', 'Текущий семестр'], ['session', 'Сессия'], ['record', 'Зачетка']];
  const tab = tabs.some((t) => t[0] === ctx.params.tab) ? ctx.params.tab : 'current';
  ctx.el.innerHTML = `<div class="page stack">
    <div class="seg" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="stack" id="tab">${tab === 'session' ? sessionTab(g) : tab === 'record' ? recordTab(g) : currentTab(g)}</div></div>`;
  ctx.el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { location.hash = b.dataset.tab === 'current' ? '#/grades' : `#/grades/${b.dataset.tab}`; });
}
