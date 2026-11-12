-- Initial schema for the generated site. Applied automatically by server/db.mjs on start-up.
CREATE TABLE IF NOT EXISTS submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id    TEXT NOT NULL,
  route      TEXT NOT NULL DEFAULT '',
  payload    TEXT NOT NULL,              -- JSON object of submitted fields
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS submissions_form_idx ON submissions (form_id, created_at);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier    TEXT NOT NULL UNIQUE,    -- e-mail address or username, lower-cased
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,           -- scrypt: salt:hash (hex)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,           -- sha256 of the session token; the token itself is never stored
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL            -- unix epoch milliseconds
);
