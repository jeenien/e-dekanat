// Успеваемость: «как у меня дела» — баллы, прогноз, что нужно на экзамене, сессия, зачетка.
import { api, esc, icon, fmt, parseISO, empty, markClass, markShort, plural } from '../lib.js';

const STATUS_CHIP = { ok: ['ok', 'В графике'], watch: ['warn', 'Внимание'], risk: ['bad', 'Внимание'] };

function disciplineCard(c) {
  const pct = (x) => Math.min(100, Math.round(x / c.sem_max * 100));
  const [cls, txt] = STATUS_CHIP[c.status];
  return `<article class="card disc">
    <div class="disc-h"><div class="grow"><h3>${esc(c.name)}</h3><div class="small muted">${esc(c.control_label)}${c.teacher ? ` · ${esc(c.teacher)}` : ''} · ${c.credits} з.е.</div></div>
      <div class="score">${c.earned}<small> / ${c.sem_max}</small></div></div>
    <div class="progress ${c.status}" role="img" aria-label="Набрано ${c.earned} из ${c.sem_max}, прогноз ${c.projected}, порог ${c.threshold}">
      <i class="proj" style="width:${pct(c.projected)}%"></i><i style="width:${pct(c.earned)}%;position:relative"></i>
      <span class="mark" style="left:${pct(c.threshold)}%" title="Порог ${c.threshold}"></span></div>
    <div class="row between wrap"><span class="chip ${cls}">${icon(c.status === 'ok' ? 'checkCircle' : 'alert', 'sm')} ${esc(c.label)}</span>
      <span class="xs faint">прогноз ≈ ${c.projected} · среднее по группе ${c.group_avg ?? '—'}</span></div>
    <details class="more"><summary>${icon('chevronRight', 'sm')} Контрольные точки${c.exam_targets ? ' и цели на экзамен' : ''}</summary>
      <div class="items" style="margin-top:8px">${c.items.map((i) => `<div class="it ${i.score == null ? 'future' : ''}"><span>${esc(i.title)}</span><span>${i.score == null ? `до ${fmt.dmShort(parseISO(i.date))} · ${i.max} б.` : `<b>${i.score}</b> / ${i.max}`}</span></div>`).join('')}</div>
      ${c.exam_targets ? `<p class="small muted" style="margin:12px 0 6px">Нужно на экзамене (из 40):</p>
        <div class="targets">${c.exam_targets.map((t) => `<div><b style="color:${t.possible ? 'var(--text)' : 'var(--text-3)'}">${t.possible ? t.need : '—'}</b>${esc(t.mark)}</div>`).join('')}</div>` : ''}
    </details></article>`;
}

function currentTab(g) {
  return `<div class="grid c2" style="align-items:start">
    <div class="card"><div class="card-h"><h2>Шкала, 100 баллов</h2></div>
      <div class="scale" aria-label="Шкала оценок: 0–59 F, 60–66 E, 67–74 D, 75–81 C, 82–89 B, 90–100 A"><div class="s2">F</div><div class="s3">E</div><div class="s3">D</div><div class="s4">C</div><div class="s4">B</div><div class="s5">A</div></div>
      <div class="scale-n"><span>0</span><span>60</span><span>67</span><span>75</span><span>82</span><span>90</span></div>
      <div class="scale marks"><div class="s2">2</div><div class="s3" style="grid-column:span 2">3</div><div class="s4" style="grid-column:span 2">4</div><div class="s5">5</div></div>
      <div class="legend" style="margin-top:14px"><span><i class="sw"></i>набрано</span><span><i class="sw proj"></i>прогноз по темпу</span><span><i class="sw tick"></i>порог допуска / зачета</span></div>
    </div>
    <div class="card"><div class="card-h"><h2>Правила</h2></div><div class="row wrap" style="gap:6px"><span class="chip">экзамен: 60 + 40</span><span class="chip">допуск от 35</span><span class="chip">зачет от 60</span></div></div>
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
