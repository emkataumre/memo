-- memo · enable Realtime + JWT-gated RLS on notes/photos/songs
-- See tech-spec.md §2 (security model) and the planned Realtime migration.
--
-- The custom JWT (signed server-side with SUPABASE_JWT_SECRET) carries
-- `role = "authenticated"` plus a custom `memo_role = "memo_session"`
-- claim. Standard Supabase roles (`role` claim) must exist as DB roles
-- because PostgREST issues SET ROLE; using "authenticated" satisfies that.
-- The actual gate is the `memo_role` custom claim, which RLS read
-- policies check. Standard authenticated JWTs minted by Supabase Auth
-- don't carry `memo_role`, so they don't match.
--
-- Writes are denied for everyone via the default-deny behaviour of RLS
-- with no insert/update/delete policies. Server-side writes continue
-- to work because the service-role key bypasses RLS entirely.

-- ============================================================
-- 1. Enable RLS on the live tables
-- ============================================================
alter table notes  enable row level security;
alter table photos enable row level security;
alter table songs  enable row level security;

-- ============================================================
-- 2. Read policies — keyed on the JWT `memo_role` custom claim
-- ============================================================
-- Drop any prior versions (this migration may be re-applied during dev).
drop policy if exists memo_session_read_notes  on notes;
drop policy if exists memo_session_read_photos on photos;
drop policy if exists memo_session_read_songs  on songs;

create policy "memo_session_read_notes"
  on notes for select to public
  using ((current_setting('request.jwt.claims', true)::jsonb ->> 'memo_role') = 'memo_session');

create policy "memo_session_read_photos"
  on photos for select to public
  using ((current_setting('request.jwt.claims', true)::jsonb ->> 'memo_role') = 'memo_session');

create policy "memo_session_read_songs"
  on songs for select to public
  using ((current_setting('request.jwt.claims', true)::jsonb ->> 'memo_role') = 'memo_session');

-- ============================================================
-- 3. Realtime publication — add the three tables
-- ============================================================
-- `supabase_realtime` is preconfigured by Supabase. We just add tables.
-- Wrap each in a DO block so re-applying the migration is idempotent
-- (ALTER PUBLICATION ... ADD TABLE errors if the table is already in it).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table notes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table photos;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'songs'
  ) then
    alter publication supabase_realtime add table songs;
  end if;
end $$;

-- ============================================================
-- 4. settings stays as-is (RLS disabled, not in publication).
--    Clients don't need to read it — memo-day config is mirrored
--    in lib/memo-day.ts. Server-side reads via service-role.
-- ============================================================
