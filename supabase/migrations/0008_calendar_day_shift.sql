-- memo · calendar-day shift
--
-- Drops the memo-day concept (21:00 → 21:00 named-by-reveal-date) and
-- moves to plain calendar days in Europe/Copenhagen. New behaviour:
--
--   memo_day(t) returns the local calendar date of t. No more "after
--   21:00 belongs to tomorrow" pivot.
--
--   set_photo_reveal_at:
--     - photos bound to a date_idea bypass the reveal cycle entirely
--       (unchanged from migration 0007 — reveal_at = now() if unset).
--     - photos taken before 21:00 local lock until that calendar day's
--       21:00 (preserves the daytime ritual).
--     - photos taken at or after 21:00 local reveal immediately and
--       join the current day's already-open reveal sheet.
--
-- The set_song_memo_day trigger keeps using memo_day() and so gets the
-- new semantics automatically.
--
-- Old rows are backfilled in a DO block at the bottom so existing
-- photos/songs use the new grouping without restoring corrupt state.

create or replace function memo_day(t timestamptz)
returns date as $$
declare
  tz text;
begin
  select reveal_timezone into tz from settings where id = 1;
  return (t at time zone tz)::date;
end;
$$ language plpgsql stable;

create or replace function set_photo_reveal_at()
returns trigger as $$
declare
  rh int;
  tz text;
  local_hour int;
begin
  if new.date_idea_id is not null then
    new.reveal_at := coalesce(new.reveal_at, now());
    return new;
  end if;
  select reveal_hour, reveal_timezone into rh, tz from settings where id = 1;
  local_hour := extract(hour from (new.taken_at at time zone tz))::int;
  if local_hour < rh then
    new.reveal_at :=
      (date_trunc('day', new.taken_at at time zone tz)
        + (rh || ' hours')::interval)
      at time zone tz;
  else
    -- Taken at/after the daily reveal moment — join today's reveal
    -- sheet now instead of waiting another 21h.
    new.reveal_at := new.taken_at;
  end if;
  return new;
end;
$$ language plpgsql;

-- Backfill. Recompute reveal_at + songs.memo_day using the new logic so
-- the archive doesn't have a mixed grouping cliff at this migration.
do $$
declare
  rh int;
  tz text;
begin
  select reveal_hour, reveal_timezone into rh, tz from settings where id = 1;

  update photos
  set reveal_at = case
    when date_idea_id is not null then coalesce(reveal_at, now())
    when extract(hour from (taken_at at time zone tz))::int < rh then
      (date_trunc('day', taken_at at time zone tz)
        + (rh || ' hours')::interval)
      at time zone tz
    else taken_at
  end;

  update songs set memo_day = memo_day(created_at);
end $$;
