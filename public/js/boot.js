// Загружается раньше всего остального. Если кабинет не успел открыться за 4 секунды
// или соединение очень медленное, предлагает облегченную версию (/lite) — она работает без скриптов.
(function () {
  var shown = false;
  function show(reason) {
    if (shown || !document.body) return;
    try { if (sessionStorage.getItem('orbita-lite-dismissed')) return; } catch (e) { /* нет хранилища */ }
    shown = true;
    var bar = document.createElement('div');
    bar.id = 'lite-offer';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;z-index:100;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));max-width:460px;margin:0 auto;' +
      'background:#0f1a33;color:#fff;border-radius:16px;padding:12px 14px;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center';
    var text = document.createElement('span');
    text.style.flex = '1';
    text.textContent = reason || 'Сайт загружается медленно.';
    var go = document.createElement('a');
    go.href = '/lite';
    go.textContent = 'Облегченная версия';
    go.style.cssText = 'background:#fff;color:#0f1a33;border-radius:10px;padding:8px 12px;text-decoration:none;white-space:nowrap';
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Скрыть');
    close.textContent = '×';
    close.style.cssText = 'background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px';
    close.onclick = function () { bar.remove(); try { sessionStorage.setItem('orbita-lite-dismissed', '1'); } catch (e) { /* ок */ } };
    bar.appendChild(text); bar.appendChild(go); bar.appendChild(close);
    document.body.appendChild(bar);
  }
  window.orbitaOfferLite = show;
  window.orbitaReady = function () { window.__orbitaReady = true; var b = document.getElementById('lite-offer'); if (b && !b.dataset.keep) b.remove(); };
  var c = navigator.connection;
  if (c && (c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g')) {
    window.addEventListener('DOMContentLoaded', function () { show('Похоже, интернет медленный.'); var b = document.getElementById('lite-offer'); if (b) b.dataset.keep = '1'; });
  }
  setTimeout(function () { if (!window.__orbitaReady) show('Сайт загружается медленно.'); }, 4000);
})();
