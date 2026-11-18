const crypto = require('crypto');
const { DATA_KEY } = require('./config');

// --- Пароли: scrypt + уникальная соль, сравнение за постоянное время ---
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(password, stored) {
  const [alg, n, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}
// Фиктивный хеш: проверяем пароль даже для несуществующего логина,
// чтобы по времени ответа нельзя было понять, есть ли такой пользователь.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

// --- Шифрование персональных полей (телефон, e-mail, номер зачётки, дата рождения) ---
function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', DATA_KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
function decrypt(blob) {
  if (!blob) return null;
  const [v, iv, tag, data] = blob.split(':');
  if (v !== 'v1') return null;
  const d = crypto.createDecipheriv('aes-256-gcm', DATA_KEY, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// Публичные идентификаторы заявок и документов: не последовательные, их нельзя перебрать
function publicId(prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const x of crypto.randomBytes(8)) s += alphabet[x % alphabet.length];
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}

module.exports = { hashPassword, verifyPassword, DUMMY_HASH, encrypt, decrypt, sha256, randomToken, publicId };
