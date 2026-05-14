# memo — Technical Specification

Private shared PWA for two people. Sticky-note canvas + disposable camera + song-of-the-day.

Status: **v2 — Phases 1–5 shipped** (2026-05-14)

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
- After passphrase, on first launch each device picks a **"self" tag**: `emo` or `magi`. Stored in `localStorage.memo_self`. Changing later: clear `memo_self` via DevTools (no settings UI yet — TODO).
- The "self" tag is attached as `author` on every note/photo/song. It's a **label, not an identity** — nothing prevents someone from changing it. That's fine; there are only two of you and the passphrase already gates entry.
- Passphrase prompt is a **digit-only on-screen numpad** (no system keyboard). Display shows entered dots; backspace + enter as separate keys.

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
| Framework | **Next.js 16 (App Router) + React 19** | PWA-friendly; middleware (now called `proxy.ts`) handles the passphrase gate |
| Language | TypeScript strict | Per global preferences |
| Styling | Tailwind CSS v4 (`@theme inline`) | Fast, no design-system overhead. Design tokens live in `globals.css`. |
| Backend | **Supabase** (Postgres + Storage), no Auth | Server-only access |
| Hosting | **Vercel** | Free tier handles this |
| PWA | `app/manifest.ts` + dynamic icons via `next/og` `ImageResponse` | No `next-pwa` lib; built into Next 13+ conventions |
| Sync | Short polling (3s) via `GET /api/state` server route | No client-side Supabase = no Realtime; polling fine for 2 users |
| Camera | `<input type="file" accept="image/*" capture="environment">` | Native picker, works in iOS PWA, no `getUserMedia` permission UX |
| Spotify | Web API (Client Credentials, server-side) + Spotify Embed iframe | No per-user OAuth |
| Canvas pan/zoom | **`@use-gesture/react`** + CSS transform | Library handles cross-browser pointer/wheel quirks. Pinch zoom intentionally disabled — on-screen controls only. |
| Canvas perf | Custom `lib/canvas/spatial-index.ts` + `lib/canvas/lod.ts` + `idb` row cache | Built ourselves — exact fit for our card model |

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
  author text not null,           -- 'emo' | 'magi' (free text, validated app-side)
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

**Coordinate system.** Notes and pinned photos/songs live in canvas-space — unbounded float `(x, y)`. Viewport applies a CSS `transform: translate(...) scale(...)`. Zoom range: `0.1×` to `4×`.

**Interactions (mobile-first).**
- **Pan** — single-finger drag from anywhere on canvas. Works even when the drag begins on top of a card (long-press hasn't fired → swipe through).
- **Zoom** — on-screen controls (`+ / − / FIT`) mid-right, plus live percentage. **Pinch zoom is intentionally disabled** — too unreliable on iOS Safari; controls are the only zoom path.
- **Wheel zoom** (desktop) — RAF-coalesced, per-event `dy` clamped ±80.
- **Drag a note** — long-press 600ms on own note arms drag (haptic vibrate, coral pulse). Then drag freely; release to commit. Drift before HOLD_MS cancels the arm and the gesture becomes a pan instead. Partner's notes: read-only.
- **Drag a photo/song card** — same long-press model. Pin coords author-agnostic; either person can drag any pinned card.
- **Card / pan handoff** — when a card enters drag mode, a shared ref flag tells `@use-gesture` to `cancel()` its drag so the viewport doesn't pan in parallel.
- **New note** — tap `+` FAB (bottom-center) → composer at viewport center.
- **Tap a pinned photo** — opens full-size `PhotoViewer` modal.
- **Tap a pinned song's play button** — mounts the Spotify `<iframe>` inline (lazy).

**Performance.** Viewport culling + LOD applied from day one. See §14 for full strategy.

**Day segregation — temporal opacity + halo.** Grouping uses **memo-day** (see §4), not calendar day.
- Current memo-day items: 4px coral outline, full opacity.
- Older items: full opacity (day-opacity fade was removed — context already obvious from canvas position).
- **Jump-to-today** chip (top-left, doubles as `TodayAnchor`) computes bbox of today's items and animates a `FIT` (pan + zoom). Empty today → centers at zoom 1.

**Chrome surfaces (canvas page).**
- Topbar: `memo` brand left, state-driven center chip (countdown ↔ today-reveal CTA), archive icon, `zen` button.
- TodayAnchor: top-left pill — coral star + date + today count. Tap → fit today.
- MiniMap: top-right, **only when `zoom < 0.15`** — read-only orientation widget. Items as colored dots + coral viewport rectangle. Hidden when canvas empty.
- ZoomControls: mid-right vertical — `+ / − / FIT / %`.
- FAB bar: bottom-center horizontal — camera, primary `+` note (larger coral), song.

**Zen mode.** Tap the `zen` button in topbar → all chrome hides except a small `✕` exit pill (top-right) and a faded zoom bar at the bottom (`− / FIT / +`). Cards become non-interactive (`interactive={!zen}`). Canvas pan still works.

---

## 7. Disposable Camera

**Flow.**
1. Tap camera FAB.
2. Native picker via `<input capture="environment">` → user takes a shot or picks from camera roll.
3. Client resizes to max 2048px long edge, JPEG quality 0.85 (saves storage).
4. Client also generates a 256px square-cropped thumb (`lib/image/thumbnail.ts`).
5. `POST /api/photos/upload` (multipart, both blobs + author) → server uploads to `photos/{memo-day}/{photo_id}.jpg` and `..._thumb.jpg`, then inserts the row. Rollback on partial failure.
6. **Pre-reveal UI:** photo shows in `LockedRoll` sheet (tap countdown chip in topbar). Tile renders a black film backdrop with halftone + diagonal hatch + coral lock icon + time stamp. State endpoint returns `locked: true` with no URLs.
7. **At reveal hour:** server starts emitting signed URLs (`thumb_url`, `full_url`). The topbar's center chip flips from countdown → coral `today · N →`.
8. **RevealSheet** (tap the today chip): grid of all photos revealed in the last 24h. Pinned tiles stay visible alongside unpinned (toggle between pin / unpin actions per tile). Hero: `tonight.` Caprasimo + scattered SVG sparkles + author tally.
9. **Pin a photo** → `pinned_x/y/rotation/at` set on row; appears on canvas as `PhotoCard`. **Unpin** clears only `pinned_at` — `pinned_x/y` preserved so a re-pin restores last position.
10. **Archive** view (`ArchiveSheet`, opened via topbar icon): tabs `PHOTOS / SONGS`, filter `ALL / EMO / MAGI`, day-by-day grouped grid. Tap a photo → opens `PhotoViewer` full-screen.

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

- Server route `GET /api/spotify/search?q=...` — proxies Spotify search, returns top 10 tracks. Token cached server-side (3600s lifetime, refresh on miss / 401).
- User picks a track → `SongPicker` modal fires `POST /api/songs` with optional `pin: { x, y, rotation }` (default: viewport center). Trigger stamps `memo_day` from `created_at` (see §4).
- **One song per author per memo-day, server-enforced.** `POST /api/songs` checks for existing `(author, memo_day)` and returns **HTTP 409** if found — no replace. Client mirrors this: `SongPicker` renders a locked state ("today's pick · locked in") when `todaysOwnSong` exists; no search input.
- **Always visible immediately on add** — no reveal gate.
- Playback: **lazy** `<iframe src="https://open.spotify.com/embed/track/{id}">`. Default render = static album art + coral ▶ button. Iframe only mounts on tap; auto-unmounts when card leaves tier 0 (zoomed out) or enters drag mode.
- **Pin to canvas:** songs auto-pin at viewport center on initial pick. Long-press to move. Tap album art for inline embed.

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

- Each screen polls a single server route `GET /api/state?since={ts}` every **3 seconds while visible**, paused when tab is hidden (`visibilitychange`).
- Server returns:
  - Notes whose `updated_at > since` (delta).
  - All photos (small volume), with `locked: true | false`. Revealed photos include `thumb_url` + `full_url`.
  - All songs (small volume).
  - Current server time (next `since` cursor).
- Client merges by `id`, applying inserts/updates. Optimistic local writes get reconciled on next poll.
- Bandwidth: trivial. 2 users, polling 3s = ~2 req/min/device when active.

**Signed URL caching.** Each `/api/state` call previously minted fresh Supabase signed URLs per photo, which changed every poll and caused image re-fetch flicker. Server now keeps a module-scope `Map<photoId, { thumbUrl, fullUrl, expiresAt }>` with **55-minute TTL** (5 min leeway under Supabase's 1-hour signed-URL lifetime). Same URL string returned across polls → browser HTTP-caches the image → no flicker.

**Phase 6 option:** swap polling for SSE (`/api/stream`) from Next.js to push instead of pull. Same data shape. Defer.

---

## 11. PWA Specifics

Uses Next 13+ icon + manifest conventions; no third-party PWA lib.

- **`app/manifest.ts`** — typed `MetadataRoute.Manifest`. `start_url: /canvas`, `display: standalone`, `theme_color: #181615`, `background_color: #F2E8D5`, `orientation: portrait`. Icon entries reference the dynamic routes below (`/icon`, `/icon1` — including `purpose: maskable` for the 512px — and `/apple-icon`). Served at `/manifest.webmanifest`.
- **`app/icon.tsx`** — 192×192 PNG via `next/og` `ImageResponse`. Paper bg + coral `m` (Georgia serif fallback; Caprasimo embed via base64 woff2 is a Phase 6 polish).
- **`app/icon1.tsx`** — 512×512 PNG. Coral bg + paper `m`. Doubles as maskable.
- **`app/apple-icon.tsx`** — 180×180 PNG for iOS home-screen.
- **`app/layout.tsx` metadata**:
  - `appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "memo" }`
  - `formatDetection: { telephone: false, email: false, address: false, date: false }` — prevents iOS auto-linking dates / numbers inside note bodies.
- **Proxy allowlist** — `proxy.ts` permits `/manifest.webmanifest`, `/icon`, `/icon1`, `/apple-icon` through without the passphrase cookie so they're fetchable for the install prompt.
- **`components/InstallHint.tsx`** — iOS-only one-time banner: "tap ⬆ then add to home screen." Hidden after first dismiss (`localStorage.memo_install_dismissed`). Suppressed when already in `display-mode: standalone` (i.e. installed).

**Not yet implemented** (Phase 6 backlog):
- Service worker for app-shell offline cache.
- iOS splash screens (per-device).
- Real Caprasimo glyph in icons (currently Georgia serif fallback).

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

**Phase 1 — Foundation. ✓ Shipped.**
- Next.js scaffold, Tailwind v4, Supabase schema + `memo_day()` function + photo/song triggers.
- Passphrase gate (numpad UI, HMAC-signed cookie via Web Crypto, `proxy.ts` middleware).
- Device "self" picker on first launch (emo / magi).
- Canvas page shell.

**Phase 2 — Canvas + notes (perf baked in). ✓ Shipped.**
- Pan via `@use-gesture/react`; wheel zoom RAF-coalesced + clamped; pinch zoom disabled.
- Spatial index (1000-unit grid) + viewport culling with 20% margin.
- LOD renderer (full / simplified / minimal tiers, footprint preserved across tiers).
- `contain: content` on every card; `will-change: transform` only during active drag.
- IndexedDB cache (`idb`) of notes/photos/songs/meta.
- Sticky note create (FAB → composer at viewport center), long-press 600ms to drag own (drift-through-card pans canvas instead). Delete removed per UX call.
- Coral today-halo via memo-day grouping.
- 3-second polling with `since` cursor.

**Phase 3 — Camera (perf baked in). ✓ Shipped.**
- `<input capture>` flow, client 2048px resize + 256 thumb, multipart upload to Supabase Storage.
- Reveal trigger (Postgres `set_photo_reveal_at` → next 21:00 boundary).
- `LockedRoll` sheet (artefact 02), `RevealSheet` (artefact 03, with persistent pinned tiles + unpin toggle), `ArchiveSheet` (artefact 04 with PHOTOS/SONGS tabs + author filter).
- Pin / unpin / move with **coord persistence on unpin** so re-pin restores last position.

**Phase 4 — Song of the day (perf baked in). ✓ Shipped.**
- Spotify Client Credentials token cache + `/api/spotify/search` proxy.
- `SongPicker` with debounced search (300ms) + locked state when today's pick already exists.
- **One-per-day enforced server-side** (409 on duplicate).
- Lazy Spotify embed — static art + ▶ button by default; iframe only mounts on tap and auto-unmounts when card leaves LOD tier 0 or enters drag.
- Auto-pin at viewport center on initial pick.

**Phase 5 — PWA polish. ✓ Shipped.**
- `app/manifest.ts`, dynamic icons (192 / 512 / 512-maskable / 180 apple).
- `appleWebApp` meta, `formatDetection` off.
- `InstallHint` iOS one-time banner.

**Phase 6 — Backlog (deferred).**
- **Service worker offline shell** — precache app shell + cache last-known canvas state from IndexedDB so the app boots cold offline.
- **Push notifications at 21:00** — web-push API + permission flow on first reveal cycle. iOS Safari supports PWA push since 16.4.
- **SSE replacing polling** — `/api/stream` from Next.js. Lower latency, no functional gain at 2 users; revisit if Supabase query count becomes a cost issue.
- **Spatial server fetch** — `GET /api/state?bbox=x1,y1,x2,y2&since=ts` with GiST index on a `point` column. Apply when cold-load JSON > 2 MB or DB rows > 50k.
- **Bulk canvas rearrangement** — multi-select, lasso, group move, reposition partner's items. Current per-item long-press drag stays in Phase 2.
- **Reactions on partner notes** — emoji badge on partner's notes; per-user pick.
- **Real iPhone perf test** against §14.5 acceptance targets: cold boot < 800 ms, 60 fps pan @ 25k items, < 150 MB RSS. Not yet validated on a real device with realistic content volume.
- **Proper Caprasimo icon** — base64-embed the woff2 font in the `ImageResponse` JSX style so the `m` glyph uses the real display font (currently Georgia serif fallback).
- **Custom domain** — replace Vercel subdomain.

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
│  ├─ layout.tsx                       # root layout, fonts, viewport, apple meta
│  ├─ page.tsx                         # redirect → /canvas
│  ├─ globals.css                      # design tokens + Tailwind @theme
│  ├─ manifest.ts                      # PWA manifest (MetadataRoute)
│  ├─ icon.tsx                         # 192×192 dynamic PNG
│  ├─ icon1.tsx                        # 512×512 dynamic PNG (+ maskable)
│  ├─ apple-icon.tsx                   # 180×180 apple-touch-icon
│  ├─ passphrase/page.tsx              # numpad gate
│  ├─ canvas/page.tsx                  # mounts <CanvasClient/>
│  └─ api/
│     ├─ session/route.ts              # POST set / DELETE clear signed cookie
│     ├─ state/route.ts                # poll endpoint (notes/photos/songs)
│     ├─ notes/route.ts                # GET list, POST create
│     ├─ notes/[id]/route.ts           # PATCH move/edit
│     ├─ photos/upload/route.ts        # multipart upload (full + thumb)
│     ├─ photos/[id]/route.ts          # PATCH pin/unpin/move/caption
│     ├─ songs/route.ts                # POST upsert today's song (409 if exists)
│     ├─ songs/[id]/route.ts           # PATCH pin/unpin/move
│     └─ spotify/search/route.ts       # GET search via cached Client Credentials
├─ proxy.ts                            # auth middleware (Next 16 calls it "proxy")
├─ components/
│  ├─ SelfPicker.tsx                   # emo/magi first-launch modal
│  ├─ InstallHint.tsx                  # iOS "add to home screen" banner
│  ├─ canvas/
│  │  ├─ CanvasClient.tsx              # main orchestrator
│  │  ├─ TopBar.tsx                    # brand + state chip + archive + zen
│  │  ├─ TodayAnchor.tsx               # top-left jump-to-today pill
│  │  ├─ MiniMap.tsx                   # display-only orientation (zoom < 15%)
│  │  ├─ ZoomControls.tsx              # mid-right +/−/FIT/%
│  │  ├─ ZenZoomBar.tsx                # faded zoom bar visible only in zen
│  │  ├─ ZenExit.tsx                   # zen mode exit pill
│  │  ├─ Fabs.tsx                      # camera | + note | song
│  │  ├─ StickyNote.tsx                # long-press to drag
│  │  ├─ PhotoCard.tsx                 # pinned photo on canvas
│  │  ├─ SongCard.tsx                  # pinned song, lazy iframe
│  │  ├─ PhotoViewer.tsx               # full-screen photo modal
│  │  ├─ RevealSheet.tsx               # "tonight." reveal feed
│  │  ├─ NoteComposer.tsx              # inline new-note textarea + color
│  │  └─ PendingPill.tsx               # (legacy; unused since topbar chip)
│  ├─ camera/
│  │  └─ LockedRoll.tsx                # pre-reveal pending grid
│  ├─ archive/
│  │  └─ ArchiveSheet.tsx              # tabs + filter + day grids
│  └─ song/
│     └─ SongPicker.tsx                # Spotify search + locked state
├─ lib/
│  ├─ supabase/server.ts               # cached service-role client
│  ├─ session/cookie.ts                # Web Crypto HMAC sign/verify
│  ├─ memo-day.ts                      # client mirror + minutesUntilNextReveal
│  ├─ self/useSelf.ts                  # useSyncExternalStore over localStorage
│  ├─ spotify/client.ts                # token cache + search
│  ├─ canvas/usePanZoom.ts             # @use-gesture wrapper + animateTo
│  ├─ canvas/spatial-index.ts          # grid map
│  ├─ canvas/lod.ts                    # zoom → tier resolver
│  ├─ cache/indexeddb.ts               # idb wrapper (v3 schema)
│  ├─ camera/useCapture.tsx            # capture hook with hidden input
│  ├─ image/resize.ts                  # client compression
│  ├─ image/thumbnail.ts               # 256px thumb generator
│  └─ types.ts                         # Author, Note, Photo, Song, SpotifyTrack
├─ supabase/migrations/
│  └─ 0001_init.sql                    # schema + memo_day fn + triggers
├─ design/                             # HTML mood boards (00-04)
└─ tech-spec.md
```
