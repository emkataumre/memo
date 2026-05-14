# memo — Technical Specification

Private shared PWA for two people. Sticky-note canvas + disposable camera + song-of-the-day.

Status: **LOCKED v1** (2026-05-13)

---

## 1. Product Summary

Installable PWA at a private URL. Gated by a single shared passphrase. No accounts, no signups. You send your girlfriend the link, she enters the passphrase once, pins to home screen, and she's in.

Three surfaces:

1. **Canvas** — infinite zoom/pan board. Either person drops sticky notes. Today's notes are visually distinct from older ones. All notes live on one persistent canvas forever.
2. **Disposable Camera** — capture photos throughout the day. Hidden from both people until **21:00 Europe/Copenhagen**, then unlocked permanently.
3. **Song of the Day** — pick one Spotify track per day. Appears for the other person immediately.

App name: **memo**. Domain TBD (Vercel subdomain initially, custom later).

### Form factor — mobile only

memo is designed and built **mobile-first**. Two users will pin the PWA to their phone home screens; that is the only intended access pattern.

- **No hover interactions.** Every affordance must respond to tap. Hover-only tooltips, lift-on-hover, and similar are forbidden.
- **Touch targets ≥ 44×44px.**
- **Viewport target:** ~390–430px wide. Test on iPhone 12-class device first.
- Desktop access is not blocked, but the layout is not designed for it.
- Design artefacts in `design/` are previewed at desktop width as mood boards. Production build is phone-first Tailwind responsive.

---

## 2. Identity Model — "No Users"

This is the foundation; everything else follows from it.

- **No Supabase Auth. No login form. No user accounts.**
- The whole app sits behind a single **shared passphrase** (your first-date date, etc.). Set in an env var.
- First visit: passphrase prompt → on success, server sets a long-lived signed session cookie (`memo_session`, 1 year, `HttpOnly`, `SameSite=Lax`, `Secure`).
- Every subsequent request goes through Next.js middleware which checks the cookie. No cookie → redirect to passphrase prompt.
- After passphrase, on first launch each device picks a **"self" tag**: `emo` or `[her]`. Stored in `localStorage.memo_self`. Changeable from a settings screen.
- The "self" tag is attached as `author` on every note/photo/song. It's a **label, not an identity** — nothing prevents someone from changing it. That's fine; there are only two of you and the passphrase already gates entry.

### Why this works
- Two-person trust boundary. The passphrase is the only real gate.
- No password resets, no email flows, no "who am I" confusion when she opens the link.
- Attribution exists for UX ("Emo's notes are blue, hers are pink") without the weight of real auth.

### Security consequence — important
Because there are no per-user JWTs, the **Supabase anon key cannot live in the browser bundle**. If it did, anyone who guessed the app URL could hit Supabase directly and bypass the passphrase. So:

- **All Supabase access goes through Next.js server actions / route handlers.**
- Browser never imports `@supabase/supabase-js` with credentials.
- Server uses the Supabase service-role key (or a custom restricted key) — server-only env var.
- Realtime via direct Supabase client is therefore unavailable. We use **short polling** for cross-device updates (see §10).

---

## 3. Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19** | PWA-friendly, server actions handle the passphrase gate |
| Language | TypeScript strict | Per global preferences |
| Styling | Tailwind CSS v4 | Fast, no design-system overhead |
| Backend | **Supabase** (Postgres + Storage), no Auth | Server-only access |
| Hosting | **Vercel** | Free tier handles this |
| PWA | `@ducanh2912/next-pwa` + hand-rolled `manifest.json` | Installable on iOS/Android |
| Sync | Short polling (2–5s) via server actions | No client-side Supabase = no Realtime; polling fine for 2 users |
| Camera | `<input type="file" accept="image/*" capture="environment">` | Native picker, works in iOS PWA, no `getUserMedia` permission UX |
| Spotify | Web API (Client Credentials, server-side) + Spotify Embed iframe | No per-user OAuth |
| Canvas | Custom CSS-transform pan/zoom + absolutely-positioned cards | tldraw/excalidraw too heavy; we only need pan + zoom + drag |

---

## 4. Memo-day

The "day" for memo purposes is **not the calendar day**. It runs **21:00 → 21:00 Europe/Copenhagen** — the same window as the reveal cycle.

### Definition
- `memo_day(t)` = the date of the next 21:00 Europe/Copenhagen boundary at or after `t`.
- Equivalently: memo-day **D** spans the window `(D-1) 21:00 → D 21:00` in Europe/Copenhagen.
- A memo-day is **named for the date its reveal happens**.

### Examples
| Event time (Europe/Copenhagen) | memo_day |
|---|---|
| Mon May 13 07:42 | **May 13** (reveals tonight at 21:00) |
| Mon May 13 20:59 | **May 13** |
| Mon May 13 21:00 | **May 14** (reveal already happened; rolls to next cycle) |
| Mon May 13 22:30 | **May 14** |
| Tue May 14 01:00 | **May 14** |
| Tue May 14 20:59 | **May 14** |

### Why
- Photos taken in the evening (after 21:00) belong with the **next** reveal, not tonight's.
- Notes added at midnight belong to **tomorrow's** memo-day for today-halo purposes.
- Songs picked at 23:00 are the **next** day's song.

One consistent mental model across all three content types.

### Canonical Postgres function

```sql
create or replace function memo_day(t timestamptz)
returns date as $$
declare
  rh int;
  tz text;
  local_t timestamp;
  boundary timestamptz;
begin
  select reveal_hour, reveal_timezone into rh, tz from settings where id = 1;
  local_t := t at time zone tz;
  boundary := (date_trunc('day', local_t) + (rh || ' hours')::interval) at time zone tz;
  if boundary <= t then
    boundary := boundary + interval '1 day';
  end if;
  return (boundary at time zone tz)::date;
end;
$$ language plpgsql stable;
```

### Where it's used
- **`photos.reveal_at`** — `timestamptz` set by trigger to the memo-day boundary `(memo_day(taken_at) + reveal_hour) at tz`. Encodes the same info as `memo_day(taken_at)` but as a timestamp so the reveal gate is a simple `reveal_at <= now()`.
- **`songs.memo_day`** — `date` column set by trigger to `memo_day(created_at)`. Replaces the earlier `song_date` (calendar-day) field. Uniqueness constraint becomes `(author, memo_day)`.
- **Notes** — no DB column. Client derives `memo_day(created_at)` for today-halo and day-opacity rendering.

### Client mirror

`lib/memo-day.ts` reproduces this logic for client-side grouping (today filter, day-opacity tiers). Settings (`reveal_hour`, `reveal_timezone`) are fetched once per session and cached.

---

## 5. Data Model

```sql
-- One row per content type. No users table.

create table notes (
  id uuid primary key default gen_random_uuid(),
  author text not null,           -- 'emo' | 'her' (free text, validated app-side)
  body text not null,
  color text not null default 'yellow',
  x double precision not null,    -- canvas-space coords
  y double precision not null,
  rotation double precision default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  storage_path text not null,     -- supabase storage key
  taken_at timestamptz default now(),
  reveal_at timestamptz not null, -- set by trigger; encodes memo-day boundary (see §4)
  caption text,
  -- pin-to-canvas (null = lives in gallery only)
  pinned_x double precision,
  pinned_y double precision,
  pinned_rotation double precision default 0,
  pinned_at timestamptz
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  memo_day date not null,         -- set by trigger; see §4. Replaces calendar song_date.
  spotify_track_id text not null,
  track_name text not null,
  artist_name text not null,
  album_art_url text,
  created_at timestamptz default now(),
  -- songs are always visible immediately; no reveal_at
  -- pin-to-canvas
  pinned_x double precision,
  pinned_y double precision,
  pinned_rotation double precision default 0,
  pinned_at timestamptz,
  unique (author, memo_day)
);

-- Trigger: stamp memo_day on insert
create or replace function set_song_memo_day()
returns trigger as $$
begin
  new.memo_day := memo_day(coalesce(new.created_at, now()));
  return new;
end;
$$ language plpgsql;

create trigger songs_set_memo_day
  before insert on songs
  for each row execute function set_song_memo_day();

-- Single-row global settings, DB-only edits (Supabase dashboard)
create table settings (
  id int primary key default 1,
  reveal_hour int not null default 21,
  reveal_timezone text not null default 'Europe/Copenhagen',
  check (id = 1)
);
insert into settings (id) values (1);
```

**RLS:** disabled on all tables. Access is server-only via service-role key; the passphrase gate is the security boundary.

**Storage bucket:** `photos`, private. All reads/writes via server-issued signed URLs. The server only issues a signed URL for a photo if `reveal_at <= now()`.

---

## 6. Canvas Mechanics

**Coordinate system.** Notes and pinned photos/songs live in canvas-space — unbounded float `(x, y)`. Viewport applies a CSS `transform: translate(...) scale(...)`. Pan = drag empty canvas. Zoom = pinch / scroll wheel / ⌘+/−. Zoom range: `0.1×` to `4×`.

**Performance.** Viewport culling + LOD applied from day one. See §14 for full strategy.

**Day segregation — temporal opacity + halo.** Grouping uses **memo-day** (see §4), not calendar day.
- Current memo-day (today's reveal cycle): full opacity, soft glow border (coral).
- Memo-day −1 to −7: 90% opacity, no glow.
- Memo-day −8 or older: 70% opacity.
- **"Jump to today"** FAB pans+zooms to the centroid of items where `memo_day(created_at) = memo_day(now())`. If none, falls back to current viewport center.
- Optional filter chip row: `Today / This week / All` — fades non-matching items to 15%. "Today" = current memo-day; "This week" = memo-day −0 to −6.

**Note placement.**
- Double-tap empty canvas → new note at tap point, autofocused for typing.
- Drag to reposition (only own notes — author check client-side).
- Long-press → menu: color, delete (only on own).
- Partner's notes: **read-only**. No reactions in v1. Reserved as v2 polish.

**Card types on the canvas:**
- `note` — text content.
- `photo` (pinned) — image thumbnail card, tap to open full-size.
- `song` (pinned) — mini Spotify embed card.

All three render in the same canvas-space coord system. Pin/unpin is a per-item toggle from the gallery.

---

## 7. Disposable Camera

**Flow.**
1. Tap camera FAB.
2. Native picker via `<input capture="environment">` → user takes a shot or picks from camera roll.
3. Client resizes to max 2048px long edge, JPEG quality 0.85 (saves storage).
4. `POST /api/photos/upload` (multipart) → server uploads to `photos/{yyyy-mm-dd}/{photo_id}.jpg` and inserts the `photos` row.
5. **Pre-reveal UI:** photo shows as a locked thumbnail — count + "🔒 reveals at 21:00". Neither device fetches the image bytes.
6. **At reveal hour:** photos for that day become viewable. A "Today's reveal" entry point opens a feed of that day's photos.
7. **Post-reveal:** photos live in a per-day gallery (`/gallery/[date]`). Each photo has a **"Pin to canvas"** action — places a card on the canvas at the current viewport center, sets `pinned_x/y` on the row.

**Reveal time computed server-side** via trigger, using the canonical `memo_day()` function from §4:

```sql
create or replace function set_photo_reveal_at()
returns trigger as $$
declare
  rh int;
  tz text;
begin
  select reveal_hour, reveal_timezone into rh, tz from settings where id = 1;
  new.reveal_at := (memo_day(new.taken_at) + (rh || ' hours')::interval) at time zone tz;
  return new;
end;
$$ language plpgsql;

create trigger photos_set_reveal_at
  before insert on photos
  for each row execute function set_photo_reveal_at();
```

**Photo cap:** none.

**Delete pre-reveal:** allowed (author only, client-enforced). Post-reveal: locked.

**Compression:** max 2048px long edge, JPEG 0.85, client-side via canvas `toBlob`.

---

## 8. Song of the Day

**Decision:** Spotify Web API (Client Credentials, server-side) for search + Spotify Embed iframe for playback. No per-user OAuth.

- Server route `POST /api/spotify/search?q=...` — searches Spotify, returns top 10 tracks. Token cached server-side (3600s lifetime, refresh on miss).
- User picks a track → server route `POST /api/songs` inserts the row; trigger stamps `memo_day` from `created_at` (see §4).
- One song per author per memo-day (`unique (author, memo_day)`). Replace today's pick by re-picking — the unique index makes the second insert an upsert from app code.
- **Always visible immediately on add** — no reveal gate.
- Playback: `<iframe src="https://open.spotify.com/embed/track/{id}" allow="encrypted-media">`. 30s preview for non-Spotify users; full track for Spotify users.
- **Pin to canvas:** same as photos — toggle from the song's row in the song log to drop a card on the canvas.

**Env vars (server-only):** `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.

---

## 9. Pinned Cards on the Canvas — UX

This is the integration between the gallery/log views and the canvas.

**Lifecycle.**
- Photos: created in gallery (locked → revealed). Gallery has a per-photo "Pin to canvas" action. Pinning sets `pinned_x/y/rotation/at` on the row; the card now renders on the canvas in addition to the gallery. Unpin clears those columns.
- Songs: same pattern from the song log.

**Placement on pin.** Card spawns at the current viewport center with a small random rotation (±5°). User can drag to reposition; drag updates `pinned_x/y`. Pin coords are author-agnostic — either person can pin/unpin/drag any item.

**Card visuals.**
- Photo card: rounded-corner Polaroid look, thumbnail with date corner-stamp. Tap to open full-size in a modal.
- Song card: square album art + track + artist + tiny play button that expands to the Spotify embed inline.
- Both follow the same day-opacity rule as notes — grouped by memo-day (see §4), derived from `taken_at` for photos and `memo_day` for songs.

**Implementation.**
- Canvas component queries `notes`, `photos where pinned_at is not null`, `songs where pinned_at is not null`.
- One unified `renderCard(item)` switches on type.
- Drag handler writes back through the appropriate `/api/{photos|songs|notes}/move` server action.

---

## 10. Sync — Polling

No client-side Supabase, so no Realtime. Instead:

- Each screen polls a single server action `GET /api/state?since={ts}` every **3 seconds while visible**, paused when tab is hidden (`visibilitychange`).
- Server returns rows changed since `ts` across `notes`, `photos`, `songs`, plus the current server time.
- Client merges by `id`, applying inserts/updates/deletes. Optimistic local writes get reconciled on next poll.
- Bandwidth: trivial. 2 users, polling 3s = ~2 req/min/device when active.

**Phase 2 option:** swap polling for SSE (`/api/stream`) from Next.js to push instead of pull. Same data shape. Defer.

---

## 11. PWA Specifics

- `manifest.json`: `name: "memo"`, `display: standalone`, `theme_color`, `background_color`, full icon set (192, 512, maskable).
- iOS: `apple-touch-icon`, `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`, splash screens for common iPhone sizes.
- Service worker: precache app shell + last-known canvas snapshot for offline viewing. Writes go through normal fetch (fail offline; queue in v2).
- "Add to Home Screen" hint shown once on first session post-passphrase.

---

## 12. Hosting & Secrets

- **Vercel** project. Custom domain later.
- **Supabase** project, free tier. DB <500MB, storage <1GB easily.
- **Spotify Developer** app — client id + secret.
- Vercel env vars (all server-side):
  - `MEMO_PASSPHRASE` — the shared passphrase.
  - `MEMO_SESSION_SECRET` — HMAC key for signed cookie.
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SPOTIFY_CLIENT_ID`
  - `SPOTIFY_CLIENT_SECRET`
- **No `NEXT_PUBLIC_*` secrets.** Browser bundle holds nothing sensitive.

---

## 13. Build Phases

**Phase 1 — Foundation.**
- Next.js scaffold, Tailwind, Supabase project, schema + trigger migration.
- Passphrase gate (server action + signed cookie + middleware).
- Device "self" picker on first launch.
- "Hello world" canvas with one hardcoded note.

**Phase 2 — Canvas + notes (with perf baked in).**
- Pan/zoom viewport.
- **Spatial index** (1000×1000 grid map) + **viewport culling** with 20% margin.
- **LOD renderer** (full / simplified / dot tiers, zoom-driven).
- **CSS `contain: content`** on every card; `will-change: transform` only during active drag.
- **IndexedDB cache** of fetched rows; cold boot reads cache first, then polls deltas.
- Sticky note CRUD (create, drag, edit own, delete own).
- Day-based opacity + "Jump to today".
- Polling sync (`since=ts`).

**Phase 3 — Camera (with perf baked in).**
- Photo capture + client resize.
- **Thumbnail generation on upload** — 256px thumb + full-res, both to Storage. Canvas/gallery cards load thumb only; tap fetches full.
- Reveal trigger + locked/unlocked rendering.
- Per-day gallery view.
- Pin-photo-to-canvas.

**Phase 4 — Song of the day (with perf baked in).**
- Spotify search route + token cache.
- Song picker UI.
- Song log view.
- **Lazy Spotify embed** — card renders static album art + play button; iframe mounts only on tap, unmounts when card scrolls/zooms off-screen.
- Pin-song-to-canvas.

**Phase 5 — PWA polish.**
- Manifest + icons + iOS splash.
- Service worker shell cache.
- Install prompt.

**Phase 6 — Nice-to-haves (deferred).**
- Reactions on partner's notes.
- Push notifications at reveal hour.
- Offline write queue.
- SSE replacing polling.
- **Spatial server fetch** (`?bbox=...`) once cold-load JSON >2MB.
- **Bulk canvas rearrangement** — multi-select, lasso, move groups, reposition partner's items. Per-item drag of own items stays in Phase 2. This is the harder version at scale where many items overlap and tooling needs care (group select, snap, undo).

---

## 14. Scale & Performance

Canvas grows forever. Girlfriend takes many photos. Plan for ~25k cards over 5 years. Day-one work below; no retrofits later.

### 14.1 Volume model
- Notes: ~3,650/year (~10/day across both).
- Pinned photos: ~500/year (assumes ~1–2 of her shots/day get pinned; rest stay in gallery).
- Pinned songs: ~50/year.
- **5-year total ≈ 20–25k cards.**

### 14.2 Bottlenecks at scale
1. DOM node count — mobile chokes past ~5–10k absolutely-positioned nodes.
2. React mount cost on cold boot.
3. Cold-load JSON payload (~5MB at 25k rows).
4. Image bytes if full-res thumbnails load on canvas.
5. Spotify embed iframes — heaviest per-card cost.
6. Drag latency when sibling count is huge.

### 14.3 Day-one mitigations (all baked into Phase 1–4)

**Viewport culling.**
- Spatial index: hash map keyed by grid cell. Cell size = 1000×1000 canvas units.
- On insert/move: place item in cell `(floor(x/1000), floor(y/1000))`.
- On render: compute viewport bbox in canvas-space → enumerate cells it touches (+20% margin) → render only items in those cells.
- Lookup is O(visible cells × items-per-cell), not O(total).
- Code: `lib/canvas/spatial-index.ts`.

**Level-of-detail (LOD).**
| Zoom | Render |
|---|---|
| `≥ 1.0` | Full card — text, thumb, controls. |
| `0.4–1.0` | Simplified — truncated text, thumb, no controls, no embeds. |
| `< 0.4` | Dot only — single `<div>` with author color, ~6×6px. |
- LOD tier computed per card per frame from current `zoom`. Re-render only when crossing a tier boundary.
- Dot tier is cheap enough that 25k of them is fine.
- Code: `lib/canvas/lod.ts`.

**Lazy Spotify embed.**
- Default render: static `<img>` of album art + custom play button.
- On tap: swap to `<iframe src="https://open.spotify.com/embed/track/{id}">`.
- On card leaving viewport (culling unmounts it) or LOD dropping below `≥ 1.0`: iframe unmounts automatically.
- Never more than ~5 embeds live at once.

**Image thumbnails.**
- Upload pipeline produces two objects per photo: `photos/{date}/{id}.jpg` (full, max 2048px) and `photos/{date}/{id}_thumb.jpg` (256px square crop).
- Canvas/gallery cards use signed URL of `_thumb`. Tap opens modal with full.
- Generated client-side via `canvas.toBlob` before upload; both uploaded in one request.

**CSS containment.**
- Every card: `contain: content` (isolates layout + paint).
- Only during active pointer-drag: add `will-change: transform`. Remove on pointerup. Keeping `will-change` always-on burns GPU memory at scale.

**IndexedDB row cache.**
- On boot: read all cached rows from IndexedDB → seed in-memory store → render immediately.
- Then poll `?since={max_updated_at_in_cache}` → merge deltas → persist back to IndexedDB.
- Cold-load network round-trip happens once per device, not per session.
- Library: `idb` (small wrapper over native IndexedDB). Stores: `notes`, `photos`, `songs`, `meta`.
- Cache invalidation: on row delete, server returns tombstones in delta response; client removes locally.

### 14.4 Deferred (apply when cold-load JSON >2MB or DB rows >50k)

**Spatial server fetch.** Add a `point` column on each table + GiST index. `GET /api/state?bbox=x1,y1,x2,y2&since=ts`. Server returns delta + items intersecting bbox. Client requests neighboring bboxes as user pans. Combined with IndexedDB, network cost stays flat as canvas grows.

### 14.5 Acceptance targets

- Cold boot to first paint of canvas: **<800ms** on iPhone 12.
- Pan/zoom at 25k items: **sustained 60fps** on iPhone 12.
- Adding a note: **<100ms** local round-trip (optimistic write).
- Memory at 25k items, fully loaded: **<150MB** RSS in Safari.

---

## 15. Repo Layout

```
memo/
├─ app/
│  ├─ (gated)/              # routes behind passphrase
│  │  ├─ canvas/page.tsx
│  │  ├─ gallery/[date]/page.tsx
│  │  ├─ songs/page.tsx
│  │  └─ settings/page.tsx
│  ├─ passphrase/page.tsx   # gate
│  ├─ api/
│  │  ├─ session/route.ts          # set/clear session cookie
│  │  ├─ state/route.ts            # poll endpoint
│  │  ├─ notes/route.ts            # CRUD
│  │  ├─ photos/upload/route.ts
│  │  ├─ photos/[id]/route.ts      # pin/unpin/move/delete
│  │  ├─ photos/[id]/signed/route.ts
│  │  ├─ songs/route.ts
│  │  └─ spotify/search/route.ts
│  ├─ middleware.ts          # cookie check
│  └─ layout.tsx
├─ components/
│  ├─ canvas/Viewport.tsx
│  ├─ canvas/StickyNote.tsx
│  ├─ canvas/PhotoCard.tsx
│  ├─ canvas/SongCard.tsx
│  ├─ camera/CaptureButton.tsx
│  ├─ gallery/PhotoTile.tsx
│  └─ songs/SongPicker.tsx
├─ lib/
│  ├─ supabase/server.ts        # service-role client
│  ├─ session/cookie.ts         # HMAC sign/verify
│  ├─ memo-day.ts               # client mirror of Postgres memo_day()
│  ├─ spotify/client.ts         # token cache + search
│  ├─ canvas/transform.ts       # pan/zoom math
│  ├─ canvas/spatial-index.ts   # grid map, O(visible cells) lookup
│  ├─ canvas/lod.ts             # zoom → tier resolver
│  ├─ cache/indexeddb.ts        # idb-backed row cache
│  ├─ image/resize.ts           # client compression
│  └─ image/thumbnail.ts        # 256px thumb generator
├─ supabase/migrations/
│  └─ 0001_init.sql
├─ public/
│  ├─ manifest.json
│  └─ icons/
└─ tech-spec.md
```
