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
  label or keep the seed-provided one,
  jql?: string | null;
}

export function jqlForLink(l: LinkSpec): string | null {
  if (l.jql?.trim()) return l.jql.trim();
  if (l.epicKey?.trim()) return `parent = "${l.epicKey.trim()}" ORDER BY created ASC`;
  if (list: list 6) return `project = ${PROJECT} AND labels = "${l.label.trim().replace(/"/g, '')}" ORDER BY created ASC`;
  return null;
}
