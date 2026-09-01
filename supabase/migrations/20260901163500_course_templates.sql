create table if not exists public.course_templates (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  default_course_name text not null check (char_length(btrim(default_course_name)) between 1 and 160),
  default_course_code text,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_templates_teacher_id_idx on public.course_templates(teacher_id);

alter table public.course_templates enable row level security;

grant select, insert, update, delete on public.course_templates to authenticated;

drop policy if exists course_templates_teacher_select on public.course_templates;
create policy course_templates_teacher_select
on public.course_templates
for select
to authenticated
using (teacher_id = (select auth.uid()));

drop policy if exists course_templates_teacher_insert on public.course_templates;
create policy course_templates_teacher_insert
on public.course_templates
for insert
to authenticated
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('teacher', 'admin')
  )
);

drop policy if exists course_templates_teacher_update on public.course_templates;
create policy course_templates_teacher_update
on public.course_templates
for update
to authenticated
using (teacher_id = (select auth.uid()))
with check (teacher_id = (select auth.uid()));

drop policy if exists course_templates_teacher_delete on public.course_templates;
create policy course_templates_teacher_delete
on public.course_templates
for delete
to authenticated
using (teacher_id = (select auth.uid()));

create or replace function public.save_teacher_course_template(
  p_source_offering_id uuid,
  p_name text,
  p_description text default null,
  p_template_id uuid default null
)
returns uuid
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_template_id uuid := coalesce(p_template_id, gen_random_uuid());
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_course_name text;
  v_course_code text;
  v_config jsonb;
begin
  if v_teacher_id is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_teacher_id and p.role in ('teacher', 'admin')
  ) then raise exception 'Teacher access is required'; end if;
  if v_name = '' then raise exception 'Template name is required'; end if;
  if length(v_name) > 120 then raise exception 'Template name is too long'; end if;
  if v_description is not null and length(v_description) > 500 then raise exception 'Template description is too long'; end if;

  if not private.is_teacher_for_offering(p_source_offering_id) then
    raise exception 'You do not have access to the source course';
  end if;

  select c.name, c.code
  into v_course_name, v_course_code
  from public.course_offerings co
  join public.courses c on c.id = co.course_id
  where co.id = p_source_offering_id;

  if v_course_name is null then raise exception 'Source course not found'; end if;

  v_config := jsonb_build_object(
    'version', 1,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceId', gc.id::text,
        'name', gc.name,
        'code', gc.code,
        'weight', gc.weight,
        'dropLowest', gc.drop_lowest,
        'lateDeduction', gc.late_deduction,
        'calculationMethod', gc.calculation_method,
        'sortOrder', gc.sort_order
      ) order by gc.sort_order, gc.name)
      from public.grading_categories gc
      where gc.offering_id = p_source_offering_id
    ), '[]'::jsonb),
    'assignmentTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceId', at.id::text,
        'code', at.code,
        'name', at.name,
        'description', at.description,
        'sourceCategoryId', at.default_category_id::text,
        'defaultPointsPossible', at.default_points_possible,
        'defaultAllowRetakes', at.default_allow_retakes,
        'active', at.active,
        'sortOrder', at.sort_order
      ) order by at.sort_order, at.name)
      from public.assignment_types at
      where at.offering_id = p_source_offering_id
    ), '[]'::jsonb),
    'gradingPeriods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceId', gp.id::text,
        'code', gp.code,
        'name', gp.name,
        'startsOn', gp.starts_on,
        'endsOn', gp.ends_on,
        'calculationMode', gp.calculation_mode,
        'periodRole', gp.period_role,
        'sortOrder', gp.sort_order
      ) order by gp.sort_order, gp.code)
      from public.grading_periods gp
      where gp.offering_id = p_source_offering_id
    ), '[]'::jsonb),
    'periodComponents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'parentSourceId', gpc.parent_period_id::text,
        'componentSourceId', gpc.component_period_id::text,
        'weight', gpc.weight,
        'sortOrder', gpc.sort_order
      ) order by gpc.sort_order)
      from public.grading_period_components gpc
      join public.grading_periods parent on parent.id = gpc.parent_period_id
      where parent.offering_id = p_source_offering_id
    ), '[]'::jsonb)
  );

  if p_template_id is null then
    insert into public.course_templates (
      id, teacher_id, name, description, default_course_name, default_course_code, config
    ) values (
      v_template_id, v_teacher_id, v_name, v_description, v_course_name, v_course_code, v_config
    );
  else
    update public.course_templates
    set name = v_name,
        description = v_description,
        default_course_name = v_course_name,
        default_course_code = v_course_code,
        config = v_config,
        updated_at = now()
    where id = v_template_id
      and teacher_id = v_teacher_id;
    if not found then raise exception 'Template not found'; end if;
  end if;

  return v_template_id;
end;
$$;

revoke all on function public.save_teacher_course_template(uuid,text,text,uuid) from public;
revoke all on function public.save_teacher_course_template(uuid,text,text,uuid) from anon;
grant execute on function public.save_teacher_course_template(uuid,text,text,uuid) to authenticated;

create or replace function public.create_teacher_course_from_template(
  p_course_name text,
  p_course_code text,
  p_school_year_id uuid,
  p_section_name text,
  p_period_number integer,
  p_template_id uuid,
  p_copy_categories boolean default true,
  p_copy_assignment_types boolean default true,
  p_copy_grading_periods boolean default true
)
returns uuid
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_section_id uuid;
  v_offering_id uuid;
  v_config jsonb;
  v_category_map jsonb := '{}'::jsonb;
  v_period_map jsonb := '{}'::jsonb;
  v_item jsonb;
  v_new_id uuid;
  v_mapped_category uuid;
begin
  if v_teacher_id is null then raise exception 'Not authenticated'; end if;
  select ct.config into v_config
  from public.course_templates ct
  where ct.id = p_template_id and ct.teacher_id = v_teacher_id;
  if v_config is null then raise exception 'Template not found'; end if;
  if coalesce((v_config ->> 'version')::integer, 0) <> 1 then raise exception 'Unsupported template version'; end if;
  if p_copy_assignment_types and not p_copy_categories then
    raise exception 'Assignment types require grading categories to be copied too';
  end if;

  select public.create_teacher_course(
    p_course_name,
    p_course_code,
    p_school_year_id,
    p_section_name,
    p_period_number,
    null,
    false,
    false,
    false
  ) into v_section_id;

  select s.offering_id into v_offering_id
  from public.sections s
  where s.id = v_section_id;

  if p_copy_categories then
    for v_item in select value from jsonb_array_elements(coalesce(v_config -> 'categories', '[]'::jsonb))
    loop
      v_new_id := gen_random_uuid();
      insert into public.grading_categories (
        id, section_id, offering_id, name, code, weight, drop_lowest, late_deduction, calculation_method, sort_order
      ) values (
        v_new_id,
        v_section_id,
        v_offering_id,
        v_item ->> 'name',
        v_item ->> 'code',
        (v_item ->> 'weight')::numeric,
        coalesce((v_item ->> 'dropLowest')::integer, 0),
        coalesce((v_item ->> 'lateDeduction')::numeric, 0),
        coalesce(v_item ->> 'calculationMethod', 'equal_assignment_percentage'),
        coalesce((v_item ->> 'sortOrder')::integer, 0)
      );
      v_category_map := v_category_map || jsonb_build_object(v_item ->> 'sourceId', v_new_id::text);
    end loop;
  end if;

  if p_copy_assignment_types then
    for v_item in select value from jsonb_array_elements(coalesce(v_config -> 'assignmentTypes', '[]'::jsonb))
    loop
      v_mapped_category := nullif(v_category_map ->> (v_item ->> 'sourceCategoryId'), '')::uuid;
      if v_mapped_category is null then raise exception 'Could not map a template assignment type to its category'; end if;
      insert into public.assignment_types (
        id, section_id, offering_id, code, name, description, default_category_id,
        default_points_possible, default_allow_retakes, active, sort_order
      ) values (
        gen_random_uuid(),
        v_section_id,
        v_offering_id,
        v_item ->> 'code',
        v_item ->> 'name',
        nullif(v_item ->> 'description', ''),
        v_mapped_category,
        coalesce((v_item ->> 'defaultPointsPossible')::numeric, 10),
        coalesce((v_item ->> 'defaultAllowRetakes')::boolean, false),
        coalesce((v_item ->> 'active')::boolean, true),
        coalesce((v_item ->> 'sortOrder')::integer, 0)
      );
    end loop;
  end if;

  if p_copy_grading_periods then
    for v_item in select value from jsonb_array_elements(coalesce(v_config -> 'gradingPeriods', '[]'::jsonb))
    loop
      v_new_id := gen_random_uuid();
      insert into public.grading_periods (
        id, section_id, offering_id, code, name, starts_on, ends_on, calculation_mode, period_role, sort_order
      ) values (
        v_new_id,
        v_section_id,
        v_offering_id,
        v_item ->> 'code',
        v_item ->> 'name',
        nullif(v_item ->> 'startsOn', '')::date,
        nullif(v_item ->> 'endsOn', '')::date,
        coalesce(v_item ->> 'calculationMode', 'direct'),
        coalesce(v_item ->> 'periodRole', 'standard'),
        coalesce((v_item ->> 'sortOrder')::integer, 0)
      );
      v_period_map := v_period_map || jsonb_build_object(v_item ->> 'sourceId', v_new_id::text);
    end loop;

    for v_item in select value from jsonb_array_elements(coalesce(v_config -> 'periodComponents', '[]'::jsonb))
    loop
      insert into public.grading_period_components (
        parent_period_id, component_period_id, weight, sort_order
      ) values (
        (v_period_map ->> (v_item ->> 'parentSourceId'))::uuid,
        (v_period_map ->> (v_item ->> 'componentSourceId'))::uuid,
        (v_item ->> 'weight')::numeric,
        coalesce((v_item ->> 'sortOrder')::integer, 0)
      );
    end loop;
  end if;

  return v_section_id;
end;
$$;

revoke all on function public.create_teacher_course_from_template(text,text,uuid,text,integer,uuid,boolean,boolean,boolean) from public;
revoke all on function public.create_teacher_course_from_template(text,text,uuid,text,integer,uuid,boolean,boolean,boolean) from anon;
grant execute on function public.create_teacher_course_from_template(text,text,uuid,text,integer,uuid,boolean,boolean,boolean) to authenticated;
