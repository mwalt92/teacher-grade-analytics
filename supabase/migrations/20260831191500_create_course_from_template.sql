alter table public.course_offerings
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

update public.course_offerings co
set created_by = (
  select ts.teacher_id
  from public.sections s
  join public.teacher_sections ts on ts.section_id = s.id
  where s.offering_id = co.id
  order by ts.teacher_id::text
  limit 1
)
where co.created_by is null;

create index if not exists course_offerings_created_by_idx
  on public.course_offerings(created_by);

grant insert on public.courses to authenticated;
grant insert on public.course_offerings to authenticated;

drop policy if exists courses_teacher_insert on public.courses;
create policy courses_teacher_insert
on public.courses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'teacher'
  )
);

drop policy if exists course_offerings_teacher_insert on public.course_offerings;
create policy course_offerings_teacher_insert
on public.course_offerings
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'teacher'
  )
);

drop policy if exists sections_creator_insert on public.sections;
create policy sections_creator_insert
on public.sections
for insert
to authenticated
with check (
  exists (
    select 1
    from public.course_offerings co
    join public.profiles p on p.id = (select auth.uid())
    where co.id = sections.offering_id
      and co.created_by = (select auth.uid())
      and p.role = 'teacher'
  )
);

create or replace function private.can_teacher_join_section(target_section uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sections target
    join public.course_offerings co on co.id = target.offering_id
    where target.id = target_section
      and (
        co.created_by = (select auth.uid())
        or exists (
          select 1
          from public.sections existing
          join public.teacher_sections ts on ts.section_id = existing.id
          where existing.offering_id = target.offering_id
            and ts.teacher_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.create_teacher_course(
  p_course_name text,
  p_course_code text,
  p_school_year_id uuid,
  p_section_name text,
  p_period_number integer default null,
  p_source_offering_id uuid default null,
  p_copy_categories boolean default false,
  p_copy_assignment_types boolean default false,
  p_copy_grading_periods boolean default false
)
returns uuid
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_course_name text := btrim(coalesce(p_course_name, ''));
  v_course_code text := nullif(btrim(coalesce(p_course_code, '')), '');
  v_section_name text := btrim(coalesce(p_section_name, ''));
  v_course_id uuid := gen_random_uuid();
  v_offering_id uuid := gen_random_uuid();
  v_section_id uuid := gen_random_uuid();
  v_new_id uuid;
  v_category_map jsonb := '{}'::jsonb;
  v_period_map jsonb := '{}'::jsonb;
  v_mapped_category uuid;
  r record;
begin
  if v_teacher_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_teacher_id and p.role = 'teacher'
  ) then
    raise exception 'Teacher access is required';
  end if;

  if v_course_name = '' then raise exception 'Course name is required'; end if;
  if length(v_course_name) > 160 then raise exception 'Course name is too long'; end if;
  if v_course_code is not null and length(v_course_code) > 40 then raise exception 'Course code is too long'; end if;
  if v_section_name = '' then raise exception 'First section name is required'; end if;
  if length(v_section_name) > 100 then raise exception 'Section name is too long'; end if;
  if p_period_number is not null and (p_period_number < 0 or p_period_number > 99) then
    raise exception 'Class period must be between 0 and 99';
  end if;

  if not exists (select 1 from public.school_years sy where sy.id = p_school_year_id) then
    raise exception 'School year not found';
  end if;

  if exists (
    select 1
    from public.teacher_sections ts
    join public.sections s on s.id = ts.section_id
    join public.course_offerings co on co.id = s.offering_id
    join public.courses c on c.id = co.course_id
    where ts.teacher_id = v_teacher_id
      and co.school_year_id = p_school_year_id
      and lower(btrim(c.name)) = lower(v_course_name)
  ) then
    raise exception 'You already have a course with that name in this school year';
  end if;

  if p_source_offering_id is not null then
    if not exists (
      select 1
      from public.teacher_sections ts
      join public.sections s on s.id = ts.section_id
      where ts.teacher_id = v_teacher_id
        and s.offering_id = p_source_offering_id
    ) then
      raise exception 'You do not have access to the source course';
    end if;
  elsif p_copy_categories or p_copy_assignment_types or p_copy_grading_periods then
    raise exception 'Choose a source course before copying settings';
  end if;

  if p_copy_assignment_types and not p_copy_categories then
    raise exception 'Assignment types require grading categories to be copied too';
  end if;

  insert into public.courses (id, name, code)
  values (v_course_id, v_course_name, v_course_code);

  insert into public.course_offerings (id, course_id, school_year_id, active, created_by)
  values (v_offering_id, v_course_id, p_school_year_id, true, v_teacher_id);

  insert into public.sections (
    id, course_id, school_year_id, offering_id, name, active, period_number, sort_order
  ) values (
    v_section_id, v_course_id, p_school_year_id, v_offering_id, v_section_name, true, p_period_number, 10
  );

  insert into public.teacher_sections (teacher_id, section_id)
  values (v_teacher_id, v_section_id);

  if p_source_offering_id is not null and p_copy_categories then
    for r in
      select id, name, weight, drop_lowest, late_deduction, code, calculation_method, sort_order
      from public.grading_categories
      where offering_id = p_source_offering_id
      order by sort_order, name
    loop
      v_new_id := gen_random_uuid();
      insert into public.grading_categories (
        id, section_id, offering_id, name, weight, drop_lowest, late_deduction, code, calculation_method, sort_order
      ) values (
        v_new_id, v_section_id, v_offering_id, r.name, r.weight, r.drop_lowest, r.late_deduction, r.code, r.calculation_method, r.sort_order
      );
      v_category_map := v_category_map || jsonb_build_object(r.id::text, v_new_id::text);
    end loop;
  end if;

  if p_source_offering_id is not null and p_copy_assignment_types then
    for r in
      select id, code, name, description, default_category_id, default_points_possible,
             default_allow_retakes, active, sort_order
      from public.assignment_types
      where offering_id = p_source_offering_id
      order by sort_order, name
    loop
      v_mapped_category := nullif(v_category_map ->> r.default_category_id::text, '')::uuid;
      if v_mapped_category is null then
        raise exception 'Could not map an assignment type to its copied category';
      end if;
      insert into public.assignment_types (
        id, section_id, offering_id, code, name, description, default_category_id,
        default_points_possible, default_allow_retakes, active, sort_order
      ) values (
        gen_random_uuid(), v_section_id, v_offering_id, r.code, r.name, r.description, v_mapped_category,
        r.default_points_possible, r.default_allow_retakes, r.active, r.sort_order
      );
    end loop;
  end if;

  if p_source_offering_id is not null and p_copy_grading_periods then
    for r in
      select id, code, name, starts_on, ends_on, calculation_mode, sort_order, period_role
      from public.grading_periods
      where offering_id = p_source_offering_id
      order by sort_order, code
    loop
      v_new_id := gen_random_uuid();
      insert into public.grading_periods (
        id, section_id, offering_id, code, name, starts_on, ends_on, calculation_mode, sort_order, period_role
      ) values (
        v_new_id, v_section_id, v_offering_id, r.code, r.name, r.starts_on, r.ends_on, r.calculation_mode, r.sort_order, r.period_role
      );
      v_period_map := v_period_map || jsonb_build_object(r.id::text, v_new_id::text);
    end loop;

    for r in
      select gpc.parent_period_id, gpc.component_period_id, gpc.weight, gpc.sort_order
      from public.grading_period_components gpc
      join public.grading_periods parent on parent.id = gpc.parent_period_id
      where parent.offering_id = p_source_offering_id
      order by gpc.sort_order
    loop
      insert into public.grading_period_components (
        parent_period_id, component_period_id, weight, sort_order
      ) values (
        (v_period_map ->> r.parent_period_id::text)::uuid,
        (v_period_map ->> r.component_period_id::text)::uuid,
        r.weight,
        r.sort_order
      );
    end loop;
  end if;

  return v_section_id;
end;
$$;

revoke all on function public.create_teacher_course(text,text,uuid,text,integer,uuid,boolean,boolean,boolean) from public;
grant execute on function public.create_teacher_course(text,text,uuid,text,integer,uuid,boolean,boolean,boolean) to authenticated;
