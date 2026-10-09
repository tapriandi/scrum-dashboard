import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Turso when env vars present, otherwise local file (local dev unchanged).
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let client: Client;
if (TURSO_URL) {
  client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN,
  });
} else {
  const dataDir = path.resolve(__dirname, '../../data');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dataDir, { recursive: true });
  client = createClient({ url: `file:${path.join(dataDir, 'dashboard.db')}` });
}

export const db = client;

const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
await client.executeMultiple(schema);

// CREATE TABLE IF NOT EXISTS never alters an existing table, so add late columns here.
const featureCols = (await client.execute('PRAGMA table_info(feature)')).rows.map((c) => c.name as string);
for (const col of ['be_need', 'fe_need']) {
  if (!featureCols.includes(col)) await client.execute(`ALTER TABLE feature ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`);
}
