-- Schema

create schema if not exists curator;

revoke all on schema curator from public, anon, authenticated;

-- Tables

create table curator.content_cache (
  id uuid primary key default gen_random_uuid(),
  content_hash varchar(64) not null,
  lang text not null,
  source_language text not null,
  target_language text not null,
  prompt_version text not null,
  model text not null,
  item_limit int not null,
  source_text text not null,
  result jsonb not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 6),
  hit_count int not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz,
  constraint content_cache_key unique (
    content_hash, lang, source_language, target_language, prompt_version, model, item_limit
  )
);

create table curator.extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  source_url text,
  content_hash varchar(64) not null,
  lang text not null,
  source_language text not null,
  target_language text not null,
  status text not null default 'queued'
    constraint extraction_jobs_status_check
    check (status in ('queued', 'running', 'done', 'failed', 'discarded')),
  prompt_version text not null,
  model text not null,
  item_limit int not null,
  cache_hit boolean not null default false,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 6),
  known_dropped int not null default 0,
  skipped jsonb not null default '[]',
  rejected jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table curator.extracted_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references curator.extraction_jobs (id) on delete cascade,
  position int not null,
  lemma text not null,
  pos text not null,
  prompt text not null,
  answer text not null,
  alternates text[] not null default '{}',
  reading text,
  notes text,
  status text not null default 'pending'
    constraint extracted_items_status_check
    check (status in ('pending', 'kept', 'deleted', 'imported')),
  original jsonb not null,
  imported_item_id uuid references public.items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extracted_items_job_position_key unique (job_id, position)
);

-- Indexes

create index extraction_jobs_user_created_idx on curator.extraction_jobs (user_id, created_at);
create index extraction_jobs_queued_idx on curator.extraction_jobs (created_at) where status = 'queued';

-- Row Level Security

alter table curator.content_cache enable row level security;
alter table curator.extraction_jobs enable row level security;
alter table curator.extracted_items enable row level security;
