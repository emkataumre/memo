-- memo · initial schema
-- See tech-spec.md §4 (Memo-day) and §5 (Data Model).

-- ============================================================
-- Settings (single row, edited via Supabase dashboard only)
-- ============================================================
create table if not exists settings (
  id int primary key default 1,
  reveal_hour int not null default 21,
  reveal_timezone text not null default 'Europe/Copenhagen',
  check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- Memo-day function — canonical 21:00→21:00 window logic.
-- A memo-day D spans (D-1) 21:00 → D 21:00 in Europe/Copenhagen
-- and is named for the date its reveal happens.
-- ============================================================
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

-- ============================================================
-- Notes — sticky notes on the canvas
-- ============================================================
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  body text not null,
  color text not null default 'lemon',
  x double precision not null,
  y double precision not null,
  rotation double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_created_at_idx on notes (created_at desc);

-- ============================================================
-- Photos — disposable camera roll
-- ============================================================
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  storage_path text not null,
  taken_at timestamptz not null default now(),
  reveal_at timestamptz not null,
  caption text,
  pinned_x double precision,
  pinned_y double precision,
  pinned_rotation double precision default 0,
  pinned_at timestamptz
);

create index if not exists photos_reveal_at_idx on photos (reveal_at);
create index if not exists photos_pinned_idx on photos (pinned_at) where pinned_at is not null;

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

drop trigger if exists photos_set_reveal_at on photos;
create trigger photos_set_reveal_at
  before insert on photos
  for each row execute function set_photo_reveal_at();

-- ============================================================
-- Songs — song-of-the-day
-- ============================================================
create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  memo_day date not null,
  spotify_track_id text not null,
  track_name text not null,
  artist_name text not null,
  album_art_url text,
  created_at timestamptz not null default now(),
  pinned_x double precision,
  pinned_y double precision,
  pinned_rotation double precision default 0,
  pinned_at timestamptz,
  unique (author, memo_day)
);

create index if not exists songs_memo_day_idx on songs (memo_day desc);
create index if not exists songs_pinned_idx on songs (pinned_at) where pinned_at is not null;

create or replace function set_song_memo_day()
returns trigger as $$
begin
  new.memo_day := memo_day(coalesce(new.created_at, now()));
  return new;
end;
$$ language plpgsql;

drop trigger if exists songs_set_memo_day on songs;
create trigger songs_set_memo_day
  before insert on songs
  for each row execute function set_song_memo_day();

-- ============================================================
-- RLS disabled — access is server-only via service-role key.
-- Passphrase gate is the security boundary. See tech-spec.md §2.
-- ============================================================
alter table notes    disable row level security;
alter table photos   disable row level security;
alter table songs    disable row level security;
alter table settings disable row level security;
