// Профиль: студенческий, личные данные (скрыты по умолчанию), безопасность и устройства.
import { api, esc, icon, fmt, toast, initials } from '../lib.js';
import { logout, setLook, applyLook, ACCENTS } from '../app.js';

export async function render(ctx) {
  ctx.setTitle('Профиль');
  const u = ctx.state.user;
  const sec = await api('/security');
  if (!ctx.isCurrent()) return;
  const isStudent = u.role === 'student';
  const masked = (v) => `<span class="masked" data-mask tabindex="0" role="button" aria-label="Показать">${esc(v || '—')}</span>`;
  const LOG = { login: 'Вход', login_failed: 'Неудачная попытка входа', password_changed: 'Смена пароля', sessions_revoked: 'Завершение сеансов' };

  ctx.el.innerHTML = `<div class="page grid c2" style="align-items:start">
    <div class="stack">
      ${isStudent ? `<section class="id-card"><div class="row" style="gap:14px;position:relative;z-index:1"><div class="avatar" style="background:rgba(255,255,255,.2)">${esc(initials(u))}</div>
        <div><div class="xs" style="opacity:.8;font-weight:800;letter-spacing:.08em">СТУДЕНЧЕСКИЙ · ГОРИЗОНТ</div><h2 style="font-size:20px">${esc(u.last_name)} ${esc(u.first_name)}<br>${esc(u.middle_name || '')}</h2></div></div>
        <dl class="kv" style="margin-top:16px;position:relative;z-index:1">
          <dt>Факультет</dt><dd>${esc(u.faculty)}</dd>
          <dt>Направление</dt><dd>${esc(u.program_code)} ${esc(u.program)}</dd>
          <dt>Профиль</dt><dd>${esc(u.profile || '—')}</dd>
          <dt>Курс и группа</dt><dd>${u.course} курс · ${esc(u.group)}</dd>
          <dt>Форма</dt><dd>${esc(u.study_form)}, ${esc(u.funding.toLowerCase())}</dd></dl></section>
      <section class="card"><div class="card-h"><h2>Личные данные</h2><span class="chip">${icon('lock', 'sm')} зашифрованы</span></div>
        <dl class="kv"><dt>Зачетная книжка</dt><dd>${masked(u.record_book)}</dd><dt>E-mail</dt><dd>${masked(u.email)}</dd><dt>Телефон</dt><dd>${masked(u.phone)}</dd>
        <dt>Дата рождения</dt><dd>${masked(u.birth_date ? new Date(u.birth_date).toLocaleDateString('ru-RU') : '')}</dd><dt>Куратор</dt><dd>${esc(u.curator || '—')}</dd>${u.funding === 'Бюджет' ? `<dt>Стипендия</dt><dd>${esc(u.stipend || '—')}</dd>` : ''}</dl>
        <p class="xs faint" style="margin-top:10px">Нажмите на скрытое поле, чтобы показать. В базе эти данные хранятся в зашифрованном виде (AES-256-GCM).</p></section>`
      : `<section class="card"><div class="profile-head"><div class="avatar">${esc(initials(u))}</div><div><h2>${esc(u.last_name)} ${esc(u.first_name)} ${esc(u.middle_name || '')}</h2><p class="muted">${esc(u.position || 'Сотрудник деканата')}</p></div></div></section>`}
      <section class="card" id="look"><h2 style="font-size:17px;margin-bottom:12px">Оформление</h2>
        <div class="field"><span class="lbl">Световая схема</span><div class="seg" role="radiogroup" aria-label="Световая схема">${[['light', 'sun', 'Светлая'], ['dark', 'moon', 'Темная'], ['auto', 'monitor', 'Как в системе']].map(([k, i, t]) => `<button type="button" role="radio" data-scheme="${k}">${icon(i, 'sm')} ${t}</button>`).join('')}</div></div>
        <a class="li" href="/lite" style="padding:8px 0 14px;border:0;min-height:0"><div class="ico">${icon('lite')}</div><div class="grow"><div class="t">Облегченная версия</div><div class="s">Без анимаций и скриптов — для медленного интернета</div></div>${icon('chevronRight')}</a>
        <div class="field" style="margin:0"><span class="lbl">Акцентный цвет</span><div class="swatches" role="radiogroup" aria-label="Акцентный цвет">${ACCENTS.map(([k, c, t]) => `<button type="button" role="radio" data-accent="${k}" title="${t}" aria-label="${t}" style="background:${c}"></button>`).join('')}</div></div></section>
      <section class="card pad-0"><div class="list">
        ${isStudent ? `<a class="li" href="/api/schedule.ics" download><div class="ico info">${icon('calendarPlus')}</div><div class="grow"><div class="t">Расписание в календарь телефона</div><div class="s">Файл .ics на 4 недели</div></div>${icon('download')}</a>` : ''}
        <button class="li" id="logout"><div class="ico bad">${icon('logout')}</div><div class="grow"><div class="t">Выйти</div></div></button></div></section>
    </div>
    <div class="stack">
      <section class="card"><div class="card-h"><h2>Безопасность</h2>${icon('shield')}</div>
        <div class="section-title" style="margin-top:0">Активные сеансы · ${sec.sessions.length}</div>
        ${sec.sessions.map((s) => `<div class="row" style="padding:8px 0"><div class="li" style="padding:0;border:0;min-height:0"><div class="ico ${s.current ? 'ok' : ''}">${icon('monitor')}</div></div><div class="grow"><b>${esc(s.device)}</b> ${s.current ? '<span class="chip ok">это устройство</span>' : ''}<div class="xs faint">активность ${fmt.ago(s.last_seen)}</div></div></div>`).join('')}
        <div class="row wrap" style="margin-top:8px;gap:8px">${sec.sessions.length > 1 ? `<button class="btn sm ghost" id="revoke">${icon('logout', 'sm')} Выйти на других устройствах</button>` : ''}
          <button class="btn sm ghost" id="revoke-all" style="color:var(--bad)">${icon('logout', 'sm')} Выйти из всех сеансов</button></div>
        <div class="section-title">Последние события</div>
        ${sec.log.map((l) => `<div class="row small" style="padding:4px 0"><span class="grow ${l.action === 'login_failed' ? '' : 'muted'}" style="${l.action === 'login_failed' ? 'color:var(--bad);font-weight:700' : ''}">${esc(LOG[l.action] || l.action)}${l.detail && l.action === 'login' ? ` · ${esc(l.detail)}` : ''}</span><span class="xs faint">${fmt.ago(l.created_at.replace(' ', 'T') + 'Z')}</span></div>`).join('') || '<p class="small faint">Событий пока нет</p>'}
      </section>
      <form class="card" id="pwd" novalidate><h2 style="font-size:17px;margin-bottom:12px">Смена пароля</h2>
        <div class="field"><label for="cur">Текущий пароль</label><input class="input" id="cur" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="nw">Новый пароль</label><input class="input" id="nw" type="password" autocomplete="new-password" minlength="10"><span class="hint">От 10 символов, буквы и цифры. После смены вы выйдете на других устройствах.</span></div>
        <button class="btn ghost">Сменить пароль</button></form>
      <section class="card small muted"><b style="color:var(--text)">О прототипе</b><p style="margin-top:6px">«Орбита» — концепт для конкурса «Цифровой деканат будущего». Университет «Горизонт», люди и оценки вымышлены. Сервис не связан ни с одним реальным вузом.</p></section>
    </div></div>`;

  ctx.el.querySelectorAll('[data-mask]').forEach((m) => {
    const t = () => { m.classList.toggle('show'); m.setAttribute('aria-label', m.classList.contains('show') ? 'Скрыть' : 'Показать'); };
    m.onclick = t; m.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } };
  });
  const look = ctx.el.querySelector('#look');
  const paint = () => {
    const cur = applyLook();
    look.querySelectorAll('[data-scheme]').forEach((b) => { const on = b.dataset.scheme === cur.scheme; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    look.querySelectorAll('[data-accent]').forEach((b) => { const on = b.dataset.accent === cur.accent; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  };
  look.querySelectorAll('[data-scheme]').forEach((b) => b.onclick = () => { setLook({ scheme: b.dataset.scheme }); paint(); });
  look.querySelectorAll('[data-accent]').forEach((b) => b.onclick = () => { setLook({ accent: b.dataset.accent }); paint(); });
  paint();
  ctx.el.querySelector('#logout').onclick = logout;
  ctx.el.querySelector('#revoke')?.addEventListener('click', async () => {
    try { const r = await api('/security/revoke-others', { method: 'POST' }); toast(`Завершено сеансов: ${r.revoked}`); render(ctx); } catch (e) { toast(e.message, 'bad'); }
  });
  ctx.el.querySelector('#revoke-all').addEventListener('click', async () => {
    if (!confirm('Завершить все сеансы, включая этот? Войти нужно будет заново.')) return;
    try { await api('/security/revoke-all', { method: 'POST' }); location.hash = ''; location.reload(); } catch (e) { toast(e.message, 'bad'); }
  });
  ctx.el.querySelector('#pwd').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try { await api('/auth/password', { method: 'POST', body: { current: f.cur.value, next: f.nw.value } }); toast('Пароль изменен'); f.reset(); render(ctx); }
    catch (err) { toast(err.message, 'bad'); }
  };
}
