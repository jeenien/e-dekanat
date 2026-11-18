// Пересоздает демо-базу (например, перед показом жюри). Удаляет только файл базы прототипа.
const fs = require('fs');
const { DB_FILE } = require('../server/config');
for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
const { initDb } = require('../server/index');
initDb();
console.log('Демо-база пересоздана:', DB_FILE);
