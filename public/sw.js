// Сервис-воркер: кэширует оболочку приложения, чтобы кабинет открывался мгновенно
// и показывал понятное сообщение без сети. Данные API НЕ кэшируются (персональные).
const CACHE = 'orbita-shell-v15';
const SHELL = ['/', '/app.css', '/js/boot.js', '/logo.svg', '/js/app.js', '/js/lib.js', '/js/icons.js',
  '/js/views/today.js', '/js/views/schedule.js', '/js/views/grades.js', '/js/views/requests.js',
  '/js/views/notifications.js', '/js/views/profile.js', '/js/views/staff.js', '/js/views/assistant.js', '/js/views/palette.js', '/js/views/campus.js', '/js/views/events.js', '/js/views/teacher.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/verify') || url.pathname.startsWith('/lite')) return;
  // Сначала сеть (свежая версия), при отсутствии сети — кэш
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});
