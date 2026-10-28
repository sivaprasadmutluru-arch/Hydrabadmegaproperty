import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../db/schema';

const file = process.env.DATABASE_PATH || '/data/expo.sqlite';
mkdirSync(dirname(resolve(file)), { recursive: true });
export const sqlite = new DatabaseSync(file);
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
sqlite.exec('CREATE TABLE IF NOT EXISTS deployment_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
for (const migration of ['0000_marvelous_johnny_blaze.sql','0001_attendee_accounts.sql','0002_short_pass_codes.sql','0003_unique_attendee_phone.sql']) {
if (!sqlite.prepare('SELECT name FROM deployment_migrations WHERE name = ?').get(migration)) {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec(readFileSync(resolve(process.env.MIGRATIONS_DIR || 'drizzle', migration), 'utf8'));
    sqlite.prepare('INSERT INTO deployment_migrations VALUES (?, ?)').run(migration, new Date().toISOString());
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

}

export function ensurePassCode(id:string):string {
 const existing=sqlite.prepare('SELECT short_code FROM registrations WHERE id=?').get(id) as any;
 if(!existing)throw Error('Pass not found');
 if(existing.short_code)return existing.short_code;
 for(let attempt=0;attempt<100;attempt++){
  const code=randomBytes(4).toString('hex').toUpperCase();
  try{sqlite.prepare('UPDATE registrations SET short_code=? WHERE id=? AND short_code IS NULL').run(code,id);return (sqlite.prepare('SELECT short_code FROM registrations WHERE id=?').get(id) as any).short_code}
  catch(error){if(!String(error).includes('UNIQUE constraint failed: registrations.short_code'))throw error}
 }
 throw Error('Unable to allocate a unique pass code');
}
// Backfill old passes without replacing their IDs or QR links.
sqlite.exec('BEGIN IMMEDIATE');
try{for(const row of sqlite.prepare('SELECT id FROM registrations WHERE short_code IS NULL').all() as any[])ensurePassCode(row.id);sqlite.exec('COMMIT')}catch(error){sqlite.exec('ROLLBACK');throw error}

// Keep the same async Drizzle API used by the Cloudflare D1 route handlers.
const db = drizzle(async (sql, params, method) => {
  const statement = sqlite.prepare(sql);
  if (method === 'run') {
    statement.run(...params);
    return { rows: [] };
  }
  // Node 24 supports arrays natively; the fallback also permits local Node 23 QA.
  if (typeof statement.setReturnArrays === 'function') statement.setReturnArrays(true);
  const values = (row: unknown) => row && (Array.isArray(row) ? row : Object.values(row));
  if (method === 'get') return { rows: values(statement.get(...params)) || [] };
  return { rows: statement.all(...params).map(values) };
}, { schema });

export function getDb() { return db; }
