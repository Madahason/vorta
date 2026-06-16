# Deployment Guide

## Branch Strategy

| Branch | Purpose | Auto-deploys |
|--------|---------|--------------|
| `main` | Development | Never |
| `production` | Live site | Yes — Railway watches this branch |

## Deploy to production

When you're ready to push changes to the live site, run from the repo root:

```bash
npm run deploy
```

This merges `main` into `production`, pushes both, and triggers a Railway rebuild automatically.

Alternatively, do it manually:

```bash
git checkout production
git merge main
git push origin production
git checkout main
```

Allow 5–10 minutes for the Docker build to complete.

## Rollback

If a deployment breaks the live site:

1. Go to [railway.app](https://railway.app) → your project → **Deployments**
2. Find the last working deployment
3. Click **Redeploy**

## Health check

Verify the live deployment:

```
https://bizcontently.com/health
```

Should return `{ "status": "ok", ... }`.

## Environment Variables (set in Railway dashboard)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS |
| `PEXELS_API_KEY` | Stock footage |
| `PIXABAY_API_KEY` | Stock footage |
| `BASIC_AUTH_USER` | App login username |
| `BASIC_AUTH_PASS` | App login password |
| `HIGGSFIELD_ACCESS_TOKEN` | Higgsfield image gen |
| `HIGGSFIELD_REFRESH_TOKEN` | Higgsfield image gen |
| `NODE_ENV` | Set to: `production` |
| `PORT` | Set to: `3001` |
| `PUPPETEER_EXECUTABLE_PATH` | Set to: `/usr/bin/chromium` |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Set to: `0` |

## Domain

`bizcontently.com` → Railway service

DNS records are set at your domain registrar (values provided in the Railway dashboard under **Settings → Domains**).
