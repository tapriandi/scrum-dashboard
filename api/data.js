import { createClient } from '@libsql/client';
import { timingSafeEqual } from 'node:crypto';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const KEY = 'dashboard';

let client;
function db() {
  if (!client) {
    if (!url) throw new Error('TURSO_DATABASE_URL not set');
    client = createClient({ url, authToken });
  }
  return client;
}

let ready;
async function init() {
  if (!ready) {
    ready = db().execute(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }
  await ready;
}

function authed(req) {
  if (!AUTH_PASSWORD) return true;
  const a = Buffer.from(String(req.headers['x-auth'] ?? ''));
  const b = Buffer.from(AUTH_PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  try {
    await init();

    if (req.method === 'GET') {
      const r = await db().execute({ sql: 'SELECT value, updated_at FROM kv WHERE key = ?', args: [KEY] });
      const row = r.rows[0];
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(row ? { data: row.value, updated_at: row.updated_at } : { data: null, updated_at: null });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      if (!authed(req)) return res.status(401).json({ error: 'auth required' });
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!body || body === 'undefined') return res.status(400).json({ error: 'empty body' });
      if (body.length > 1_000_000) return res.status(413).json({ error: 'payload too large' });
      try { JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid JSON' }); }
      const now = new Date().toISOString();
      await db().execute({
        sql: 'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        args: [KEY, body, now],
      });
      return res.status(200).json({ ok: true, updated_at: now });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
