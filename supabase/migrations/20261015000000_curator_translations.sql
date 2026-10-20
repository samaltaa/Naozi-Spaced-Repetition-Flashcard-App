-- Word-level translation cache

create table curator.translations (
  id uuid primary key default gen_random_uuid(),
  lang text not null,
  source_language text not null,
  prompt_version text not null,
  lemma text not null,
  pos text not null,
  gloss text not null default '',
  form text,
  alternates text[] not null default '{}',
  skip_reason text,
  model text not null,
  hit_count int not null default 0,
  created_at timestamptz not null default now(),
  constraint translations_key unique (lang, source_language, prompt_version, lemma, pos)
);

alter table curator.translations enable row level security;

-- Job usage

alter table curator.extraction_jobs add column cached_items int not null default 0;
alter table curator.extraction_jobs add column batches jsonb not null default '[]';

-- Article-level cache, replaced by translations

drop table curator.content_cache;
