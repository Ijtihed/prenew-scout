import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** The same data/scout.db the crawler writes; schema shared in crawler/schema.sql. */
const ROOT = path.resolve(process.cwd(), '..');
const DB_PATH = process.env.SCOUT_DB ?? path.join(ROOT, 'data/scout.db');

let db: DatabaseSync | null = null;

export function getDb() {
   if (!db) {
      db = new DatabaseSync(DB_PATH);
      // The crawler writes to the same file all the time; wait for its lock rather than failing a save.
      db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 20000;');
      db.exec(readFileSync(path.join(ROOT, 'crawler/schema.sql'), 'utf8'));
   }
   return db;
}
