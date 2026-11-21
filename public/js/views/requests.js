// Заявки и справки: каталог услуг, форма по схеме с сервера, статус и переписка с деканатом.
import { api, esc, icon, fmt, parseISO, empty, statusChip, STATUS_META, toast, plural } from '../lib.js';

let catalogCache = null;
async function catalog(force) {
  if (!catalogCache || force) catalogCache = await api('/request-types');
  return catalogCache;
}

function track(r) {
  const m = STATUS_META[r.status];
  const tone = r.status === 'rejected' ? 'bad' : r.status === 'need_info' ? 'warn' : m.step === 3 ? 'ok' : '';
  return `<div class="status-track ${tone}" aria-hidden="true">${[1, 2, 3].map((s) => `<i class="${s <= m.step ? 'on' : ''}"></i>`).join('')}</div>`;
}
function reqCard(r) {
  const sub = r.status === 'need_info' ? '<b style="color:var(--warn)">Деканат ждет вашего ответа</b>'
    : r.status === 'ready' && r.has_document ? '<b style="color:var(--ok)">Документ можно скачать</b>'
    : r.status === 'ready' ? '<b style="color:var(--ok)">Готово</b>'
    : r.eta && !['done', 'rejected'].includes(r.status) ? `Плановый срок — ${fmt.dmShort(parseISO(r.eta))}` : `Обновлено ${fmt.ago(r.updated_at)}`;
  return `<a class="card" href="#/requests/${esc(r.id)}" style="color:var(--text);display:grid;gap:6px">
    <div class="row between" style="align-items:flex-start"><b>${esc(r.title)}</b>${statusChip(r)}</div>
    ${track(r)}<div class="row between small"><span class="muted">${sub}</span><span class="faint xs">${esc(r.id)}</span></div></a>`;
}

export async function renderList(ctx) {
  ctx.setTitle('Заявки и справки');
  const list = await api('/requests');
  if (!ctx.isCurrent()) return;
  const active = list.filter((r) => !['done', 'rejected'].includes(r.status));
  const closed = list.filter((r) => ['done', 'rejected'].includes(r.status));
  const types = await catalog();
  ctx.el.innerHTML = `<div class="page stack">
    <a class="card row" href="#/requests/new" style="background:var(--grad);color:#fff;border:0">
      <div class="grow"><b style="font-size:17px">Новая заявка</b><div class="small" style="opacity:.9">Справки, заявления, запись на прием — ${types.length} ${plural(types.length, 'услуга', 'услуги', 'услуг')}</div></div>
      <span class="icon-btn" style="background:rgba(255,255,255,.2);color:#fff">${icon('plus')}</span></a>
    <div class="section-title">Популярное</div>
    <div class="svc-grid">${types.filter((t) => t.popular).slice(0, 3).map((t) => svcTile(t)).join('')}</div>
    <div class="section-title">Активные · ${active.length}</div>
    ${active.length ? `<div class="grid c2">${active.map(reqCard).join('')}</div>` : `<div class="card">${empty('inbox', 'Активных заявок нет', 'Когда вы что-то закажете, статус появится здесь — и придет уведомление, когда будет готово.')}</div>`}
    ${closed.length ? `<div class="section-title">Архив · ${closed.length}</div><div class="grid c2">${closed.map(reqCard).join('')}</div>` : ''}
  </div>`;
}

const svcTile = (t) => `<a class="svc" href="#/requests/new/${t.id}"><span class="ico">${icon(t.icon)}</span><b>${esc(t.title)}</b>
  ${t.instant || t.instant_if ? `<span class="fast">${icon('sparkles', 'sm')} сразу</span>` : `<small>до ${t.sla_days} ${plural(t.sla_days, 'рабочего дня', 'рабочих дней', 'рабочих дней')}</small>`}</a>`;

export async function renderNew(ctx) {
  if (ctx.params.type) return renderForm(ctx);
  ctx.setTitle('Новая заявка', '#/requests');
  const types = await catalog(true);
  if (!ctx.isCurrent()) return;
  const groups = [...new Set(types.map((t) => t.group))];
  ctx.el.innerHTML = `<div class="page stack">
    <div class="field" style="margin:0"><label class="sr-only" for="svc-q">Поиск услуги</label><input class="input" id="svc-q" placeholder="Найти: справка, пересдача, отпуск…" autocomplete="off"></div>
    <div id="svc-list">${groups.map((g) => `<div class="svc-group"><div class="section-title">${esc(g)}</div><div class="svc-grid">${types.filter((t) => t.group === g).map(svcTile).join('')}</div></div>`).join('')}</div>
    <p class="small faint" style="text-align:center">Не нашли нужное? <a href="#/requests/new/question">Задайте вопрос деканату</a></p></div>`;
  const q = ctx.el.querySelector('#svc-q');
  q.oninput = () => {
    const v = q.value.trim().toLowerCase();
    ctx.el.querySelectorAll('.svc').forEach((a) => { a.hidden = v && !a.textContent.toLowerCase().includes(v); });
    ctx.el.querySelectorAll('.svc-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('.svc')].some((a) => !a.hidden); });
  };
}

function fieldHtml(f, values) {
  const v = values[f.name] ?? f.default ?? '';
  const id = `f-${f.name}`;
  const req = f.required ? ' <span style="color:var(--accent)" aria-hidden="true">*</span>' : '';
  let ctrl;
  switch (f.type) {
    case 'select':
      ctrl = f.options.length ? `<select class="input" id="${id}" name="${f.name}" ${f.required ? 'required' : ''}><option value="">Выберите…</option>${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : '<div class="small muted">Нет вариантов для выбора</div>';
      break;
    case 'segmented':
      ctrl = `<div class="seg" role="radiogroup" aria-label="${esc(f.label)}">${f.options.map((o) => `<button type="button" role="radio" aria-checked="${o.value === v}" class="${o.value === v ? 'on' : ''}" data-seg="${f.name}" data-val="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div><input type="hidden" name="${f.name}" value="${esc(v)}">`;
      break;
    case 'textarea': ctrl = `<textarea class="input" id="${id}" name="${f.name}" maxlength="${f.maxLength || 500}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`; break;
    case 'number': ctrl = `<input class="input" id="${id}" name="${f.name}" type="number" inputmode="numeric" min="${f.min}" max="${f.max}" value="${esc(v)}">`; break;
    case 'date': ctrl = `<input class="input" id="${id}" name="${f.name}" type="date" value="${esc(v)}">`; break;
    case 'slot': {
      const first = f.slots[0];
      ctrl = `<div class="slots"><div class="slot-days">${f.slots.map((d, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-day="${d.date}">${fmt.wd(parseISO(d.date))}, ${fmt.dmShort(parseISO(d.date))}</button>`).join('')}</div>
        <div class="slot-times" data-times>${slotTimes(first, v)}</div></div><input type="hidden" name="${f.name}" value="${esc(v)}">`;
      break;
    }
    default: ctrl = `<input class="input" id="${id}" name="${f.name}" maxlength="${f.maxLength || 200}" placeholder="${esc(f.placeholder || '')}" value="${esc(v)}">`;
  }
  return `<div class="field" data-field="${f.name}" ${f.showIf ? `data-showif='${esc(JSON.stringify(f.showIf))}'` : ''}>
    ${f.type === 'segmented' || f.type === 'slot' ? `<span class="lbl">${esc(f.label)}${req}</span>` : `<label for="${id}">${esc(f.label)}${req}</label>`}${ctrl}<div class="err" aria-live="polite"></div></div>`;
}
const slotTimes = (day, v) => day.times.map((t) => `<button type="button" ${t.free ? '' : 'disabled'} data-slot="${day.date}T${t.time}" class="${`${day.date}T${t.time}` === v ? 'on' : ''}" aria-label="${t.time}${t.free ? '' : ', занято'}">${t.time}</button>`).join('');

async function renderForm(ctx) {
  const types = await catalog(true);
  if (!ctx.isCurrent()) return;
  const t = types.find((x) => x.id === ctx.params.type);
  if (!t) { ctx.setTitle('Заявка', '#/requests/new'); ctx.el.innerHTML = `<div class="page card">${empty('alert', 'Такой услуги нет', '', '<a class="btn soft sm" href="#/requests/new">К списку услуг</a>')}</div>`; return; }
  ctx.setTitle(t.title, '#/requests/new');
  const draftKey = `orbita-draft-${t.id}`;
  let values = {};
  try { values = JSON.parse(sessionStorage.getItem(draftKey) || '{}'); } catch { values = {}; }

  ctx.el.innerHTML = `<div class="page grid c2" style="align-items:start">
    <form class="card" id="req-form" novalidate>
      <div class="row" style="margin-bottom:14px"><span class="ico" style="width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand)">${icon(t.icon)}</span>
        <div class="grow"><b style="font-size:17px">${esc(t.title)}</b><div class="small muted">${esc(t.description)}</div></div></div>
      ${t.fields.map((f) => fieldHtml(f, values)).join('')}
      <button class="btn grad block" type="submit" id="submit">${icon('send')} Отправить</button>
      ${t.statement ? `<a class="btn ghost block" style="margin-top:8px" href="/api/statements/${t.id}.pdf" target="_blank" rel="noopener">${icon('printer')} Пустой бланк заявления (PDF)</a>` : ''}
      <p class="xs faint" style="margin-top:10px;text-align:center">Черновик сохраняется на этом устройстве, пока вы не отправите заявку</p>
    </form>
    <aside class="card"><b>${icon('info', 'sm')} Как это работает</b>
      <ol class="small muted" style="padding-left:18px;margin:8px 0 0;display:grid;gap:6px">
        <li>Вы отправляете заявку — она сразу попадает к специалисту деканата.</li>
        <li>Статус меняется у вас на глазах, на каждом шаге приходит уведомление.</li>
        <li>Если нужны уточнения — деканат напишет в переписку по заявке.</li>
        <li>${t.instant || t.instant_if ? 'Электронные документы готовы сразу и проверяются по QR-коду.' : `Плановый срок — до ${t.sla_days} рабочих дней.`}</li></ol></aside></div>`;

  const form = ctx.el.querySelector('#req-form');
  const read = () => Object.fromEntries(new FormData(form).entries());
  const applyShowIf = () => {
    const v = read();
    form.querySelectorAll('[data-showif]').forEach((el) => { const cond = JSON.parse(el.dataset.showif); el.hidden = Object.entries(cond).some(([k, x]) => v[k] !== x); });
    const sub = form.querySelector('#submit');
    const instant = t.instant || (t.instant_if && Object.entries(t.instant_if).every(([k, x]) => v[k] === x));
    sub.innerHTML = t.id === 'appointment' ? `${icon('check')} Записаться` : instant ? `${icon('sparkles')} Получить сразу` : `${icon('send')} Отправить в деканат`;
  };
  const saveDraft = () => { try { sessionStorage.setItem(draftKey, JSON.stringify(read())); } catch { /* нет хранилища */ } };
  form.addEventListener('input', () => { saveDraft(); applyShowIf(); });
  form.querySelectorAll('[data-seg]').forEach((b) => b.onclick = () => {
    form.querySelectorAll(`[data-seg="${b.dataset.seg}"]`).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    form.querySelector(`input[name="${b.dataset.seg}"]`).value = b.dataset.val; saveDraft(); applyShowIf();
  });
  const slotField = t.fields.find((f) => f.type === 'slot');
  if (slotField) {
    const bindTimes = () => form.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => {
      form.querySelectorAll('[data-slot]').forEach((x) => x.classList.toggle('on', x === b));
      form.querySelector(`input[name="${slotField.name}"]`).value = b.dataset.slot;
    });
    form.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => {
      form.querySelectorAll('[data-day]').forEach((x) => x.classList.toggle('on', x === b));
      form.querySelector('[data-times]').innerHTML = slotTimes(slotField.slots.find((d) => d.date === b.dataset.day), form.querySelector(`input[name="${slotField.name}"]`).value);
      bindTimes();
    });
    bindTimes();
  }
  applyShowIf();

  form.onsubmit = async (e) => {
    e.preventDefault();
    form.querySelectorAll('.err').forEach((x) => { x.textContent = ''; });
    form.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
    form.querySelector('.form-error')?.remove();
    const btn = form.querySelector('#submit');
    btn.disabled = true; const label = btn.innerHTML; btn.innerHTML = `${icon('loader', 'spin')} Отправляем…`;
    try {
      const r = await api('/requests', { method: 'POST', body: { type: t.id, fields: read() } });
      try { sessionStorage.removeItem(draftKey); } catch { /* ок */ }
      showSuccess(ctx, t, r);
    } catch (err) {
      btn.disabled = false; btn.innerHTML = label;
      if (err.body?.fields) {
        for (const [k, msg] of Object.entries(err.body.fields)) {
          const f = form.querySelector(`[data-field="${k}"]`);
          if (f) { f.querySelector('.err').textContent = msg; f.querySelector('.input')?.classList.add('invalid'); }
        }
        form.querySelector('.invalid, [data-field] .err:not(:empty)')?.closest('[data-field]')?.querySelector('input,select,textarea,button')?.focus();
      }
      form.insertAdjacentHTML('afterbegin', `<div class="form-error" role="alert">${esc(err.message)}</div>`);
    }
  };
}

function showSuccess(ctx, t, r) {
  const instant = r.status === 'ready';
  ctx.el.innerHTML = `<div class="page"><div class="card success" style="max-width:520px;margin:0 auto">
    <div class="art">${icon('check')}</div>
    <h2>${r.duplicate ? 'Такая заявка уже есть' : instant ? (t.id === 'appointment' ? 'Вы записаны!' : 'Готово!') : 'Заявка отправлена'}</h2>
    <p class="muted">${r.duplicate ? 'Мы не стали создавать дубликат — откройте существующую.' : instant ? (t.id === 'appointment' ? 'Подтверждение и время приема — в карточке заявки. Мы напомним заранее.' : 'Документ уже сформирован. Его можно скачать или отправить по ссылке — подлинность проверяется по QR-коду.') : `Номер ${esc(r.id)}. Статус будет обновляться здесь, а когда все будет готово — придет уведомление.`}</p>
    <div class="row wrap" style="justify-content:center;margin-top:6px"><a class="btn" href="#/requests/${esc(r.id)}">Открыть заявку</a><a class="btn ghost" href="#/today">На главную</a></div></div></div>`;
  toast(instant ? 'Готово!' : 'Заявка отправлена');
}

export async function renderOne(ctx) {
  ctx.setTitle('Заявка', '#/requests');
  const r = await api(`/requests/${encodeURIComponent(ctx.params.id)}`);
  if (!ctx.isCurrent()) return;
  ctx.setTitle(r.title, '#/requests');
  const types = await catalog();
  const t = types.find((x) => x.id === r.type);
  const labelOf = (k) => t?.fields.find((f) => f.name === k)?.label || k;
  const valOf = (k, v) => {
    const f = t?.fields.find((x) => x.name === k);
    if (f?.type === 'segmented') return f.options.find((o) => o.value === v)?.label || v;
    if (f?.type === 'slot') return `${fmt.wd(parseISO(v))}, ${fmt.dm(parseISO(v))} в ${v.slice(11)}`;
    return v;
  };
  const canChat = !['done', 'rejected'].includes(r.status);
  const canCancel = ['submitted', 'need_info', 'in_progress'].includes(r.status) || (r.type === 'appointment' && r.status === 'ready');
  const evIcon = (e) => e.kind === 'message' ? 'message' : STATUS_META[e.status]?.ico || 'info';
  const evCls = (e) => e.kind === 'message' ? '' : e.status === 'rejected' ? 'bad' : e.status === 'need_info' ? 'warn' : ['ready', 'done'].includes(e.status) ? 'ok' : '';

  ctx.el.innerHTML = `<div class="page grid c2" style="align-items:start">
    <div class="stack">
      <section class="card"><div class="row between" style="align-items:flex-start"><div><div class="xs faint">${esc(r.id)} · от ${fmt.dateTime(r.created_at)}</div><h2 style="font-size:20px;margin-top:4px">${esc(r.title)}</h2></div>${statusChip(r)}</div>
        ${track(r)}
        <div class="row between xs faint"><span>Принята</span><span>В работе</span><span>${r.status === 'rejected' ? 'Отклонена' : 'Готово'}</span></div>
        ${r.status === 'need_info' ? `<div class="change-note warn" style="margin-top:12px;display:flex">${icon('message', 'sm')} Деканату нужно уточнение — ответьте в переписке ниже</div>` : ''}
        ${r.eta && !['ready', 'done', 'rejected'].includes(r.status) ? `<p class="small muted" style="margin-top:10px">${icon('clock', 'sm')} Плановый срок: <b>${fmt.dm(parseISO(r.eta))}</b>${r.assignee ? ` · ответственный: ${esc(r.assignee)}` : ''}</p>` : ''}
        ${r.has_document ? `<div class="row wrap" style="margin-top:14px"><a class="btn" href="/api/requests/${esc(r.id)}/document" target="_blank" rel="noopener">${icon('download')} Открыть документ</a></div>` : ''}
        ${r.statement ? `<div class="row wrap" style="margin-top:14px"><a class="btn ghost" href="/api/statements/${esc(r.type)}.pdf?request=${encodeURIComponent(r.id)}" target="_blank" rel="noopener">${icon('printer')} Заявление в PDF</a><span class="xs faint">Скачайте, распечатайте и подпишите</span></div>` : ''}
        ${['ready', 'done'].includes(r.status) ? `<hr class="sep"><div class="row between wrap"><span class="small muted">Как вам скорость и качество?</span><div class="stars" role="radiogroup" aria-label="Оценка">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${n}" class="${r.rating >= n ? 'on' : ''}" aria-label="${n} из 5">★</button>`).join('')}</div></div>` : ''}
      </section>
      <section class="card"><h2 style="font-size:17px;margin-bottom:10px">Данные заявки</h2>
        <dl class="kv">${Object.entries(r.payload).map(([k, v]) => `<dt>${esc(labelOf(k))}</dt><dd>${esc(valOf(k, v))}</dd>`).join('') || '<dt>—</dt><dd></dd>'}</dl>
        ${canCancel ? `<button class="btn sm danger" id="cancel" style="margin-top:14px">${icon('x', 'sm')} ${r.type === 'appointment' ? 'Отменить запись' : 'Отозвать заявку'}</button>` : ''}</section>
    </div>
    <section class="card"><h2 style="font-size:17px;margin-bottom:12px">История и переписка</h2>
      <div class="timeline">${r.events.map((e) => `<div class="ev ${evCls(e)}"><div class="pt">${icon(evIcon(e))}</div><div>
        <div class="small"><b>${e.kind === 'message' ? esc(e.author_role === 'student' ? 'Вы' : e.author_name || 'Деканат') : esc(e.status_label)}</b> <span class="faint xs">· ${fmt.ago(e.created_at)}${e.kind === 'status' && e.author_name ? ` · ${esc(e.author_name)}` : ''}</span></div>
        ${e.text ? `<div class="bubble ${e.author_role === 'student' ? 'mine' : ''}">${esc(e.text)}</div>` : ''}</div></div>`).join('')}</div>
      ${canChat ? `<form class="composer" id="chat"><label class="sr-only" for="msg">Сообщение</label><textarea class="input" id="msg" maxlength="2000" placeholder="${r.status === 'need_info' ? 'Ответьте на вопрос деканата…' : 'Написать в деканат…'}"></textarea><button class="btn" aria-label="Отправить">${icon('send')}</button></form>` : '<p class="small faint">Заявка закрыта. Если остались вопросы — создайте новое обращение.</p>'}
    </section></div>`;

  const chat = ctx.el.querySelector('#chat');
  if (chat) {
    const ta = chat.querySelector('textarea');
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) chat.requestSubmit(); });
    chat.onsubmit = async (e) => {
      e.preventDefault();
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      const b = chat.querySelector('button'); b.disabled = true;
      try { await api(`/requests/${encodeURIComponent(r.id)}/messages`, { method: 'POST', body: { text } }); toast('Сообщение отправлено'); renderOne(ctx); }
      catch (err) { toast(err.message, 'bad'); b.disabled = false; }
    };
  }
  ctx.el.querySelector('#cancel')?.addEventListener('click', async () => {
    if (!confirm(r.type === 'appointment' ? 'Отменить запись на прием?' : 'Отозвать заявку? Это действие нельзя отменить.')) return;
    try { await api(`/requests/${encodeURIComponent(r.id)}/cancel`, { method: 'POST' }); toast('Готово'); renderOne(ctx); } catch (err) { toast(err.message, 'bad'); }
  });
  ctx.el.querySelectorAll('[data-rate]').forEach((b) => b.onclick = async () => {
    try { await api(`/requests/${encodeURIComponent(r.id)}/rate`, { method: 'POST', body: { rating: Number(b.dataset.rate) } }); ctx.el.querySelectorAll('[data-rate]').forEach((x) => x.classList.toggle('on', Number(x.dataset.rate) <= Number(b.dataset.rate))); toast('Спасибо за оценку!'); }
    catch (err) { toast(err.message, 'bad'); }
  });
}
