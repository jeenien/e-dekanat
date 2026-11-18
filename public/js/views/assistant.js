// «Спроси Орбиту» — чат-помощник. Ключ ИИ хранится только на сервере, браузер его не видит.
import { api, esc, icon, sheet, todayISO } from '../lib.js';

const history = [];
const SUGGEST = ['Что у меня завтра?', 'Как дела с допуском к экзаменам?', 'Какие дедлайны горят?', 'Нужна справка для военкомата', 'Сохраню ли я стипендию?', 'Где находится деканат?'];

function msgHtml(m) {
  return `<div class="msg ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.text)}${m.actions?.length ? `<div class="acts">${m.actions.map((a) => `<a class="btn sm ${m.role === 'user' ? 'ghost' : 'soft'}" href="${esc(a.href)}" data-close>${esc(a.label)}</a>`).join('')}</div>` : ''}</div>`;
}

export function openAssistant(state) {
  sheet(`<div class="sheet-h"><span class="ico" style="width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--grad);color:#fff">${icon('sparkles', 'sm')}</span>
      <h2>Спроси Орбиту</h2><span class="chip ${state.ai ? 'brand' : ''}" title="${state.ai ? 'Ответы генерирует Claude на сервере' : 'Ключ ИИ не задан — работает встроенный режим на правилах'}">${state.ai ? 'Claude' : 'Без ИИ-ключа'}</span>
      <button class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
    <div class="chat" id="chat" aria-live="polite">${history.length ? history.map(msgHtml).join('') : msgHtml({ role: 'bot', text: `Привет, ${state.user.first_name}! Я знаю ваше расписание, баллы, дедлайны и порядки деканата. Спросите что-нибудь 👇` })}</div>
    <div class="suggest">${SUGGEST.map((s) => `<button type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <form class="composer" id="ask"><label class="sr-only" for="q">Ваш вопрос</label><textarea class="input" id="q" maxlength="800" placeholder="Например: когда экзамен по базам данных?" autofocus></textarea><button class="btn grad" aria-label="Спросить">${icon('send')}</button></form>
    <p class="xs faint" style="margin-top:8px">Помощник видит только ваши учебные данные. ФИО и контакты в ИИ не передаются. Ответы могут быть неточными — важное уточняйте в деканате.</p>`,
  { label: 'Помощник Орбита', onMount(box) {
    const chat = box.querySelector('#chat');
    const form = box.querySelector('#ask');
    const ta = box.querySelector('#q');
    chat.scrollTop = chat.scrollHeight;
    const ask = async (text) => {
      text = text.trim(); if (!text) return;
      history.push({ role: 'user', text });
      chat.insertAdjacentHTML('beforeend', msgHtml({ role: 'user', text }));
      chat.insertAdjacentHTML('beforeend', '<div class="msg bot" id="typing"><span class="typing"><i></i><i></i><i></i></span></div>');
      chat.scrollTop = chat.scrollHeight;
      ta.value = ''; form.querySelector('button').disabled = true;
      try {
        const r = await api('/assistant', { method: 'POST', body: { text, date: todayISO(), history: history.slice(-7, -1).map(({ role, text: t }) => ({ role, text: t })) } });
        const m = { role: 'assistant', text: r.answer, actions: r.actions };
        history.push(m);
        chat.querySelector('#typing')?.remove();
        chat.insertAdjacentHTML('beforeend', msgHtml(m));
      } catch (e) {
        chat.querySelector('#typing')?.remove();
        chat.insertAdjacentHTML('beforeend', `<div class="msg bot" style="color:var(--bad)">${esc(e.message)}</div>`);
      }
      form.querySelector('button').disabled = false;
      chat.scrollTop = chat.scrollHeight;
      ta.focus();
    };
    form.onsubmit = (e) => { e.preventDefault(); ask(ta.value); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(ta.value); } });
    box.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => ask(b.dataset.q));
  } });
}
