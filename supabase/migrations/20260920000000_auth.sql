-- Columns

alter table users add column username text;
alter table users add column accepted_terms_at timestamptz;

alter table users
  add constraint users_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create unique index users_username_key on users (username);

-- New account trigger

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(new.raw_user_meta_data ->> 'username');
  requested_timezone text := nullif(new.raw_user_meta_data ->> 'timezone', '');
begin
  insert into public.users (id, display_name, username, timezone, accepted_terms_at)
  values (
    new.id,
    coalesce(requested_username, split_part(new.email, '@', 1)),
    requested_username,
    coalesce(requested_timezone, 'UTC'),
    now()
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();