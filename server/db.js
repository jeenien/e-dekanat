const { DatabaseSync } = require('node:sqlite');
const { DB_FILE } = require('./config');

// SQLite для прототипа. Схема написана на переносимом SQL и переносится
// на PostgreSQL при росте числа пользователей (см. README, раздел «Масштабирование»).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','staff','teacher')),
  last_name TEXT NOT NULL, first_name TEXT NOT NULL, middle_name TEXT,
  position TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS students (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  faculty TEXT NOT NULL, program_code TEXT NOT NULL, program TEXT NOT NULL, profile TEXT,
  course INTEGER NOT NULL, group_name TEXT NOT NULL,
  study_form TEXT NOT NULL, funding TEXT NOT NULL, enrolled_year INTEGER NOT NULL,
  stipend TEXT, curator TEXT,
  record_book_enc TEXT, email_enc TEXT, phone_enc TEXT, birth_date_enc TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  device TEXT
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  group_name TEXT NOT NULL, weekday INTEGER NOT NULL, pair INTEGER NOT NULL,
  week TEXT NOT NULL DEFAULT 'all' CHECK (week IN ('all','odd','even')),
  subject TEXT NOT NULL, kind TEXT NOT NULL, room TEXT NOT NULL, teacher TEXT NOT NULL,
  online_url TEXT
);
CREATE TABLE IF NOT EXISTS schedule_changes (
  id INTEGER PRIMARY KEY,
  group_name TEXT NOT NULL, date TEXT NOT NULL, pair INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cancel','room','teacher','move','extra')),
  subject TEXT, kind TEXT, new_room TEXT, new_teacher TEXT, new_date TEXT, new_pair INTEGER,
  note TEXT, start_time TEXT, end_time TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS disciplines (
  id INTEGER PRIMARY KEY,
  group_name TEXT NOT NULL, semester INTEGER NOT NULL, name TEXT NOT NULL,
  control TEXT NOT NULL CHECK (control IN ('exam','credit','diff_credit','coursework')),
  credits INTEGER NOT NULL, hours INTEGER NOT NULL, teacher TEXT NOT NULL,
  exam_date TEXT, exam_room TEXT, consult_date TEXT,
  group_avg REAL
);
CREATE TABLE IF NOT EXISTS grade_items (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id),
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id),
  title TEXT NOT NULL, score REAL, max_score REAL NOT NULL, date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS final_grades (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id),
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id),
  mark TEXT NOT NULL, points INTEGER, date TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1,
  UNIQUE (student_id, discipline_id)
);
CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY,
  group_name TEXT NOT NULL, discipline TEXT NOT NULL, title TEXT NOT NULL,
  due_at TEXT NOT NULL, kind TEXT NOT NULL,
  description TEXT, lesson_date TEXT, lesson_start TEXT, teacher_id INTEGER
);
CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  group_name TEXT NOT NULL, subject TEXT NOT NULL,
  PRIMARY KEY (teacher_id, group_name, subject)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL, description TEXT NOT NULL, place TEXT NOT NULL,
  start_at TEXT NOT NULL, end_at TEXT NOT NULL, audience TEXT NOT NULL,
  organizer TEXT, author_id INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_events (
  user_id INTEGER NOT NULL REFERENCES users(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  added_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_id)
);
CREATE TABLE IF NOT EXISTS reschedules (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  group_name TEXT NOT NULL, subject TEXT NOT NULL, kind TEXT, room TEXT,
  from_date TEXT NOT NULL, from_start TEXT NOT NULL, from_end TEXT NOT NULL, from_pair INTEGER,
  to_date TEXT NOT NULL, to_start TEXT NOT NULL, to_end TEXT NOT NULL, to_room TEXT,
  reason TEXT, status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  staff_comment TEXT, created_at TEXT NOT NULL, decided_at TEXT
);
CREATE TABLE IF NOT EXISTS deadline_done (
  user_id INTEGER NOT NULL REFERENCES users(id),
  deadline_id INTEGER NOT NULL REFERENCES deadlines(id),
  PRIMARY KEY (user_id, deadline_id)
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  student_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, title TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','in_progress','need_info','ready','done','rejected')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  eta TEXT, assignee TEXT, doc_code TEXT UNIQUE, rating INTEGER
);
CREATE TABLE IF NOT EXISTS request_events (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  kind TEXT NOT NULL, status TEXT, author_role TEXT NOT NULL, author_name TEXT, text TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  audience TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT NOT NULL, link TEXT,
  important INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
  author TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_reads (
  user_id INTEGER NOT NULL REFERENCES users(id),
  notification_id INTEGER NOT NULL REFERENCES notifications(id),
  PRIMARY KEY (user_id, notification_id)
);
CREATE TABLE IF NOT EXISTS reminder_reads (
  user_id INTEGER NOT NULL REFERENCES users(id),
  deadline_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, deadline_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER, action TEXT NOT NULL, detail TEXT, ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS retakes (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id),
  discipline TEXT NOT NULL, date TEXT NOT NULL, pair INTEGER NOT NULL,
  room TEXT NOT NULL, examiner TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1,
  set_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS absences (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL, pair INTEGER NOT NULL, subject TEXT NOT NULL,
  excused INTEGER NOT NULL DEFAULT 0, note TEXT,
  UNIQUE (student_id, date, pair)
);
CREATE TABLE IF NOT EXISTS campus_passes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  at TEXT NOT NULL, direction TEXT NOT NULL CHECK (direction IN ('in','out')), gate TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_passes_user ON campus_passes(user_id, at);
CREATE INDEX IF NOT EXISTS idx_absences_student ON absences(student_id, date);
CREATE INDEX IF NOT EXISTS idx_retakes_student ON retakes(student_id, date);
CREATE INDEX IF NOT EXISTS idx_requests_student ON requests(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_group ON lessons(group_name, weekday);
CREATE INDEX IF NOT EXISTS idx_changes_group ON schedule_changes(group_name, date);
CREATE INDEX IF NOT EXISTS idx_notif_aud ON notifications(audience);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

function open(file = DB_FILE) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  // Миграция: время для пар, поставленных деканатом вне сетки
  const cols = db.prepare('PRAGMA table_info(schedule_changes)').all().map((c) => c.name);
  const dcols = db.prepare('PRAGMA table_info(deadlines)').all().map((c) => c.name);
  if (!dcols.includes('lesson_date')) db.exec('ALTER TABLE deadlines ADD COLUMN description TEXT; ALTER TABLE deadlines ADD COLUMN lesson_date TEXT; ALTER TABLE deadlines ADD COLUMN lesson_start TEXT; ALTER TABLE deadlines ADD COLUMN teacher_id INTEGER;');
  if (!cols.includes('start_time')) db.exec('ALTER TABLE schedule_changes ADD COLUMN start_time TEXT; ALTER TABLE schedule_changes ADD COLUMN end_time TEXT;');
  return db;
}

function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { open, tx };
