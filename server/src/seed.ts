import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface EstimateSeed {
  owner?: string;
  startWeek?: string;
  durationWeeks?: number;
  targetDate?: string;
  status?: string;
  reason?: string;
}

interface FeatureSeed {
  name: string;
  confirmed?: boolean;
  parallel?: boolean;
  isFiller?: boolean;
  release?: string;
  priority?: string;
  dependencies?: string;
  notes?: string;
  jira?: { epicKey?: string; label?: string; jql?: string }[];
  product?: EstimateSeed;
  dev?: EstimateSeed;
}

const seed = JSON.parse(readFileSync(path.join(__dirname, 'seed.data.json'), 'utf-8')) as {
  settings: Record<string, string | number>;
  releases: { name: string; fixedDate?: string; status?: string; notes?: string }[];
  features: FeatureSeed[];
};

const reset = process.argv.includes('--reset');
const existing = Number((await db.execute('SELECT COUNT(*) AS n FROM feature')).rows[0]?.n ?? 0);

if (existing > 0 && !reset) {
  console.error(`DB already has ${existing} features. Re-run with --reset to wipe and reseed.`);
  process.exit(1);
}

const now = new Date().toISOString();

const tx = await db.transaction('write');
try {
  if (reset) {
    for (const t of ['change_log', 'resource', 'estimate', 'feature_jira', 'feature', 'release', 'settings', 'jira_cache']) {
      await tx.execute(`DELETE FROM ${t}`);
    }
  }

  for (const [k, v] of Object.entries(seed.settings)) {
    await tx.execute({
      sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      args: [k, String(v)],
    });
  }

  for (const r of seed.releases) {
    await tx.execute({
      sql: 'INSERT INTO release (name, fixed_date, status, notes) VALUES (?, ?, ?, ?)',
      args: [r.name, r.fixedDate ?? null, r.status ?? null, r.notes ?? null],
    });
  }

  for (const f of seed.features) {
    const res = await tx.execute({
      sql: `INSERT INTO feature (name, release, priority, confirmed, parallel, dependencies, notes, is_filler, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        f.name,
        f.release ?? null,
        f.priority ?? null,
        f.confirmed === false ? 0 : 1,
        f.parallel ? 1 : 0,
        f.dependencies ?? null,
        f.notes ?? null,
        f.isFiller ? 1 : 0,
        now,
        now,
      ],
    });
    const featureId = Number(res.lastInsertRowid);

    for (const j of f.jira ?? []) {
      await tx.execute({
        sql: 'INSERT INTO feature_jira (feature_id, epic_key, label, jql) VALUES (?, ?, ?, ?)',
        args: [featureId, j.epicKey ?? null, j.label ?? null, j.jql ?? null],
      });
    }

    for (const kind of ['product', 'dev'] as const) {
      const e = f[kind];
      if (!e) continue;
      await tx.execute({
        sql: `INSERT INTO estimate (feature_id, kind, owner, start_week, duration_weeks, target_date, status, source, last_changed_at, last_changed_by, reason)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          featureId,
          kind,
          e.owner ?? null,
          e.startWeek ?? null,
          e.durationWeeks ?? null,
          e.targetDate ?? null,
          e.status ?? null,
          kind === 'product' ? 'Product' : 'Dev',
          now,
          'seed',
          e.reason ?? null,
        ],
      });
    }
  }
  await tx.commit();
} catch (err) {
  await tx.rollback();
  throw err;
}

const n = Number((await db.execute('SELECT COUNT(*) AS n FROM feature')).rows[0]?.n ?? 0);
console.log(`Seeded ${n} features. Resources left empty on purpose.`);
