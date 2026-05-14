# memo

Private shared PWA for two people. Sticky-note canvas + disposable camera + song-of-the-day.

See [tech-spec.md](./tech-spec.md) for the architecture, data model, and build plan.
Design artefacts (mood boards) live in [`design/`](./design/).

## Stack

- Next.js 16 + React 19 + App Router + TypeScript strict
- Tailwind CSS v4
- Supabase (Postgres + Storage), accessed server-only
- Vercel for hosting
- PWA, mobile-first (≥44×44 touch targets, no hover affordances)

## Local development

```bash
# 1. Install deps (already done if you ran create-next-app)
npm install

# 2. Set environment variables
cp .env.example .env.local
# then edit .env.local with real values

# 3. Run dev server
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/passphrase`. Enter the value of `MEMO_PASSPHRASE` from `.env.local`.

## Environment variables

All server-only (no `NEXT_PUBLIC_*`). See [tech-spec.md §12](./tech-spec.md).

| Var | Purpose |
|---|---|
| `MEMO_PASSPHRASE` | Shared passphrase that gates the app. |
| `MEMO_SESSION_SECRET` | HMAC key for signing the session cookie. ≥32 random chars. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Server-only. Never commit. |
| `SPOTIFY_CLIENT_ID` | Spotify Developer app client id. |
| `SPOTIFY_CLIENT_SECRET` | Spotify Developer app client secret. |

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql` against the database (via Supabase Studio SQL editor or `psql`).
3. Create a private Storage bucket named `photos`.
4. Copy `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into `.env.local`.

## Project layout

```
app/                # Next.js App Router routes
  passphrase/       # gate
  canvas/           # main surface
  api/session/      # cookie set/clear
components/         # React components
lib/
  session/cookie.ts # HMAC sign/verify
  supabase/server.ts# service-role client
  memo-day.ts       # client mirror of Postgres memo_day()
supabase/
  migrations/       # schema + triggers
design/             # HTML mood boards
proxy.ts            # auth gate middleware (Next 16 calls it "proxy")
tech-spec.md        # spec
```

## Current status

Phase 1 — Foundation. Passphrase gate, schema migration, stub canvas with one hardcoded note. See [tech-spec.md §13](./tech-spec.md) for the phase plan.
