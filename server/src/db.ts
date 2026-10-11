import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';

// Turso when env vars present, otherwise local file (local dev unchanged).
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  release TEXT,
  priority TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1,
  parallel INTEGER NOT NULL DEFAULT 0,
  dependencies TEXT,
  notes TEXT,
  is_filler INTEGER NOT NULL DEFAULT 0,
  be_need REAL NOT NULL DEFAULT 0,
  fe_need REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS release (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  fixed_date TEXT,
  status TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS feature_jira (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id INTEGER NOT NULL REFERENCES feature(id) ON DELETE CASCADE,
  epic_key TEXT,
  label TEXT,
  jql TEXT
);

CREATE TABLE IF NOT EXISTS estimate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id INTEGER NOT NULL REFERENCES feature(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('product', 'dev')),
  owner TEXT,
  start_week TEXT,
  duration_weeks REAL,
  target_date TEXT,
  status TEXT,
  source TEXT,
  last_changed_at TEXT NOT NULL,
  last_changed_by TEXT,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS resource (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id INTEGER NOT NULL REFERENCES feature(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  be_count REAL NOT NULL DEFAULT 0,
  fe_count REAL NOT NULL DEFAULT 0,
  UNIQUE(feature_id, week)
);

CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  feature_id INTEGER,
  field TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS jira_cache (
  cache_key TEXT PRIMARY KEY,
  data TEXT,
  synced_at TEXT,
  error TEXT,
  attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_estimate_feature ON estimate(feature_id);
CREATE INDEX IF NOT EXISTS idx_resource_feature ON resource(feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_jira_feature ON feature_jira(feature_id);
CREATE INDEX IF NOT EXISTS idx_change_log_feature ON change_log(feature_id);
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let client: Client;
if (TURSO_URL) {
  client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
} else {
  const dataDir = path.resolve(__dirname, '../../data');
  mkdirSync(dataDir, { recursive: true });
  client = createClient({ url: `file:${path.join(dataDir, 'dashboard.db')}` });
}

export const db = client;

await client.executeMultiple(SCHEMA);

// CREATE TABLE IF NOT EXISTS never alters an existing table, so add late columns here.
const featureCols = (await client.execute('PRAGMA table_info(feature)')).rows.map((c) => c.name as string);
for (const col of ['be_need', 'fe_need']) {
  if (!featureCols.includes(col)) await client.execute(`ALTER TABLE feature ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`);
}
