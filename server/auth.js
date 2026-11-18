// Вход, сессии, роли. Токен сессии — случайные 256 бит в HttpOnly-cookie;
// в базе хранится только его SHA-256, поэтому утечка базы не дает войти в чужой кабинет.
const { verifyPassword, DUMMY_HASH, sha256, randomToken, hashPassword } = require('./security');
const { SESSION_TTL_MS, IS_PROD } = require('./config');

const COOKIE = IS_PROD ? '__Host-orbita_sid' : 'orbita_sid';

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function deviceLabel(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Устройство';
  const br = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'браузер';
  return `${br}, ${os}`;
}

// --- Ограничение попыток входа (в памяти; при нескольких серверах выносится в Redis) ---
const attempts = new Map();
const MAX_FAILS = 5, LOCK_MS = 10 * 60 * 1000;
function loginKey(ip, login) { return sha256(`${ip}|${String(login).toLowerCase()}`); }
function isLocked(key) {
  const a = attempts.get(key);
  if (!a) return 0;
  if (a.until && a.until > Date.now()) return Math.ceil((a.until - Date.now()) / 1000);
  if (a.until && a.until <= Date.now()) attempts.delete(key);
  return 0;
}
function registerFail(key) {
  const a = attempts.get(key) || { fails: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) { a.until = Date.now() + LOCK_MS; a.fails = 0; }
  attempts.set(key, a);
}

function createAuth(db) {
  const q = {
    userByLogin: db.prepare('SELECT * FROM users WHERE login = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at, device) VALUES (?,?,?,?,?,?)'),
    sessionByHash: db.prepare('SELECT s.*, u.role, u.login, u.first_name, u.last_name, u.middle_name, u.position FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'),
    touch: db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?'),
    del: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    cleanup: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    audit: db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_hash) VALUES (?,?,?,?)'),
  };
  const audit = (userId, action, detail, ip) => q.audit.run(userId ?? null, action, detail ?? null, ip ? sha256(ip).slice(0, 16) : null);

  function setCookie(res, token, maxAgeMs) {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
    if (IS_PROD) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  // Подгружает пользователя по cookie (если есть) — для всех запросов
  function loadSession(req, res, next) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token && token.length < 100) {
      const h = sha256(token);
      const s = q.sessionByHash.get(h);
      const now = Date.now();
      if (s && s.expires_at > now) {
        req.user = { id: s.user_id, role: s.role, login: s.login, first_name: s.first_name, last_name: s.last_name, middle_name: s.middle_name, position: s.position };
        req.sessionHash = h;
        if (now - s.last_seen > 60_000) q.touch.run(now, now + SESSION_TTL_MS, h);
      } else if (s) {
        q.del.run(h);
      }
    }
    next();
  }

  const requireAuth = (role) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Нужно войти в кабинет' });
    if (role && req.user.role !== role) return res.status(403).json({ error: 'Недостаточно прав' });
    next();
  };

  function login(req, res) {
    const { login, password } = req.body || {};
    if (typeof login !== 'string' || typeof password !== 'string' || !login || !password || login.length > 64 || password.length > 128) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }
    const key = loginKey(req.ip, login);
    const wait = isLocked(key);
    if (wait) return res.status(429).json({ error: `Слишком много попыток. Попробуйте через ${Math.ceil(wait / 60)} мин.` });

    const user = q.userByLogin.get(login.trim().toLowerCase());
    const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && Boolean(user);
    if (!ok) {
      registerFail(key);
      audit(user?.id, 'login_failed', null, req.ip);
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    attempts.delete(key);
    q.cleanup.run(Date.now());
    const token = randomToken();
    const now = Date.now();
    q.insertSession.run(sha256(token), user.id, now, now, now + SESSION_TTL_MS, deviceLabel(req.headers['user-agent']));
    setCookie(res, token, SESSION_TTL_MS);
    audit(user.id, 'login', deviceLabel(req.headers['user-agent']), req.ip);
    res.json({ ok: true, role: user.role });
  }

  function logout(req, res) {
    if (req.sessionHash) q.del.run(req.sessionHash);
    setCookie(res, '', 0);
    res.json({ ok: true });
  }

  function changePassword(req, res) {
    const { current, next: pw } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (typeof current !== 'string' || !verifyPassword(current, user.password_hash)) return res.status(400).json({ error: 'Текущий пароль указан неверно' });
    if (typeof pw !== 'string' || pw.length < 10 || pw.length > 128 || !/[A-Za-zА-Яа-я]/.test(pw) || !/\d/.test(pw)) {
      return res.status(400).json({ error: 'Новый пароль: от 10 символов, буквы и цифры' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(pw), user.id);
    // Выходим со всех остальных устройств
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(user.id, req.sessionHash);
    audit(user.id, 'password_changed', null, req.ip);
    res.json({ ok: true });
  }

  return { loadSession, requireAuth, login, logout, changePassword, audit };
}

module.exports = { createAuth, COOKIE, parseCookies };
