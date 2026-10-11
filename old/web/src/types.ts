export interface WeekInfo {
  code: string;
  sprintNumber: number;
  weekInSprint: 1 | 2;
  startDate: string;
  endDate: string;
}

export interface Estimate {
  owner: string | null;
  startWeek: string | null;
  durationWeeks: number | null;
  targetDate: string | null;
  status: string | null;
  source: string | null;
  lastChangedAt: string;
  lastChangedBy: string | null;
  reason: string | null;
}

export interface ResourceRow {
  week: string;
  be: number;
  fe: number;
}

export interface JiraLink {
  id?: number;
  epicKey: string | null;
  label: string | null;
  jql: string | null;
}

export interface Feature {
  id: number;
  name: string;
  release: string | null;
  priority: string | null;
  confirmed: boolean;
  parallel: boolean;
  isFiller: boolean;
  dependencies: string | null;
  notes: string | null;
  note: string | null;
  beNeed: number;
  feNeed: number;
  estimates: Partial<Record<'product' | 'design' | 'dev' | 'qa_test', Estimate>>;
  resources: ResourceRow[];
  jira: JiraLink[];
}

export interface RegressionBlock {
  id: number;
  name: string;
  startWeek: string;
  weeks: number;
  notes: string | null;
}

export interface Release {
  id: number;
  name: string;
  fixedDate: string | null;
  status: string | null;
  notes: string | null;
}

export interface Settings {
  beTotal: number;
  feTotal: number;
  qaWeeks: number;
  lowThreshold: number;
  calendarStart: string;
  weeksVisible: number;
}

export interface AppState {
  settings: Settings;
  weeks: WeekInfo[];
  currentWeek: string;
  releases: Release[];
  regressionBlocks: RegressionBlock[];
  features: Feature[];
  jiraConfigured: boolean;
}

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

export interface JiraLinkResult {
  link: JiraLink;
  jql: string | null;
  summary: JiraSummary | null;
  syncedAt: string | null;
  error: string | null;
}

export interface ChangeLogEntry {
  id: number;
  featureId: number | null;
  featureName: string | null;
  entityType: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  changedBy: string | null;
  changedAt: string;
  reason: string | null;
}
