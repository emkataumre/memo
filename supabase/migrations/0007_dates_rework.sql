-- memo · date ideas rework
--
-- Old flow: draw an idea → "take it" creates a sticky note on the canvas;
--           idea status flips to 'taken'.
-- New flow: draw an idea → "take it" parks it as a `pending` date entity
--           (only one at a time, no canvas note). User later completes
--           the date with an attached photo + optional caption; status
--           flips to `completed` and the date lives in the archive only.
--
-- The legacy `taken` status stays valid so historical rows + their linked
-- notes are untouched; new rows use the pending → completed lifecycle.

alter table date_ideas drop constraint if exists date_ideas_status_check;
alter table date_ideas
  add constraint date_ideas_status_check
  check (status in ('in_jar', 'pending', 'taken', 'completed'));

alter table date_ideas add column if not exists event_at timestamptz;
alter table date_ideas add column if not exists caption text;
alter table date_ideas add column if not exists completed_at timestamptz;

-- Enforce "one pending date at a time" via a partial unique index.
-- Postgres treats the constant 1 as the indexed value, so any second
-- pending row collides.
drop index if exists date_ideas_one_pending;
create unique index date_ideas_one_pending
  on date_ideas ((1)) where status = 'pending';

-- Photos can belong to a date idea. When attached, the photo skips the
-- 21:00 reveal cycle (revealed immediately) and is hidden from the
-- daily reveal sheet — it lives under the date entry in archive.
alter table photos
  add column if not exists date_idea_id uuid
  references date_ideas(id) on delete set null;
create index if not exists photos_date_idea_id_idx on photos (date_idea_id);

-- Patch the reveal-at trigger so date-bound photos get reveal_at = now()
-- (or whatever the caller passed) instead of the next 21:00 boundary.
create or replace function set_photo_reveal_at()
returns trigger as $$
declare
  rh int;
  tz text;
begin
  if new.date_idea_id is not null then
    new.reveal_at := coalesce(new.reveal_at, now());
    return new;
  end if;
  select reveal_hour, reveal_timezone into rh, tz from settings where id = 1;
  new.reveal_at := (memo_day(new.taken_at) + (rh || ' hours')::interval) at time zone tz;
  return new;
end;
$$ language plpgsql;
