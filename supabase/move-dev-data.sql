-- Move dev data to your account
-- Run once in the SQL Editor after signing up. Replace YOUR_USERNAME first.

do $$
declare
  dev_id uuid := '11111111-1111-4111-8111-111111111111';
  my_id uuid;
begin
  select id into my_id from public.users where username = 'YOUR_USERNAME';
  if my_id is null then
    raise exception 'No account with that username. Sign up in the app first.';
  end if;

  update public.courses set owner_id = my_id where owner_id = dev_id;

  delete from public.user_item_state mine
  where mine.user_id = my_id
    and exists (
      select 1 from public.user_item_state dev
      where dev.user_id = dev_id and dev.item_id = mine.item_id
    );

  update public.user_item_state set user_id = my_id where user_id = dev_id;
  update public.review_log set user_id = my_id where user_id = dev_id;
  delete from public.users where id = dev_id;
end $$;

-- Link app users to auth accounts

alter table public.users
  add constraint users_id_auth_fkey foreign key (id) references auth.users (id) on delete cascade;