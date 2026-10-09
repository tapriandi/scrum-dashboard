import { getUser } from './user';
import type { AppState, ChangeLogEntry, JiraLink, JiraLinkResult } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user': encodeURIComponent(getUser()),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  getState: () => request<AppState>('/state'),
  createFeature: (name: string) => request<{ id: number }>('/features', { method: 'POST', body: JSON.stringify({ name }) }),
  patchFeature: (id: number, patch: Record<string, unknown>) =>
    request('/features/' + id, { method: 'PATCH', body: JSON.stringify(patch) }),
  putEstimate: (id: number, kind: 'product' | 'dev', body: Record<string, unknown>) =>
    request(`/features/${id}/estimate/${kind}`, { method: 'PUT', body: JSON.stringify(body) }),
  putResources: (id: number, rows: { week: string; be: number; fe: number }[], reason?: string) =>
    request(`/features/${id}/resources`, { method: 'PUT', body: JSON.stringify({ rows, reason }) }),
  putJiraLinks: (id: number, links: JiraLink[]) =>
    request(`/features/${id}/jira`, { method: 'PUT', body: JSON.stringify({ links }) }),
  getJiraForFeature: (id: number) => request<JiraLinkResult[]>(`/features/${id}/jira`),
  syncJira: () => request('/jira/sync', { method: 'POST' }),
  putSettings: (patch: Record<string, unknown>) => request('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  changelog: (featureId?: number, limit = 200) =>
    request<ChangeLogEntry[]>(`/changelog?limit=${limit}${featureId ? `&featureId=${featureId}` : ''}`),
};
