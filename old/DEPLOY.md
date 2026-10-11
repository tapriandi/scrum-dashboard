# Deploy scrum-dashboard (free, ~30 min one-time)

## 1. GitHub (code home)

1. Sign up https://github.com (skip if have account)
2. Create new repo `scrum-dashboard`, keep it **Private**
3. Then locally:

```bash
cd /Users/andi/Desktop/Golfer/scrum-dashboard
git remote add origin https://github.com/<YOUR-USERNAME>/scrum-dashboard.git
git push -u origin main
```

## 2. Turso (database home, free)

```bash
# install CLI
curl -sSfL https://get.tur.so/install.sh | bash
# login (opens browser)
turso auth signup        # or: turso auth login
# create DB
turso db create scrum-dashboard
turso db show scrum-dashboard --url          # copy this = TURSO_DATABASE_URL
turso db tokens create scrum-dashboard       # copy this = TURSO_AUTH_TOKEN
```

## 3. Migrate existing data (8 features) to Turso

```bash
cd server
TURSO_DATABASE_URL=<paste-url> TURSO_AUTH_TOKEN=<paste-token> npm run seed
cd ..
```

## 4. Vercel (hosting, free)

1. Sign up https://vercel.com with GitHub account (click "Continue with GitHub")
2. "Add New..." → "Project" → import your `scrum-dashboard` repo
3. Framework Preset: **Other** (leave auto-detect if it picks correctly)
4. Before clicking Deploy → "Environment Variables", add ALL of these:

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | from step 2 |
| `TURSO_AUTH_TOKEN` | from step 2 |
| `AUTH_PASSWORD` | pick a password, share with team |
| `JIRA_BASE_URL` | `https://bomber-org.atlassian.net` |
| `JIRA_EMAIL` | your Atlassian email |
| `JIRA_API_TOKEN` | from https://id.atlassian.com/manage-profile/security/api-tokens |
| `JIRA_PROJECT_KEY` | `GF` |

5. Click **Deploy**. Wait ~2 min. You get URL like `https://scrum-dashboard.vercel.app`

## 5. Verify

1. Open URL → asks your name → then dashboard loads
2. If blank/error → Vercel dashboard → your project → "Deployments" → latest → "Functions" tab shows errors
3. Jira panel: click Refresh → progress bars fill within seconds

## 6. Update later

```bash
git add -A && git commit -m "change" && git push
```

Vercel auto-deploys every push. Nothing else to maintain.

## Cost

GitHub $0, Turso free tier (500 DBs, 9GB, plenty), Vercel Hobby $0 (100GB bandwidth/mo, fine for internal dashboard). Total: $0/month.

## Caveats

- Vercel Hobby = non-commercial use. If company policy strict, use Vercel Pro ($20/mo) or Render free tier.
- Team shares one password (AUTH_PASSWORD). Good enough for internal tool. Per-user Jira tokens never leave server.
- Vercel serverless has no `setInterval` — Jira sync runs on-demand (Refresh button + first page load hits cached data). 5-min auto-refresh interval only works locally.
