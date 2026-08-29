create table if not exists public.push_subscriptions (
  endpoint_hash text primary key,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  page_ids text[] not null default '{}',
  page_names jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_page_ids_idx
  on public.push_subscriptions using gin (page_ids);

create table if not exists public.push_events (
  message_id text primary key,
  page_id text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.push_events enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.push_events from anon, authenticated;
grant all on table public.push_subscriptions to service_role;
grant all on table public.push_events to service_role;

comment on table public.push_subscriptions is
  'Private Web Push endpoints and the Facebook Page IDs authorized for each device.';
comment on table public.push_events is
  'Short-lived Meta webhook message IDs used to suppress retry duplicates.';
