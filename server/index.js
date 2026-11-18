process.env.TZ = process.env.TZ || 'Europe/Moscow';
const path = require('path');
const express = require('express');
const config = require('./config');
const { open } = require('./db');
const { seed } = require('./seed');
const { createAuth } = require('./auth');
const { createApi } = require('./api');
const D = require('./documents');

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const auth = createAuth(db);

  // Заголовки безопасности: запрет встраивания, строгий CSP без inline-скриптов
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use(express.json({ limit: '32kb' }));
  app.use(auth.loadSession);

  // Защита от CSRF: изменяющие запросы принимаются только от нашего фронтенда
  // (собственный заголовок нельзя отправить с чужого сайта без CORS, а CORS мы не разрешаем)
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.get('X-Orbita') !== '1') return res.status(403).json({ error: 'Запрос отклонен' });
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', createApi(db, auth));

  app.get('/verify/:code', (req, res) => res.type('html').send(D.renderVerify(db, String(req.params.code).toUpperCase())));
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use(express.static(path.join(__dirname, '..', 'public'), {
    setHeaders(res, p) {
      if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (p.includes(`${path.sep}fonts${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'public, max-age=300');
    },
  }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'Некорректный запрос' });
    console.error(err);
    res.status(500).json({ error: 'Что-то пошло не так. Мы уже разбираемся.' });
  });
  return app;
}

function initDb(file) {
  const db = open(file);
  const n = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (n === 0) { seed(db); console.log('База заполнена демо-данными'); }
  return db;
}

if (require.main === module) {
  const db = initDb();
  createApp(db).listen(config.PORT, () => {
    console.log(`Орбита запущена: http://localhost:${config.PORT}  (ИИ: ${config.AI_ENABLED ? 'Claude' : 'локальный режим'})`);
  });
}

module.exports = { createApp, initDb };
