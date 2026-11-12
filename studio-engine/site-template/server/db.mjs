// Storage layer. Uses SQLite (node:sqlite, Node 22.5+) when the database feature is enabled,
// and an in-memory store otherwise. Both expose the same small interface.
import fs from 'node:fs';
import path from 'node:path';

function memoryStore() {
  const submissions = [], users = [], sessions = new Map();
  let sid = 0, uid = 0;
  return {
    kind: 'memory',
    addSubmission(formId, route, payload) { submissions.push({ id: ++sid, form_id: formId, route, payload: JSON.stringify(payload), created_at: new Date().toISOString() }); return sid; },
    listSubmissions(formId) { return submissions.filter((s) => s.form_id === formId).slice(-200).reverse(); },
    createUser(identifier, name, hash) { if (users.some((u) => u.identifier === identifier)) return null; users.push({ id: ++uid, identifier, name, password_hash: hash }); return uid; },
    findUser(identifier) { return users.find((u) => u.identifier === identifier) || null; },
    userById(id) { return users.find((u) => u.id === id) || null; },
    createSession(tokenHash, userId, expiresAt) { sessions.set(tokenHash, { user_id: userId, expires_at: expiresAt }); },
    findSession(tokenHash) { const s = sessions.get(tokenHash); return s && s.expires_at > Date.now() ? s : null; },
    deleteSession(tokenHash) { sessions.delete(tokenHash); },
    close() {},
  };
}

export async function openStore({ file, migrationsDir, enabled }) {
  if (!enabled) return memoryStore();
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    console.warn('node:sqlite is not available in this Node.js version (22.5+ required); using in-memory storage.');
    return memoryStore();
  }
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  for (const name of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue;
    db.exec(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
  }
  return {
    kind: 'sqlite',
    addSubmission(formId, route, payload) { return Number(db.prepare('INSERT INTO submissions (form_id, route, payload) VALUES (?, ?, ?)').run(formId, route, JSON.stringify(payload)).lastInsertRowid); },
    listSubmissions(formId) { return db.prepare('SELECT id, form_id, route, payload, created_at FROM submissions WHERE form_id = ? ORDER BY id DESC LIMIT 200').all(formId); },
    createUser(identifier, name, hash) {
      if (db.prepare('SELECT 1 FROM users WHERE identifier = ?').get(identifier)) return null;
      return Number(db.prepare('INSERT INTO users (identifier, name, password_hash) VALUES (?, ?, ?)').run(identifier, name, hash).lastInsertRowid);
    },
    findUser(identifier) { return db.prepare('SELECT * FROM users WHERE identifier = ?').get(identifier) || null; },
    userById(id) { return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null; },
    createSession(tokenHash, userId, expiresAt) { db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt); },
    findSession(tokenHash) { return db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now()) || null; },
    deleteSession(tokenHash) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); },
    close() { db.close(); },
  };
}
