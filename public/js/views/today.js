// «Сегодня» — главный экран: что сейчас, что дальше, что горит.
import { api, esc, icon, fmt, parseISO, todayISO, minutes, empty, plural, statusChip, STATUS_META, kindClass, toast } from '../lib.js';
import { lessonHtml, changeLabel } from './schedule.js';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

// Карточка «Сейчас / Далее»: считает по реальному времени
function nowCard(today, nextDays) {
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const active = today.lessons.filter((l) => l.change?.type !== 'cancel');
  const cur = active.find((l) => minutes(l.start) <= nowM && nowM < minutes(l.end));
  const next = active.find((l) => minutes(l.start) > nowM);
  if (cur) {
    const p = Math.round((nowM - minutes(cur.start)) / (minutes(cur.end) - minutes(cur.start)) * 100);
    return `<div class="card now-card"><div class="row between"><span class="lbl">Идёт сейчас · ${cur.pair} пара</span><span class="chip">до ${cur.end}</span></div>
      <h3>${esc(cur.subject)}</h3><div class="meta"><span>${icon('map', 'sm')} ${esc(cur.room)}</span><span>${icon('teacher', 'sm')} ${esc(cur.teacher)}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>
      ${next ? `<p class="small" style="margin-top:10px;opacity:.9">Дальше: ${esc(next.subject)} в ${next.start}, ${esc(next.room)}</p>` : ''}</div>`;
  }
  if (next) {
    const mins = minutes(next.start) - nowM;
    const when = mins < 60 ? `через ${mins} мин` : `в ${next.start}`;
    return `<div class="card now-card"><div class="row between"><span class="lbl">Следующая пара · ${when}</span>${next.change ? `<span class="chip">${icon('alert', 'sm')} ${esc(changeLabel(next.change))}</span>` : ''}</div>
      <h3>${esc(next.subject)}</h3><div class="meta"><span>${icon('clock', 'sm')} ${next.start}–${next.end}</span><span>${icon('map', 'sm')} ${esc(next.room)}</span><span>${icon('teacher', 'sm')} ${esc(next.teacher)}</span></div>
      ${next.online_url ? `<p style="margin-top:12px"><a class="btn sm ghost" href="${esc(next.online_url)}" target="_blank" rel="noopener">${icon('monitor', 'sm')} Подключиться онлайн</a></p>` : ''}</div>`;
  }
  const nd = nextDays.find((d) => d.lessons.some((l) => l.change?.type !== 'cancel'));
  const first = nd?.lessons.find((l) => l.change?.type !== 'cancel');
  return `<div class="card now-card"><span class="lbl">${today.lessons.length ? 'Пары на сегодня закончились' : 'Сегодня пар нет'}</span>
    <h3>${first ? `${fmt.dayTitle(parseISO(nd.date))}: ${esc(first.subject)}` : 'Ближайших занятий нет'}</h3>
    ${first ? `<div class="meta"><span>${icon('clock', 'sm')} ${first.start}</span><span>${icon('map', 'sm')} ${esc(first.room)}</span><span>${nd.lessons.length} ${plural(nd.lessons.length, 'пара', 'пары', 'пар')}</span></div>` : ''}</div>`;
}

export function deadlineList(list, compact = false) {
  if (!list.length) return empty('checkCircle', 'Дедлайнов нет', 'Новые задания появятся здесь автоматически.');
  return `<div>${list.map((d) => {
    const urgent = !d.done && new Date(d.due_at) - Date.now() < 48 * 3600e3;
    return `<div class="dl ${d.done ? 'done' : ''}"><button class="check ${d.done ? 'on' : ''}" data-dl="${d.id}" aria-pressed="${d.done}" aria-label="${d.done ? 'Отметить невыполненным' : 'Отметить выполненным'}: ${esc(d.title)}">${d.done ? icon('check', 'sm') : ''}</button>
      <div class="grow"><div class="t">${esc(d.title)}</div><div class="s">${esc(d.discipline)}</div></div>
      <div style="text-align:right"><span class="chip ${d.done ? 'ok' : urgent ? 'bad' : ''}">${d.done ? 'готово' : esc(fmt.until(d.due_at))}</span>${compact ? '' : `<div class="xs faint" style="margin-top:4px">${esc(fmt.dateTime(d.due_at))}</div>`}</div></div>`;
  }).join('')}</div>`;
}
export function bindDeadlines(root, onChange) {
  root.querySelectorAll('[data-dl]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { const r = await api(`/deadlines/${b.dataset.dl}/toggle`, { method: 'POST' }); toast(r.done ? 'Отмечено как выполненное 🎉' : 'Возвращено в список'); onChange?.(); }
    catch (e) { toast(e.message, 'bad'); b.disabled = false; }
  });
}

export async function render(ctx) {
  ctx.setTitle('Сегодня');
  const d = await api(`/dashboard?date=${todayISO()}`);
  if (!ctx.isCurrent()) return;
  const u = ctx.state.user;
  const today = d.today;
  const t = parseISO(today.date);
  const activeChanges = d.changes.filter((c) => c.date >= today.date);
  const g = d.grades;

  ctx.el.innerHTML = `<div class="page stack">
    <div class="hello"><h2>${greeting()}, ${esc(u.first_name)}!</h2>
      <p>${fmt.wdFull(t)[0].toUpperCase() + fmt.wdFull(t).slice(1)}, ${fmt.dm(t)} · ${today.week}-я неделя, ${today.parity === 'odd' ? 'нечётная' : 'чётная'}</p></div>
    ${activeChanges.length ? `<a class="card row" href="#/schedule" style="background:var(--warn-soft);border-color:transparent;color:var(--text)">
      <div class="ico" style="color:var(--warn)">${icon('alert', 'lg')}</div><div class="grow"><b>${activeChanges.length} ${plural(activeChanges.length, 'изменение', 'изменения', 'изменений')} в расписании</b>
      <div class="small muted">${activeChanges.slice(0, 2).map((c) => `${fmt.dmShort(parseISO(c.date))}: ${esc(changeLabel(c.change))} — ${esc(c.subject)}`).join(' · ')}</div></div>${icon('chevronRight')}</a>` : ''}
    <div class="grid dash">
      <div class="stack">
        ${nowCard(today, d.next_days)}
        <nav class="quick" aria-label="Быстрые действия">
          <a href="#/requests/new/study_cert"><span class="ico">${icon('docs')}</span>Справка за минуту</a>
          <a href="#/requests/new/appointment"><span class="ico">${icon('clock')}</span>Запись в деканат</a>
          <a href="#/grades"><span class="ico">${icon('trend')}</span>Мои баллы</a>
          <a href="#/requests/new/question"><span class="ico">${icon('message')}</span>Вопрос деканату</a>
        </nav>
        <section class="card"><div class="card-h"><h2>Пары сегодня</h2><a href="#/schedule">Вся неделя ${icon('chevronRight', 'sm')}</a></div>
          ${today.lessons.length ? `<div class="day">${today.lessons.map((l) => lessonHtml(l, today.date)).join('')}</div>` : empty('coffee', 'Сегодня свободный день', 'Можно заняться дедлайнами или отдохнуть.')}</section>
        <section class="card"><div class="card-h"><h2>Дедлайны</h2><span class="chip">${d.deadlines.filter((x) => !x.done).length} открыто</span></div><div id="dls">${deadlineList(d.deadlines, true)}</div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-h"><h2>Учёба</h2><a href="#/grades">Подробнее ${icon('chevronRight', 'sm')}</a></div>
          <div class="stat-row">
            <div class="stat"><b>${g.gpa ?? '—'}</b><span>${g.gpa ? 'средний балл' : 'сессий не было'}</span></div>
            <div class="stat"><b style="color:${g.risks ? 'var(--bad)' : 'var(--ok)'}">${g.risks}</b><span>в зоне риска</span></div>
            <div class="stat"><b style="color:${g.debts ? 'var(--bad)' : 'var(--ok)'}">${g.debts}</b><span>${plural(g.debts, 'долг', 'долга', 'долгов')}</span></div>
          </div>
          <div class="stipend ${g.stipend.level}" style="margin-top:10px;padding:12px"><div class="ico">${icon('wallet')}</div><div><b>Стипендия: ${esc(g.stipend.title)}</b><div class="small muted">${esc(g.stipend.text)}</div></div></div>
          ${d.session.exams[0] ? `<a class="li" href="#/grades/session" style="padding:12px 0 0;border:0;min-height:0"><div class="ico">${icon('target')}</div><div class="grow"><div class="t">${esc(d.session.name)}</div><div class="s">Первое испытание ${fmt.dmShort(parseISO(d.session.exams[0].date))} · ${fmt.until(d.session.exams[0].date)}</div></div>${icon('chevronRight')}</a>` : ''}
        </section>
        <section class="card pad-0"><div class="card-h" style="padding:16px 16px 0"><h2>Заявки</h2><a href="#/requests">Все ${icon('chevronRight', 'sm')}</a></div>
          ${d.requests.length ? `<div class="list">${d.requests.map((r) => `<a class="li" href="#/requests/${esc(r.id)}"><div class="ico ${STATUS_META[r.status].cls}">${icon(STATUS_META[r.status].ico)}</div><div class="grow"><div class="t ellipsis">${esc(r.title)}</div><div class="s">${r.status === 'need_info' ? 'Деканат ждёт ответа' : r.eta && !['ready', 'done', 'rejected'].includes(r.status) ? `Готово до ${fmt.dmShort(parseISO(r.eta))}` : fmt.ago(r.updated_at)}</div></div>${statusChip(r)}</a>`).join('')}</div>`
            : `<div style="padding:0 16px 8px">${empty('inbox', 'Активных заявок нет', 'Справку или заявление можно оформить за минуту.', '<a class="btn soft sm" href="#/requests/new">Оформить</a>')}</div>`}
        </section>
        <section class="card pad-0"><div class="card-h" style="padding:16px 16px 0"><h2>Новое</h2><a href="#/notifications">Лента ${icon('chevronRight', 'sm')}</a></div>
          ${d.notifications.latest.length ? `<div class="list">${d.notifications.latest.map((n) => `<a class="li" href="${n.link ? esc(n.link) : '#/notifications'}"><div class="ico ${n.category === 'deadline' ? 'bad' : n.category === 'schedule' ? 'warn' : n.category === 'request' ? 'ok' : 'info'}">${icon(n.category === 'deadline' ? 'flame' : n.category === 'schedule' ? 'calendar' : n.category === 'request' ? 'docs' : 'megaphone')}</div><div class="grow"><div class="t ellipsis">${esc(n.title)}</div><div class="s ellipsis">${esc(n.body)}</div></div></a>`).join('')}</div>`
            : `<div style="padding:0 16px 8px">${empty('bell', 'Всё прочитано', 'Новые объявления деканата появятся здесь.')}</div>`}
        </section>
      </div>
    </div></div>`;

  const reloadDl = async () => {
    const list = (await api('/deadlines')).filter((x) => new Date(x.due_at) > Date.now() - 864e5).slice(0, 6);
    const box = ctx.el.querySelector('#dls'); if (!box) return;
    box.innerHTML = deadlineList(list, true); bindDeadlines(box, reloadDl);
  };
  bindDeadlines(ctx.el.querySelector('#dls'), reloadDl);
}

export { kindClass };
