// Лента: объявления деканата, изменения расписания, статусы заявок и напоминания о дедлайнах.
import { api, esc, icon, fmt, empty, toast } from '../lib.js';
import { calendarButton, bindCalendarButtons } from './events.js';

const CATS = [['all', 'Все'], ['unread', 'Непрочитанные'], ['schedule', 'Расписание'], ['request', 'Заявки'], ['deadline', 'Дедлайны'], ['event', 'Мероприятия'], ['news', 'Новости']];
const CAT_META = { news: ['megaphone', 'info', 'Новость'], schedule: ['calendar', 'warn', 'Расписание'], deadline: ['flame', 'bad', 'Дедлайн'], request: ['docs', 'ok', 'Заявка'], event: ['calendarPlus', 'brand', 'Мероприятие'], grades: ['grades', 'accent', 'Учеба'], finance: ['wallet', 'ok', 'Финансы'] };

export async function render(ctx) {
  ctx.setTitle('Лента');
  let list = await api('/notifications');
  if (!ctx.isCurrent()) return;
  let filter = 'all';
  const isStudent = ctx.state.user.role === 'student';
  const draw = () => {
    const shown = list.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : n.category === filter || (filter === 'news' && ['finance', 'grades'].includes(n.category))));
    const unread = list.filter((n) => !n.read).length;
    ctx.el.innerHTML = `<div class="page stack">
      <div class="row between wrap"><div class="seg scroll" role="tablist" style="flex:1;min-width:0">${CATS.map(([k, t]) => `<button role="tab" aria-selected="${k === filter}" class="${k === filter ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}</div>
        ${unread ? `<button class="btn sm ghost" id="readall">${icon('check', 'sm')} Прочитать все</button>` : ''}</div>
      <section class="card pad-0">${shown.length ? shown.map((n) => {
        const [ic, cls, lbl] = CAT_META[n.category] || CAT_META.news;
        return `<article class="notif ${n.read ? '' : 'unread'}" data-id="${esc(n.id)}"><div class="li" style="padding:0;border:0;min-height:0"><div class="ico ${cls}">${icon(ic)}</div></div>
          <div class="grow"><div class="t">${n.pinned ? icon('pin', 'sm') + ' ' : ''}${esc(n.title)}</div><div class="b">${esc(n.body)}</div>
          <div class="meta"><span class="chip ${cls}">${lbl}</span>${n.important ? '<span class="chip accent">важно</span>' : ''}<span>${esc(n.author || '')}</span><span>${fmt.ago(n.created_at)}</span>
          ${n.link && !n.event_id ? `<a class="link" href="${esc(n.link)}" data-open="${esc(n.id)}">Перейти ${icon('arrowRight', 'sm')}</a>` : ''}</div>
          ${n.event_id ? `<div class="row wrap" style="margin-top:10px">${isStudent ? calendarButton(n.event_id, n.event_added) : ''}<a class="btn sm ghost" href="#/events/${n.event_id}">Подробнее ${icon('arrowRight', 'sm')}</a></div>` : ''}</div></article>`;
      }).join('') : `<div style="padding:8px 16px">${empty(filter === 'unread' ? 'checkCircle' : 'bell', filter === 'unread' ? 'Все прочитано' : 'Здесь пока пусто', filter === 'unread' ? 'Новые уведомления появятся здесь.' : 'Когда деканат что-то опубликует, вы увидите это первым.')}</div>`}</section></div>`;
    ctx.el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; draw(); });
    ctx.el.querySelector('#readall')?.addEventListener('click', async () => {
      try { await api('/notifications/read', { method: 'POST', body: { all: true } }); list = list.map((n) => ({ ...n, read: true })); draw(); ctx.refreshBadges(); toast('Все уведомления прочитаны'); }
      catch (e) { toast(e.message, 'bad'); }
    });
    bindCalendarButtons(ctx.el, async () => { list = await api('/notifications'); draw(); });
    ctx.el.querySelectorAll('.notif.unread').forEach((el) => el.addEventListener('click', () => markRead(el.dataset.id)));
  };
  const markRead = async (id) => {
    const n = list.find((x) => String(x.id) === id);
    if (!n || n.read) return;
    n.read = true;
    ctx.el.querySelector(`.notif[data-id="${CSS.escape(id)}"]`)?.classList.remove('unread');
    try { await api('/notifications/read', { method: 'POST', body: { ids: [id] } }); ctx.refreshBadges(); } catch { /* не критично */ }
  };
  draw();
}
