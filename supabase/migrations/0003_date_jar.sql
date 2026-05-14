-- memo · date jar
-- A pool of date ideas. Either author can drop new ones in and either
-- can draw a random one. Drawing is non-destructive — only an explicit
-- "take it" mutation marks an idea as used and spawns the corresponding
-- sticky note on the canvas. Ideas can never be edited or deleted
-- directly; the only way out of the jar is via a draw+take cycle.
--
-- All access is server-only via service-role; RLS stays disabled.

create table if not exists date_ideas (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  body text not null,
  status text not null default 'in_jar' check (status in ('in_jar', 'taken')),
  taken_at timestamptz,
  taken_note_id uuid references notes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists date_ideas_status_idx on date_ideas (status);

alter table date_ideas disable row level security;
