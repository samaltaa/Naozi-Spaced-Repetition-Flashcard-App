-- Words per level for automatic level splitting on import

alter table courses add column words_per_level smallint not null default 30;
alter table courses add constraint courses_words_per_level_range check (words_per_level between 5 and 100);

-- Import items into a level, filling it up to words_per_level and continuing into new levels

create or replace function import_items(p_user_id uuid, p_level_id uuid, p_items jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_course_id uuid;
  v_per_level int;
  v_level_id uuid := p_level_id;
  v_level_count int;
  v_next_level_position int;
  v_filled int;
  v_next_item_position int;
  v_item jsonb;
  v_item_id uuid;
  v_levels uuid[] := array[p_level_id];
  v_items uuid[] := array[]::uuid[];
begin
  select c.id, c.words_per_level
    into v_course_id, v_per_level
  from levels l
  join courses c on c.id = l.course_id
  where l.id = p_level_id and c.owner_id = p_user_id
  for update of c;

  if v_course_id is null then
    raise exception 'level not found' using errcode = 'P0002';
  end if;

  select count(*), coalesce(max(position) + 1, 0)
    into v_level_count, v_next_level_position
  from levels
  where course_id = v_course_id;

  select count(*), coalesce(max(position) + 1, 0)
    into v_filled, v_next_item_position
  from items
  where level_id = v_level_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_filled >= v_per_level then
      v_level_count := v_level_count + 1;
      insert into levels (course_id, title, position)
      values (v_course_id, 'Level ' || v_level_count, v_next_level_position)
      returning id into v_level_id;
      v_next_level_position := v_next_level_position + 1;
      v_levels := v_levels || v_level_id;
      v_filled := 0;
      v_next_item_position := 0;
    end if;

    insert into items (course_id, level_id, prompt, answer, alternates, reading, notes, position)
    values (
      v_course_id,
      v_level_id,
      v_item ->> 'prompt',
      v_item ->> 'answer',
      array(
        select jsonb_array_elements_text(
          case when jsonb_typeof(v_item -> 'alternates') = 'array' then v_item -> 'alternates' else '[]'::jsonb end
        )
      ),
      v_item ->> 'reading',
      v_item ->> 'notes',
      v_next_item_position
    )
    returning id into v_item_id;

    v_items := v_items || v_item_id;
    v_filled := v_filled + 1;
    v_next_item_position := v_next_item_position + 1;
  end loop;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'title', l.title,
          'position', l.position,
          'items', (
            select coalesce(jsonb_agg(to_jsonb(i) order by i.position), '[]'::jsonb)
            from items i
            where i.level_id = l.id and i.id = any(v_items)
          )
        )
        order by l.position
      ),
      '[]'::jsonb
    )
    from levels l
    where l.id = any(v_levels)
  );
end;
$$;

revoke execute on function import_items(uuid, uuid, jsonb) from public, anon, authenticated;
