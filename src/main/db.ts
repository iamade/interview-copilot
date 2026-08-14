// ──────────────────────────────────────────────────────────────────────────
// src/main/db.ts — SQLite persistence for Interview Copilot Q&A
// AFD-166 (Mavis lane, p0): survives app restart, supports per-session review
// + delete. Uses better-sqlite3 (synchronous, single-file, no native server).
// DB lives in app.getPath('userData')/interview-copilot.db so it survives
// reinstalls (same path) and is wiped only on full uninstall.
// ──────────────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

export type QaRole = 'interviewer' | 'me' | 'system' | 'tool';

export interface QaEntry {
  id: number;
  session_id: string;
  ts: number;
  role: QaRole;
  text: string;
  meta: string | null; // JSON string
}

export interface QaInsertInput {
  session_id: string;
  role: QaRole;
  text: string;
  meta?: Record<string, any> | null;
}

export interface SessionSummary {
  session_id: string;
  first_ts: number;
  last_ts: number;
  count: number;
}

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS qa_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('interviewer','me','system','tool')),
  text TEXT NOT NULL,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_qa_log_session ON qa_log(session_id, ts);
`;

/**
 * Open (or create) the SQLite DB in userData. Idempotent — safe to call
 * multiple times; returns the same singleton. The directory is created
 * if missing.
 */
export function initDb(customPath?: string): Database.Database {
  if (db) return db;

  const dbPath = customPath || path.join(app.getPath('userData'), 'interview-copilot.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  // WAL mode = better crash safety + concurrent reads while writing.
  db.pragma('journal_mode = WAL');
  // Foreign keys = enabled (no FKs yet, but future-proof).
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  console.log(`[db] SQLite ready at ${dbPath}`);
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('[db] getDb() called before initDb()');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Prepared statements (lazy-init once the DB is open) ──

let stmts: {
  insert?: Database.Statement;
  listBySession?: Database.Statement;
  listAll?: Database.Statement;
  listSessions?: Database.Statement;
  deleteById?: Database.Statement;
  clearSession?: Database.Statement;
  countBySession?: Database.Statement;
  latestForSession?: Database.Statement;
} = {};

function prepStmts(): void {
  if (stmts.insert) return;
  const d = getDb();
  stmts.insert = d.prepare(`
    INSERT INTO qa_log (session_id, ts, role, text, meta)
    VALUES (@session_id, @ts, @role, @text, @meta)
  `);
  stmts.listBySession = d.prepare(`
    SELECT id, session_id, ts, role, text, meta
    FROM qa_log
    WHERE session_id = @session_id
    ORDER BY ts ASC
  `);
  stmts.listAll = d.prepare(`
    SELECT id, session_id, ts, role, text, meta
    FROM qa_log
    ORDER BY ts DESC
    LIMIT @limit
  `);
  stmts.listSessions = d.prepare(`
    SELECT
      session_id,
      MIN(ts) AS first_ts,
      MAX(ts) AS last_ts,
      COUNT(*) AS count
    FROM qa_log
    GROUP BY session_id
    ORDER BY last_ts DESC
    LIMIT @limit
  `);
  stmts.deleteById = d.prepare(`DELETE FROM qa_log WHERE id = ?`);
  stmts.clearSession = d.prepare(`DELETE FROM qa_log WHERE session_id = ?`);
  stmts.countBySession = d.prepare(`
    SELECT COUNT(*) AS n FROM qa_log WHERE session_id = ?
  `);
  stmts.latestForSession = d.prepare(`
    SELECT ts FROM qa_log WHERE session_id = ? ORDER BY ts DESC LIMIT 1
  `);
}

// ── Public API ──

export function addQa(input: QaInsertInput): number {
  prepStmts();
  const meta = input.meta ? JSON.stringify(input.meta) : null;
  const info = stmts.insert!.run({
    session_id: input.session_id,
    ts: Date.now(),
    role: input.role,
    text: input.text,
    meta,
  });
  return Number(info.lastInsertRowid);
}

export function listQaBySession(sessionId: string): QaEntry[] {
  prepStmts();
  return stmts.listBySession!.all({ session_id: sessionId }) as QaEntry[];
}

export function listAllQa(limit = 200): QaEntry[] {
  prepStmts();
  return stmts.listAll!.all({ limit }) as QaEntry[];
}

export function listSessions(limit = 50): SessionSummary[] {
  prepStmts();
  return stmts.listSessions!.all({ limit }) as SessionSummary[];
}

export function deleteQa(id: number): boolean {
  prepStmts();
  const info = stmts.deleteById!.run(id);
  return info.changes > 0;
}

export function clearSession(sessionId: string): number {
  prepStmts();
  const info = stmts.clearSession!.run(sessionId);
  return info.changes;
}

export function countQaBySession(sessionId: string): number {
  prepStmts();
  const row = stmts.countBySession!.get(sessionId) as { n: number };
  return row?.n ?? 0;
}

export function latestTsForSession(sessionId: string): number | null {
  prepStmts();
  const row = stmts.latestForSession!.get(sessionId) as { ts: number } | undefined;
  return row?.ts ?? null;
}
