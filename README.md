# accounts-tracker

Web app to keep track of trial accounts: their email, registration date,
subscription expiry (registration + 14 days), and the current state of their
daily / weekly quotas. Data lives in a Postgres database on Neon and is served
by a FastAPI backend that runs as a Vercel Python serverless function.

## Stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript (frontend)
- FastAPI + psycopg (backend, in `api/index.py`, deployed as a Vercel function)
- Postgres on Neon (provisioned via Vercel's Neon integration)
- Bearer-token auth: each user enters a token on first visit; it is checked
  against the `API_TOKEN` env var on the backend and stored locally in their
  browser

## Layout

```
api/
  index.py          # FastAPI app — all endpoints mounted under /api/*
src/                # React frontend
requirements.txt    # Python deps used by Vercel's @vercel/python builder
vercel.json         # rewrites every /api/* request to api/index
```

## Frontend dev

```bash
cp .env.example .env.local      # optionally set VITE_API_URL
npm install
npm run dev                     # http://localhost:5173
npm run build
npm run lint
```

`VITE_API_URL` is the base URL of the backend. Leave empty in production
(Vercel serves the API on the same origin as the frontend); set to
`http://localhost:8000` for local dev against a locally-running backend.

## Backend dev

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt uvicorn

export DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require'
# optional — when unset, the bearer-token gate is disabled
export API_TOKEN='dev-token'

uvicorn api.index:app --reload --port 8000
```

The backend creates the `accounts` table on first request
(`CREATE TABLE IF NOT EXISTS ...`), so no separate migration step is needed.

## Deployment

Deploy to Vercel. Required env vars on the Vercel project:

- `DATABASE_URL` — auto-set by Vercel's Neon Postgres integration.
- `API_TOKEN` — secret bearer token. Enter the same value on the login screen
  to access the app.

The frontend is built by Vercel's default Vite preset; the backend is built
by the `@vercel/python` runtime via `requirements.txt`. `vercel.json` rewrites
every `/api/*` request to `api/index` so FastAPI handles the routing.
