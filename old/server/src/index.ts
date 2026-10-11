import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { getSettings, setSetting, logChange } from './store.js';
import { jiraConfigured, jqlForLink, readCache, syncAll, syncJql, type LinkSpec } from './jira.js';
import { weekRange, todayWeekCode } from './weeks.js';

const app = express();
app.use(express.json());

// Shared-secret gate for public deployment. No env var = open (local dev).
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
app.use((req, res, next) => {
  if (!AUTH_PASSWORD) return next();
  if (req.method === 'OPTIONS') return next();
  const provided = String(req.header('x-auth') ?? '');
  const ok = (() => {
    const a = Buffer.from(provided);
    const b = Buffer.from(AUTH_PASSWORD);
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  if (ok) return next();
  res.status(401).json({ error: 'auth required' });
});

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function userOf(req: Request): string {
  let u = String(req.header('x-user') ?? '').trim();
  try {
    u = decodeURIComponent(u);
  } catch {
    /* keep raw value */
  }
  if (!u) throw Object.assign(new Error('X-User header required'), { status: 400 });
  return u.slice(0, 80);
}

const wrap =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      Promise.resolve(fn(req, res)).catch(next);
    } catch (e) {
      next(e);
    }
  };

const bad = (msg: string) => Object.assign(new Error(msg), { status: 400 });

const WEEK_RE = /^S\d+W[12]$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FEATURE_FIELDS = [
  'name',
  'release',
  'priority',
  'confirmed',
  'parallel',
  'dependencies',
  'notes',
  'note',
  'be_need',
  'fe_need',
] as const;
const ESTIMATE_FIELDS = ['owner', 'start_week', 'duration_weeks', 'target_date', 'status'] as const;

async function loadFeatures() {
  const features = (await db.execute('SELECT * FROM feature ORDER BY id')).rows as any[];
  const estimates = (await db.execute('SELECT * FROM estimate')).rows as any[];
  const resources = (await db.execute('SELECT * FROM resource')).rows as any[];
  const links = (await db.execute('SELECT * FROM feature_jira')).rows as any[];
  return features.map((f) => ({
    id: f.id,
    name: f.name,
    release: f.release,
    priority: f.priority,
    confirmed: Boolean(f.confirmed),
    parallel: Boolean(f.parallel),
    isFiller: Boolean(f.is_filler),
    dependencies: f.dependencies,
    notes: f.notes,
    note: f.note,
    beNeed: f.be_need,
    feNeed: f.fe_need,
    estimates: Object.fromEntries(
      estimates
        .filter((e) => e.feature_id === f.id)
        .map((e) => [
          e.kind,
          {
            owner: e.owner,
            startWeek: e.start_week,
            durationWeeks: e.duration_weeks,
            targetDate: e.target_date,
            status: e.status,
            source: e.source,
            lastChangedAt: e.last_changed_at,
            lastChangedBy: e.last_changed_by,
            reason: e.reason,
          },
        ]),
    ),
    resources: resources
      .filter((r) => r.feature_id === f.id)
      .map((r) => ({ week: r.week, be: r.be_count, fe: r.fe_count })),
    jira: links
      .filter((l) => l.feature_id === f.id)
      .map((l) => ({ id: l.id, epicKey: l.epic_key, label: l.label, jql: l.jql })),
  }));
}

app.get(
  '/api/state',
  wrap(async (_req, res) => {
    const settings = await getSettings();
    const releases = (await db.execute('SELECT id, name, fixed_date AS fixedDate, status, notes FROM release ORDER BY id')).rows;
    const blocks = (
      await db.execute('SELECT id, name, start_week AS startWeek, weeks, notes FROM regression_block ORDER BY id')
    ).rows;
    res.json({
      settings,
      weeks: weekRange(settings.weeksVisible, settings.calendarStart),
      currentWeek: todayWeekCode(settings.calendarStart),
      releases,
      regressionBlocks: blocks,
      features: await loadFeatures(),
      jiraConfigured,
    });
  }),
);

app.put(
  '/api/settings',
  wrap(async (req, res) => {
    const by = userOf(req);
    const before = await getSettings();
    const map: Record<string, string> = {
      beTotal: 'be_total',
      feTotal: 'fe_total',
      qaWeeks: 'qa_weeks',
      lowThreshold: 'low_threshold',
      calendarStart: 'calendar_start',
      weeksVisible: 'weeks_visible',
    };
    for (const [k, v] of Object.entries(req.body ?? {})) {
      const col = map[k];
      if (!col) continue;
      if (k === 'calendarStart') {
        if (!ISO_DATE_RE.test(String(v))) throw bad('calendarStart must be YYYY-MM-DD');
      } else if (!Number.isFinite(Number(v)) || Number(v) < 0) throw bad(`${k} must be a non-negative number`);
      await setSetting(col, v as string | number);
      const beforeVal = k === 'beTotal' ? before.beTotal : k === 'feTotal' ? before.feTotal : k === 'qaWeeks' ? before.qaWeeks : k === 'lowThreshold' ? before.lowThreshold : k === 'calendarStart' ? before.calendarStart : before.weeksVisible;
      await logChange({ entityType: 'setting', field: k, from: beforeVal, to: v, by, reason: req.body?.reason });
    }
    res.json(await getSettings());
  }),
);

app.post(
  '/api/features',
  wrap(async (req, res) => {
    const by = userOf(req);
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw bad('name required');
    const now = new Date().toISOString();
    const r = await db.execute({
      sql: 'INSERT INTO feature (name, confirmed, parallel, is_filler, created_at, updated_at) VALUES (?, 1, 0, 0, ?, ?)',
      args: [name, now, now],
    });
    const id = Number(r.lastInsertRowid);
    await logChange({ entityType: 'feature', entityId: id, featureId: id, field: 'created', from: null, to: name, by });
    res.status(201).json({ id });
  }),
);

app.patch(
  '/api/features/:id',
  wrap(async (req, res) => {
    const by = userOf(req);
    const id = Number(req.params.id);
    const cur = (await db.execute({ sql: 'SELECT * FROM feature WHERE id = ?', args: [id] })).rows[0] as any;
    if (!cur) throw Object.assign(new Error('not found'), { status: 404 });
    const reason = req.body?.reason ?? null;
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of FEATURE_FIELDS) {
      if (!(f in (req.body ?? {}))) continue;
      let next = req.body[f];
      if (f === 'confirmed' || f === 'parallel') next = next ? 1 : 0;
      if (f === 'name' && !String(next ?? '').trim()) throw bad('name cannot be empty');
      if (f === 'be_need' || f === 'fe_need') {
        next = Number(next ?? 0);
        if (!(next >= 0)) throw bad(`${f} must be >= 0`);
      }
      await logChange({ entityType: 'feature', entityId: id, featureId: id, field: f, from: cur[f], to: next, by, reason });
      sets.push(`${f} = ?`);
      vals.push(next);
    }
    if (sets.length) {
      await db.execute({
        sql: `UPDATE feature SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
        args: [...(vals as any[]), new Date().toISOString(), id],
      });
    }
    res.json({ ok: true });
  }),
);

app.put(
  '/api/features/:id/estimate/:kind',
  wrap(async (req, res) => {
    const by = userOf(req);
    const featureId = Number(req.params.id);
    const kind = String(req.params.kind);
    if (!(['product', 'design', 'dev', 'qa_test'] as const).includes(kind as any)) {
      throw bad('kind must be product, design, dev or qa_test');
    }
    if (!(await db.execute({ sql: 'SELECT 1 FROM feature WHERE id = ?', args: [featureId] })).rows.length) {
      throw Object.assign(new Error('not found'), { status: 404 });
    }
    const body = req.body ?? {};
    if (body.start_week && !WEEK_RE.test(body.start_week)) throw bad('start_week must look like S56W2');
    if (body.duration_weeks != null && !(Number(body.duration_weeks) > 0)) throw bad('duration_weeks must be > 0');
    if (body.target_date && !ISO_DATE_RE.test(body.target_date)) throw bad('target_date must be YYYY-MM-DD');

    const cur = (await db.execute({ sql: 'SELECT * FROM estimate WHERE feature_id = ? AND kind = ?', args: [featureId, kind] }))
      .rows[0] as any;
    const now = new Date().toISOString();
    const source = { product: 'Product', design: 'Design', dev: 'Dev', qa_test: 'QA' }[kind] ?? kind;
    const reason = body.reason ?? null;

    if (!cur) {
      const r = await db.execute({
        sql: `INSERT INTO estimate (feature_id, kind, owner, start_week, duration_weeks, target_date, status, source, last_changed_at, last_changed_by, reason)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          featureId,
          kind,
          body.owner ?? null,
          body.start_week ?? null,
          body.duration_weeks ?? null,
          body.target_date ?? null,
          body.status ?? null,
          source,
          now,
          by,
          reason,
        ],
      });
      for (const f of ESTIMATE_FIELDS) {
        await logChange({
          entityType: 'estimate',
          entityId: Number(r.lastInsertRowid),
          featureId,
          field: `${kind}.${f}`,
          from: null,
          to: body[f],
          by,
          reason,
        });
      }
      return res.json({ ok: true });
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let changed = false;
    for (const f of ESTIMATE_FIELDS) {
      if (!(f in body)) continue;
      const next = body[f] === '' ? null : body[f];
      if (String(cur[f] ?? '') === String(next ?? '')) continue;
      changed = true;
      await logChange({
        entityType: 'estimate',
        entityId: cur.id,
        featureId,
        field: `${kind}.${f}`,
        from: cur[f],
        to: next,
        by,
        reason,
      });
      sets.push(`${f} = ?`);
      vals.push(next);
    }
    if (changed) {
      await db.execute({
        sql: `UPDATE estimate SET ${sets.join(', ')}, last_changed_at = ?, last_changed_by = ?, reason = ? WHERE id = ?`,
        args: [...(vals as any[]), now, by, reason ?? cur.reason, cur.id],
      });
    }
    res.json({ ok: true });
  }),
);

app.put(
  '/api/features/:id/resources',
  wrap(async (req, res) => {
    const by = userOf(req);
    const featureId = Number(req.params.id);
    const rows = req.body?.rows;
    if (!Array.isArray(rows)) throw bad('rows must be an array of {week, be, fe}');
    const reason = req.body?.reason ?? null;
    for (const r of rows) {
      if (!WEEK_RE.test(String(r.week))) throw bad(`bad week ${r.week}`);
      const be = Number(r.be ?? 0);
      const fe = Number(r.fe ?? 0);
      if (!(be >= 0) || !(fe >= 0)) throw bad('be/fe must be >= 0');
      const cur = (
        await db.execute({ sql: 'SELECT * FROM resource WHERE feature_id = ? AND week = ?', args: [featureId, r.week] })
      ).rows[0] as any;
      await logChange({ entityType: 'resource', entityId: cur?.id, featureId, field: `${r.week}.BE`, from: cur?.be_count ?? 0, to: be, by, reason });
      await logChange({ entityType: 'resource', entityId: cur?.id, featureId, field: `${r.week}.FE`, from: cur?.fe_count ?? 0, to: fe, by, reason });
      if (be === 0 && fe === 0) {
        await db.execute({ sql: 'DELETE FROM resource WHERE feature_id = ? AND week = ?', args: [featureId, r.week] });
      } else {
        await db.execute({
          sql: `INSERT INTO resource (feature_id, week, be_count, fe_count) VALUES (?, ?, ?, ?)
                ON CONFLICT(feature_id, week) DO UPDATE SET be_count = excluded.be_count, fe_count = excluded.fe_count`,
          args: [featureId, r.week, be, fe],
        });
      }
    }
    res.json({ ok: true });
  }),
);

app.put(
  '/api/features/:id/jira',
  wrap(async (req, res) => {
    const by = userOf(req);
    const featureId = Number(req.params.id);
    const links: LinkSpec[] = Array.isArray(req.body?.links) ? req.body.links : [];
    const before = (
      await db.execute({ sql: 'SELECT epic_key FROM feature_jira WHERE feature_id = ?', args: [featureId] })
    ).rows as unknown as { epic_key: string | null }[];
    await db.execute({ sql: 'DELETE FROM feature_jira WHERE feature_id = ?', args: [featureId] });
    for (const l of links) {
      if (!l.epicKey && !l.label && !l.jql) continue;
      await db.execute({
        sql: 'INSERT INTO feature_jira (feature_id, epic_key, label, jql) VALUES (?, ?, ?, ?)',
        args: [featureId, l.epicKey?.trim() || null, l.label?.trim() || null, l.jql?.trim() || null],
      });
    }
    await logChange({
      entityType: 'feature',
      featureId,
      field: 'jira_links',
      from: before.map((b) => b.epic_key).filter(Boolean).join(', '),
      to: links.map((l) => l.epicKey).filter(Boolean).join(', '),
      by,
      reason: req.body?.reason,
    });
    void Promise.all(links.map(jqlForLink).filter((q): q is string => Boolean(q)).map(syncJql)).catch(() => undefined);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/features/:id/jira',
  wrap(async (req, res) => {
    const links = (
      await db.execute({
        sql: 'SELECT epic_key AS epicKey, label, jql FROM feature_jira WHERE feature_id = ?',
        args: [Number(req.params.id)],
      })
    ).rows as LinkSpec[];
    res.json(
      links.map((l) => {
        const jql = jqlForLink(l);
        return { link: l, jql, ...(jql ? readCache(jql) : { summary: null, syncedAt: null, error: null }) };
      }),
    );
  }),
);

app.post(
  '/api/jira/sync',
  wrap(async (_req, res) => {
    if (!jiraConfigured) throw bad('Jira env vars not set (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)');
    await syncAll();
    res.json({ ok: true });
  }),
);

app.get(
  '/api/changelog',
  wrap(async (req, res) => {
    const featureId = req.query.featureId ? Number(req.query.featureId) : null;
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);
    const rows = (
      await db.execute({
        sql: `SELECT c.id, c.feature_id AS featureId, f.name AS featureName, c.entity_type AS entityType, c.field,
                     c.from_value AS fromValue, c.to_value AS toValue, c.changed_by AS changedBy, c.changed_at AS changedAt, c.reason
              FROM change_log c LEFT JOIN feature f ON f.id = c.feature_id
              WHERE (? IS NULL OR c.feature_id = ?)
              ORDER BY c.id DESC LIMIT ?`,
        args: [featureId, featureId, limit],
      })
    ).rows;
    res.json(rows);
  }),
);

app.post(
  '/api/regression-blocks',
  wrap(async (req, res) => {
    const by = userOf(req);
    const name = String(req.body?.name ?? '').trim();
    const startWeek = String(req.body?.startWeek ?? '').trim();
    if (!name) throw bad('name required');
    if (!WEEK_RE.test(startWeek)) throw bad('startWeek must look like S58W2');
    const weeks = Number(req.body?.weeks ?? 2);
    if (!(weeks > 0 && weeks <= 8)) throw bad('weeks must be 1-8');
    const r = await db.execute({
      sql: 'INSERT INTO regression_block (name, start_week, weeks, notes) VALUES (?, ?, ?, ?)',
      args: [name, startWeek, weeks, req.body?.notes ?? null],
    });
    await logChange({
      entityType: 'regression_block',
      entityId: Number(r.lastInsertRowid),
      field: 'created',
      from: null,
      to: `${name} @ ${startWeek} (${weeks}w)`,
      by,
    });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  }),
);

app.patch(
  '/api/regression-blocks/:id',
  wrap(async (req, res) => {
    const by = userOf(req);
    const id = Number(req.params.id);
    const cur = (await db.execute({ sql: 'SELECT * FROM regression_block WHERE id = ?', args: [id] })).rows[0] as any;
    if (!cur) throw Object.assign(new Error('not found'), { status: 404 });
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const f of ['name', 'start_week', 'weeks', 'notes'] as const) {
      const key = f === 'start_week' ? 'startWeek' : f;
      if (!(key in (req.body ?? {}))) continue;
      let next = req.body[key];
      if (f === 'start_week') {
        if (!WEEK_RE.test(String(next))) throw bad('startWeek must look like S58W2');
      }
      if (f === 'weeks') {
        next = Number(next);
        if (!(next > 0 && next <= 8)) throw bad('weeks must be 1-8');
      }
      sets.push(`${f} = ?`);
      vals.push(next);
    }
    if (sets.length) {
      await db.execute({
        sql: `UPDATE regression_block SET ${sets.join(', ')} WHERE id = ?`,
        args: [...(vals as any[]), id],
      });
      await logChange({
        entityType: 'regression_block',
        entityId: id,
        field: sets.join(','),
        from: `${cur.name} @ ${cur.start_week}`,
        to: String(req.body.name ?? req.body.startWeek ?? req.body.weeks ?? ''),
        by,
      });
    }
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/regression-blocks/:id',
  wrap(async (req, res) => {
    const by = userOf(req);
    const id = Number(req.params.id);
    const r = await db.execute({ sql: 'DELETE FROM regression_block WHERE id = ?', args: [id] });
    if (!r.rowsAffected) throw Object.assign(new Error('not found'), { status: 404 });
    await logChange({ entityType: 'regression_block', entityId: id, field: 'deleted', from: id, to: null, by });
    res.json({ ok: true });
  }),
);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status ?? 500).json({ error: err.message ?? 'server error' });
});

const port = Number(process.env.PORT ?? 4000);

// Vercel serverless imports this module for the exported app; only listen when run directly.
if (process.env.VERCEL !== '1') {
  app.listen(port, '127.0.0.1', () => {
    console.log(`scrum-dashboard server on http://127.0.0.1:${port} (jira ${jiraConfigured ? 'configured' : 'NOT configured'})`);
  });

  if (jiraConfigured) {
    void syncAll();
    setInterval(() => void syncAll(), SYNC_INTERVAL_MS);
  }
}

export default app;
