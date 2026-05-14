-- Web Push subscriptions. One row per (author, browser endpoint).
-- Server-only access: no RLS read policies → only service_role reads/writes.
-- Not added to supabase_realtime publication; subscriptions are not surfaced
-- in the client.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  author text not null check (author in ('emo', 'magi')),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_author_idx
  on push_subscriptions (author);

alter table push_subscriptions enable row level security;

-- No policies. RLS default-denies all selects/inserts/updates/deletes
-- from anon + authenticated + memo_session JWTs. service_role bypasses
-- RLS entirely (server-side API routes).
