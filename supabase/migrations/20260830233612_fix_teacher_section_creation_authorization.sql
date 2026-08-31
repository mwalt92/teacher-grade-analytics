create or replace function public.create_teacher_section(
  p_offering_id uuid,
  p_name text,
  p_period_number integer default null
)
returns uuid
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_course_id uuid;
  v_school_year_id uuid;
  v_section_id uuid := gen_random_uuid();
  v_sort_order integer;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1
    from public.teacher_sections ts
    join public.sections s on s.id = ts.section_id
    where ts.teacher_id = auth.uid()
      and s.offering_id = p_offering_id
  ) then
    raise exception 'You do not have access to this course offering';
  end if;
  if v_name = '' then
    raise exception 'Section name is required';
  end if;
  if length(v_name) > 100 then
    raise exception 'Section name is too long';
  end if;
  if p_period_number is not null and (p_period_number < 0 or p_period_number > 99) then
    raise exception 'Class period must be between 0 and 99';
  end if;

  select course_id, school_year_id
    into v_course_id, v_school_year_id
  from public.course_offerings
  where id = p_offering_id;

  if v_course_id is null then
    raise exception 'Course offering not found';
  end if;

  if exists (
    select 1 from public.sections s
    where s.offering_id = p_offering_id
      and lower(btrim(s.name)) = lower(v_name)
  ) then
    raise exception 'A section with that name already exists';
  end if;

  select coalesce(max(sort_order), 0) + 10
    into v_sort_order
  from public.sections
  where offering_id = p_offering_id;

  insert into public.sections (
    id, course_id, school_year_id, offering_id, name, active, period_number, sort_order
  ) values (
    v_section_id, v_course_id, v_school_year_id, p_offering_id, v_name, true, p_period_number, v_sort_order
  );

  insert into public.teacher_sections (teacher_id, section_id)
  values (auth.uid(), v_section_id);

  return v_section_id;
end;
$$;

revoke all on function public.create_teacher_section(uuid, text, integer) from public, anon;
grant execute on function public.create_teacher_section(uuid, text, integer) to authenticated;
