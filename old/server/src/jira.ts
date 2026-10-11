import axios from 'axios';
import { db } from './db.js';

const BASE = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT = process.env.JIRA_PROJECT_KEY || 'GF';

export const jiraConfigured = Boolean(BASE && EMAIL && TOKEN);

export interface JiraIssue {
  key: string;
  summary: string;
  type: string;
  status: string;
  statusCategory: 'new' | 'indeterminate' | 'done';
  assignee: string | null;
  priority: string | null;
  blockedBy: string[];
  labelBlocked: boolean;
  url: string;
}

export interface JiraSummary {
  jql: string;
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  byStatus: Record<string, number>;
  openByAssignee: Record<string, number>;
  blockers: { key: string; summary: string; reason: string }[];
  issues: JiraIssue[];
}

export interface LinkSpec {
  epicKey?: string | null;
  label?: string | null;
  jql?: string | null;
}

export function jqlForLink(l: LinkSpec): string | null {
  if (l.jql?.trim()) return l.jql.trim();
  if (l.epicKey?.trim()) return `parent = "${l.epicKey.trim()}" ORDER BY created ASC`;
  if (l.label?.trim()) return `project = ${PROJECT} AND labels = "${l.label.trim().replace(/"/g, '')}" ORDER BY created ASC`;
  return null;
}

const FIELDS = ['summary', 'status', 'assignee', 'issuetype', 'priority', 'labels', 'issuelinks'];

async function searchAll(jql: string): Promise<any[]> {
  const out: any[] = [];
  let nextPageToken: string | undefined;
  do {
    const { data } = await axios.post(
      `${BASE}/rest/api/3/search/jql`,
      { jql, fields: FIELDS, maxResults: 100, nextPageToken, withoutEmptyFields: true },
      { auth: { username: EMAIL!, password: TOKEN! }, timeout: 20000 },
    );
    out.push(...(data.issues ?? []));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken && out.length < 1000);
  return out;
}

function summarize(jql: string, raw: any[]): JiraSummary {
  const issues: JiraIssue[] = raw.map((r) => {
    const f = r.fields ?? {};
    const blockedBy: string[] = (f.issuelinks ?? [])
      .filter((l: any) => l.type?.name === 'Blocks' && l.inwardIssue)
      .filter((l: any) => l.inwardIssue.fields?.status?.statusCategory?.key !== 'done')
      .map((l: any) => l.inwardIssue.key);
    const labels: string[] = f.labels ?? [];
    return {
      key: r.key,
      summary: f.summary ?? '',
      type: f.issuetype?.name ?? '',
      status: f.status?.name ?? '',
      statusCategory: f.status?.statusCategory?.key ?? 'new',
      assignee: f.assignee?.displayName ?? null,
      priority: f.priority?.name ?? null,
      blockedBy,
      labelBlocked: labels.some((x: string) => /^(blocker|blocked)$/i.test(x)),
      url: `${BASE}/browse/${r.key}`,
    };
  });

  const byStatus: Record<string, number> = {};
  const openByAssignee: Record<string, number> = {};
  let done = 0;
  let inProgress = 0;
  let todo = 0;
  for (const i of issues) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    if (i.statusCategory === 'done') {
      done++;
    } else {
      if (i.statusCategory === 'indeterminate') inProgress++;
      else todo++;
      const who = i.assignee ?? 'Unassigned';
      openByAssignee[who] = (openByAssignee[who] ?? 0) + 1;
    }
  }

  const blockers = issues
    .filter((i) => i.blockedBy.length > 0 || i.labelBlocked)
    .map((i) => ({
      key: i.key,
      summary: i.summary,
      reason: i.blockedBy.length ? `Blocked by ${i.blockedBy.join(', ')}` : 'Label blocker/blocked',
    }));

  return { jql, total: issues.length, done, inProgress, todo, byStatus, openByAssignee, blockers, issues };
}

export async function syncJql(jql: string): Promise<void> {
  const attempted = new Date().toISOString();
  try {
    const summary = summarize(jql, await searchAll(jql));
    await db.execute({
      sql: `INSERT INTO jira_cache (cache_key, data, synced_at, error, attempted_at) VALUES (?, ?, ?, NULL, ?)
            ON CONFLICT(cache_key) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at, error = NULL, attempted_at = excluded.attempted_at`,
      args: [jql, JSON.stringify(summary), attempted, attempted],
    });
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? `${err.response?.status ?? 'network'} ${JSON.stringify(err.response?.data?.errorMessages ?? err.message)}`
      : String(err);
    await db.execute({
      sql: `INSERT INTO jira_cache (cache_key, data, synced_at, error, attempted_at) VALUES (?, NULL, NULL, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET error = excluded.error, attempted_at = excluded.attempted_at`,
      args: [jql, msg, attempted],
    });
  }
}

export async function readCache(jql: string): Promise<{ summary: JiraSummary | null; syncedAt: string | null; error: string | null }> {
  const r = await db.execute(
    { sql: 'SELECT data, synced_at, error FROM jira_cache WHERE cache_key = ?', args: [jql] },
  );
  const row = r.rows[0] as unknown as { data: string | null; synced_at: string | null; error: string | null } | undefined;
  return {
    summary: row?.data ? (JSON.parse(row.data) as JiraSummary) : null,
    syncedAt: row?.synced_at ?? null,
    error: row?.error ?? null,
  };
}

export async function syncAll(): Promise<void> {
  if (!jiraConfigured) return;
  const links = (await db.execute('SELECT epic_key AS epicKey, label, jql FROM feature_jira')).rows as unknown as LinkSpec[];
  const queries = [...new Set(links.map(jqlForLink).filter((q): q is string => Boolean(q)))];
  for (const q of queries) await syncJql(q);
}
