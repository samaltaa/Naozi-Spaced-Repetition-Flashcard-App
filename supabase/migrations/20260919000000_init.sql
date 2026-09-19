-- Enums

create type visibility as enum ('private', 'unlisted', 'public');
create type item_state as enum ('new', 'learning', 'review', 'relearning');
create type test_type as enum ('multiple_choice', 'typing');
create type diacritic_mode as enum ('strict', 'lenient');

-- Tables

create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  timezone text not null default 'UTC',
  day_rollover_hour smallint not null default 4 check (day_rollover_hour between 0 and 23),
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  source_lang text not null,
  target_lang text not null,
  visibility visibility not null default 'private',
  diacritic_mode diacritic_mode not null default 'lenient',
  new_per_day int not null default 10 check (new_per_day between 1 and 100),
  max_reviews_per_day int not null default 200 check (max_reviews_per_day between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table levels (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  title text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  level_id uuid not null references levels (id) on delete cascade,
  prompt text not null,
  answer text not null,
  alternates text[] not null default '{}',
  reading text,
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_item_state (
  user_id uuid not null references users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  state item_state not null default 'new',
  ease_factor numeric(4, 2) not null default 2.5,
  interval_days int not null default 0,
  repetitions int not null default 0,
  lapses int not null default 0,
  learning_step int not null default 0,
  due_at timestamptz,
  last_reviewed_at timestamptz,
  primary key (user_id, item_id)
);

create table review_log (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  test_type test_type not null,
  answer_given text not null,
  verdict text not null check (verdict in ('exact', 'accents', 'typo', 'wrong')),
  correct boolean not null,
  grade smallint not null check (grade between 0 and 5),
  response_ms int not null,
  state_before item_state not null,
  state_after item_state not null,
  ease_after numeric(4, 2) not null,
  interval_after int not null,
  due_after timestamptz,
  reviewed_at timestamptz not null,
  received_at timestamptz not null default now()
);

-- Indexes

create index courses_owner_idx on courses (owner_id);
create index levels_course_position_idx on levels (course_id, position);
create index items_level_position_idx on items (level_id, position);
create index items_course_idx on items (course_id);
create index user_item_state_due_idx on user_item_state (user_id, course_id, due_at);
create index user_item_state_state_idx on user_item_state (user_id, course_id, state);
create index review_log_user_day_idx on review_log (user_id, course_id, reviewed_at);
create index review_log_item_idx on review_log (item_id);

-- Row Level Security

alter table users enable row level security;
alter table courses enable row level security;
alter table levels enable row level security;
alter table items enable row level security;
alter table user_item_state enable row level security;
alter table review_log enable row level security;

-- Functions

create or replace function new_items(p_user_id uuid, p_course_id uuid, p_limit int)
returns setof items
language sql
stable
as $$
  select i.*
  from items i
  join levels l on l.id = i.level_id
  where i.course_id = p_course_id
    and not exists (
      select 1 from user_item_state s
      where s.user_id = p_user_id and s.item_id = i.id
    )
  order by l.position, i.position, i.created_at
  limit p_limit;
$$;

create or replace function dashboard(p_user_id uuid, p_now timestamptz)
returns table (
  course_id uuid,
  title text,
  target_lang text,
  due_count bigint,
  started_count bigint,
  learned_count bigint,
  total_items bigint
)
language sql
stable
as $$
  select
    c.id,
    c.title,
    c.target_lang,
    (select count(*) from user_item_state s
      where s.user_id = p_user_id and s.course_id = c.id
        and s.state <> 'new' and s.due_at <= p_now),
    (select count(*) from user_item_state s
      where s.user_id = p_user_id and s.course_id = c.id),
    (select count(*) from user_item_state s
      where s.user_id = p_user_id and s.course_id = c.id
        and s.state in ('review', 'relearning')),
    (select count(*) from items i where i.course_id = c.id)
  from courses c
  where c.owner_id = p_user_id
  order by c.created_at desc;
$$;

revoke execute on function new_items(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function dashboard(uuid, timestamptz) from public, anon, authenticated;