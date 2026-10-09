# Scrum Planning Dashboard

Jira (read-only) shows task progress per feature. This dashboard owns the delivery plan: Product and Dev estimates, BE/FE people per week, capacity, and earliest release date.

Stack: Express 5 + TypeScript + SQLite (`node:sqlite`, Node 22+) on the server, Vite + React 18 + Tailwind + TanStack Query on the web. Same family as `golfer-design-review` and `golfer-web`, but standalone (not part of the Nx workspace).

## Run

```bash
# 1. server
cd server
npm install
cp .env.example .env        # then fill in the Jira values
npm run seed                # creates ../data/dashboard.db
npm run dev                 # http://127.0.0.1:4000

# 2. web (new terminal)
cd web
npm install
npm run dev                 # http://localhost:5174
```

On first load the browser asks for your name. It is stored in localStorage and sent as `X-User`, so every change log entry has a "who". There is no real auth, and the server only listens on 127.0.0.1.

## Jira env vars

Set in `server/.env` (git-ignored). Jira is only called from the server, never from the browser.

| Var | Example |
| --- | --- |
| `JIRA_BASE_URL` | `https://bomber-org.atlassian.net` |
| `JIRA_EMAIL` | your Atlassian email |
| `JIRA_API_TOKEN` | token from https://id.atlassian.com/manage-profile/security/api-tokens |
| `JIRA_PROJECT_KEY` | `GF` |

Without them the app still runs, with a "Jira not configured" badge.

## Map a feature to Jira

Open a feature, then "Jira" panel, enter epic keys (comma separated, e.g. `GF-4446, GF-4445`), Save links. The server fetches child issues with `parent = <epic>` and caches the result in SQLite. It re-syncs every 5 minutes and on the Refresh button. If Jira is down, the last cached data is shown with its "last synced" time. No websockets, no writes to Jira.

Blockers are detected from an open "is blocked by" link or a `blocker`/`blocked` label. A status named "Blocked" is not checked.

## Edit seed data

Edit `server/src/seed.data.json`, then:

```bash
cd server && npm run seed -- --reset   # WIPES all local data, including your edits and change log
```

Without `--reset` the seed refuses to run on a non-empty DB. Resources are intentionally empty in the seed. Week codes look like `S56W2`; the calendar starts at `settings.calendar_start` (Sprint 55 Week 1, Mon 28 Sep 2026).

## How the numbers work

- Bar end = last Friday of the final week of the bar. Fractional durations round up to whole weeks (1.5 sprints = 3 weeks).
- Earliest release = Dev end + QA weeks (default 2, editable on the Features and Capacity pages).
- Allocation for a week = explicit resource row if present, else the feature's "people needed" (BE/FE) on weeks inside its Dev bar.
- Free = total people minus allocated. Red = negative (over-allocated). Green = free above the low-workload threshold.
- A dashed bar means the feature is not confirmed, or the estimate status is `pending`/`to_confirm`.

## Seed caveats

- Refund Flow, Financial Report EGUI, Locker Number: only the Product end date was given, so Product is seeded as a 1-week bar in that week. Set the real start and duration.
- Financial Report Export: Dev start `S56W1`, 2 weeks, was assumed from "1 sprint within S56". Adjust it.
- Reservation List Daily: Product seeded in `S55W2` ("final week").
- Release 16 Oct is a fixed-date marker on the timeline.

## Not built yet

Release planner screen and export (timeline image/HTML, one-line-per-feature summary). Earliest release date per feature is already shown on the Features page.

## Checks

```bash
cd server && npm run typecheck
cd web && npm run build
cd web && ../server/node_modules/.bin/tsx src/schedule.check.ts
```
