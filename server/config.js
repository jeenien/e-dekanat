// Все настройки — из переменных окружения. Секреты в коде не хранятся.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Ключ шифрования персональных полей (AES-256-GCM).
// В продакшене задается через DATA_KEY (32 байта в base64).
// Для локального запуска генерируется один раз и кладется в data/ (папка в .gitignore).
function loadDataKey() {
  if (process.env.DATA_KEY) {
    const k = Buffer.from(process.env.DATA_KEY, 'base64');
    if (k.length === 32) return k;
    if (process.env.DATA_KEY.length < 24) throw new Error('DATA_KEY слишком короткий');
    // Хостинги генерируют секрет произвольного вида — приводим его к 256-битному ключу
    return crypto.createHash('sha256').update(process.env.DATA_KEY).digest();
  }
  const f = path.join(DATA_DIR, 'data.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64');
}

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  DATA_DIR,
  DB_FILE: process.env.DB_FILE || path.join(DATA_DIR, 'orbita.db'),
  IS_PROD: process.env.NODE_ENV === 'production',
  DATA_KEY: loadDataKey(),
  SESSION_TTL_MS: 1000 * 60 * 60 * 12, // 12 часов бездействия
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  AI_ENABLED: Boolean(process.env.ANTHROPIC_API_KEY),
};
