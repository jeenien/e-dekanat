// Расписание: лента недели на телефоне, сетка недели на широком экране, изменения подсвечены.
import { api, esc, icon, fmt, parseISO, isoDate, addDays, todayISO, minutes, empty, kindClass, plural } from '../lib.js';

export function changeLabel(c) {
  return { cancel: 'Отмена', room: 'Новая аудитория', teacher: 'Замена преподавателя', extra: 'Доп. занятие', move: 'Перенос', moved_in: 'Перенесено сюда', retake: 'Пересдача' }[c.type] || 'Изменение';
}
function changeNote(l) {
  const c = l.change; if (!c) return '';
  const cls = c.type === 'cancel' ? 'bad' : c.type === 'extra' || c.type === 'moved_in' ? 'info' : 'warn';
  if (c.type === 'retake') return `<div class="change-note bad">${icon('refresh', 'sm')} Ваша пересдача · ${esc(c.note || '')}</div>`;
  let txt = changeLabel(c);
  if (c.type === 'room') txt += `: ${l.room} вместо ${c.old_room}`;
  if (c.type === 'teacher') txt += `: вместо ${c.old_teacher}`;
  if (c.type === 'move' && c.new_date) txt += ` на ${fmt.dmShort(parseISO(c.new_date))}, ${c.new_pair} пара`;
  return `<div class="change-note ${cls}">${icon(c.type === 'cancel' ? 'x' : c.type === 'extra' ? 'plus' : 'alert', 'sm')} ${esc(txt)}${c.note ? ` · ${esc(c.note)}` : ''}</div>`;
}

export function lessonHtml(l, date) {
  const isToday = date === todayISO();
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const now = isToday && minutes(l.start) <= nowM && nowM < minutes(l.end) && l.change?.type !== 'cancel';
  const past = isToday && minutes(l.end) <= nowM;
  return `<div class="lesson ${kindClass(l.kind)} ${l.change?.type === 'cancel' ? 'cancel' : ''} ${now ? 'now' : ''} ${past ? 'past' : ''}">
    <div class="time">${l.start}<small>${l.end}</small></div>
    <div class="body"><div class="row between" style="align-items:flex-start;gap:8px"><div class="subj">${esc(l.subject)}</div>${now ? '<span class="chip brand">сейчас</span>' : ''}</div>
      <div class="info"><span>${esc(l.kind)}</span><span>${icon(l.online ? 'monitor' : 'map', 'sm')} ${l.change?.type === 'room' ? `<s class="old">${esc(l.change.old_room)}</s>&nbsp;<b>${esc(l.room)}</b>` : esc(l.room)}</span>${l.teacher ? `<span>${icon('teacher', 'sm')} ${esc(l.teacher)}</span>` : ''}</div>
      ${changeNote(l)}
      ${l.online_url && l.change?.type !== 'cancel' ? `<a class="link small" href="${esc(l.online_url)}" target="_blank" rel="noopener" style="margin-top:6px">${icon('ext', 'sm')} Ссылка на онлайн-занятие</a>` : ''}
    </div></div>`;
}

function dayList(day) {
  if (!day.lessons.length) return empty(parseISO(day.date).getDay() === 0 ? 'coffee' : 'sun', parseISO(day.date).getDay() === 0 ? 'Воскресенье — выходной' : 'Пар нет', 'Свободный день в расписании.');
  const out = [];
  day.lessons.forEach((l, i) => {
    const prev = day.lessons[i - 1];
    if (prev) {
      const gap = minutes(l.start) - minutes(prev.end);
      if (gap >= 30) out.push(`<div class="break">${icon('coffee', 'sm')} Перерыв ${gap >= 90 ? `${Math.floor(gap / 60)} ч ${gap % 60 ? (gap % 60) + ' мин' : ''}` : `${gap} мин`}</div>`);
    }
    out.push(lessonHtml(l, day.date));
  });
  return `<div class="day">${out.join('')}</div>`;
}

export async function render(ctx) {
  ctx.setTitle('Расписание');
  const sel = ctx.params.date && /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.date) ? ctx.params.date : todayISO();
  const selD = parseISO(sel);
  const monday = addDays(selD, -((selD.getDay() + 6) % 7));
  const data = await api(`/schedule?from=${isoDate(monday)}&days=7`);
  if (!ctx.isCurrent()) return;
  const days = data.days;
  const day = days.find((d) => d.date === sel) || days[0];
  const changes = days.reduce((s, d) => s + d.lessons.filter((l) => l.change).length, 0);
  const prevW = isoDate(addDays(monday, -7)), nextW = isoDate(addDays(monday, 7));

  ctx.el.innerHTML = `<div class="page stack">
    <div class="row wrap between">
      <div class="row"><a class="icon-btn" href="#/schedule/${prevW}" aria-label="Предыдущая неделя">${icon('chevronLeft')}</a>
        <div><b>${fmt.dmShort(monday)} — ${fmt.dmShort(addDays(monday, 6))}</b><div class="xs faint">${days[0].week}-я неделя · ${days[0].parity === 'odd' ? 'нечетная' : 'четная'} · ${esc(data.group)}</div></div>
        <a class="icon-btn" href="#/schedule/${nextW}" aria-label="Следующая неделя">${icon('chevronRight')}</a></div>
      <div class="row">${sel !== todayISO() ? `<a class="btn sm ghost" href="#/schedule">Сегодня</a>` : ''}
        <a class="btn sm soft" href="/api/schedule.ics" download>${icon('download', 'sm')} <span>Экспорт</span></a></div>
    </div>
    ${changes ? `<div class="chip warn" style="justify-self:start">${icon('alert', 'sm')} На этой неделе ${changes} ${plural(changes, 'изменение', 'изменения', 'изменений')}</div>` : ''}
    <div class="sched-mobile stack">
      <div class="week-strip" role="tablist" aria-label="Дни недели">${days.map((d) => {
        const dd = parseISO(d.date);
        return `<button role="tab" aria-selected="${d.date === day.date}" class="${d.date === day.date ? 'on' : ''} ${d.date === todayISO() ? 'today' : ''}" data-date="${d.date}"><small>${fmt.wd(dd)}</small><b>${dd.getDate()}</b><span class="dots">${d.lessons.slice(0, 4).map((l) => `<i class="${l.change?.type === 'retake' ? 'rt' : l.change ? 'ch' : ''}"></i>`).join('')}</span></button>`;
      }).join('')}</div>
      <section class="card"><div class="card-h"><h2>${fmt.dayTitle(parseISO(day.date))}</h2><span class="chip">${day.lessons.filter((l) => l.change?.type !== 'cancel').length} ${plural(day.lessons.filter((l) => l.change?.type !== 'cancel').length, 'пара', 'пары', 'пар')}</span></div>${dayList(day)}</section>
    </div>
    <div class="week-grid">${days.slice(0, 6).map((d) => {
      const dd = parseISO(d.date);
      return `<div class="col ${d.date === todayISO() ? 'today' : ''}"><h3>${fmt.wd(dd).toUpperCase()} <small>${fmt.dmShort(dd)}</small></h3>
        ${d.lessons.length ? d.lessons.map((l) => `<div class="wl ${kindClass(l.kind)} ${l.change?.type === 'cancel' ? 'cancel' : l.change?.type === 'retake' ? '' : l.change ? 'changed' : ''}" title="${esc(l.change ? changeLabel(l.change) : '')}">
          <div class="faint">${l.pair} · ${l.start}–${l.end}</div><b>${esc(l.subject)}</b><div class="faint">${esc(l.kind)} · ${esc(l.room)}</div>${l.teacher ? `<div class="faint">${esc(l.teacher)}</div>` : ''}
          ${l.change ? `<div class="xs" style="color:${['cancel', 'retake'].includes(l.change.type) ? 'var(--bad)' : 'var(--warn)'};font-weight:800;margin-top:2px">${esc(changeLabel(l.change))}</div>` : ''}</div>`).join('') : '<div class="faint small" style="padding:8px 2px">Пар нет</div>'}</div>`;
    }).join('')}</div>
    <div class="legend"><span><i class="sw lec"></i>лекция</span><span><i class="sw prac"></i>семинар</span><span><i class="sw oth"></i>консультация</span><span><i class="sw" style="background:var(--warn)"></i>изменение</span><span><i class="sw" style="background:var(--bad)"></i>пересдача</span></div>
  </div>`;
  ctx.el.querySelectorAll('.week-strip [data-date]').forEach((b) => b.onclick = () => { history.replaceState(null, '', `#/schedule/${b.dataset.date}`); ctx.params.date = b.dataset.date; render(ctx); });
}
