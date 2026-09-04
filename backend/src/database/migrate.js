import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
for (const file of files) {
  const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1', [file]);
  if (exists.rowCount) continue;
  const sql = await fs.readFile(path.join(dir, file), 'utf8');
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query(sql); await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]); await client.query('COMMIT'); console.log(`Applied ${file}`); }
  catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
await pool.end();
