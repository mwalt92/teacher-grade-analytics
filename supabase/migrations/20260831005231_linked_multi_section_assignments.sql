create table public.assignment_link_groups (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.assignment_link_groups enable row level security;

grant select, insert on table public.assignment_link_groups to authenticated;
revoke all on table public.assignment_link_groups from anon;

create policy assignment_link_groups_teacher_select
on public.assignment_link_groups
for select
to authenticated
using (private.is_teacher_for_offering(offering_id));

create policy assignment_link_groups_teacher_insert
on public.assignment_link_groups
for insert
to authenticated
with check (
  created_by = auth.uid()
  and private.is_teacher_for_offering(offering_id)
);

alter table public.assignments
  add column link_group_id uuid null references public.assignment_link_groups(id) on delete set null;

create unique index assignments_link_group_section_unique
  on public.assignments(link_group_id, section_id)
  where link_group_id is not null;

create index assignments_link_group_id_idx
  on public.assignments(link_group_id)
  where link_group_id is not null;

create or replace function private.require_direct_assignment_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_section_offering_id uuid;
  v_period_offering_id uuid;
  v_category_offering_id uuid;
  v_type_offering_id uuid;
  v_group_offering_id uuid;
  v_mode text;
begin
  select s.offering_id
    into v_section_offering_id
  from public.sections s
  where s.id = new.section_id;

  if v_section_offering_id is null then
    raise exception 'Assignment section does not exist.';
  end if;

  if new.grading_period_id is not null then
    select gp.offering_id, gp.calculation_mode
      into v_period_offering_id, v_mode
    from public.grading_periods gp
    where gp.id = new.grading_period_id;

    if v_period_offering_id is null then
      raise exception 'Grading period does not exist.';
    end if;
    if v_period_offering_id <> v_section_offering_id then
      raise exception 'Assignment grading period must belong to the same course offering.';
    end if;
    if v_mode <> 'direct' then
      raise exception 'Assignments can only be attached to direct grading periods.';
    end if;
  end if;

  select gc.offering_id
    into v_category_offering_id
  from public.grading_categories gc
  where gc.id = new.category_id;

  if v_category_offering_id is null then
    raise exception 'Grading category does not exist.';
  end if;
  if v_category_offering_id <> v_section_offering_id then
    raise exception 'Assignment grading category must belong to the same course offering.';
  end if;

  select at.offering_id
    into v_type_offering_id
  from public.assignment_types at
  where at.id = new.assignment_type_id;

  if v_type_offering_id is null then
    raise exception 'Assignment type does not exist.';
  end if;
  if v_type_offering_id <> v_section_offering_id then
    raise exception 'Assignment type must belong to the same course offering.';
  end if;

  if new.link_group_id is not null then
    select alg.offering_id
      into v_group_offering_id
    from public.assignment_link_groups alg
    where alg.id = new.link_group_id;

    if v_group_offering_id is null then
      raise exception 'Assignment link group does not exist.';
    end if;
    if v_group_offering_id <> v_section_offering_id then
      raise exception 'Linked assignments must belong to the same course offering.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists assignments_require_direct_period on public.assignments;
create trigger assignments_require_direct_period
before insert or update of grading_period_id, section_id, category_id, assignment_type_id, link_group_id
on public.assignments
for each row execute function private.require_direct_assignment_period();

create or replace function public.create_linked_assignments(
  p_anchor_section_id uuid,
  p_section_ids uuid[],
  p_assignment_type_id uuid,
  p_category_id uuid,
  p_grading_period_id uuid,
  p_title text,
  p_assignment_date date,
  p_points_possible numeric,
  p_allow_retakes boolean
)
returns table(section_id uuid, assignment_id uuid, link_group_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_offering_id uuid;
  v_type_code text;
  v_link_group_id uuid := gen_random_uuid();
  v_selected_count integer;
  v_valid_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'Assignment title is required.';
  end if;
  if p_assignment_date is null then
    raise exception 'Assignment date is required.';
  end if;
  if p_points_possible is null or p_points_possible <= 0 then
    raise exception 'Points possible must be greater than zero.';
  end if;
  if p_section_ids is null or cardinality(p_section_ids) = 0 then
    raise exception 'Choose at least one section.';
  end if;

  select s.offering_id
    into v_offering_id
  from public.sections s
  join public.teacher_sections ts on ts.section_id = s.id
  where s.id = p_anchor_section_id
    and ts.teacher_id = v_user_id;

  if v_offering_id is null then
    raise exception 'You do not have access to the active section.';
  end if;

  select count(*)
    into v_selected_count
  from (select distinct unnest(p_section_ids) as section_id) selected;

  select count(*)
    into v_valid_count
  from (select distinct unnest(p_section_ids) as section_id) selected
  join public.sections s on s.id = selected.section_id
  join public.teacher_sections ts on ts.section_id = s.id and ts.teacher_id = v_user_id
  where s.offering_id = v_offering_id
    and s.active = true;

  if v_selected_count <> v_valid_count then
    raise exception 'Every selected section must be an active section of this course that you teach.';
  end if;

  if not exists (
    select 1 from public.grading_periods gp
    where gp.id = p_grading_period_id
      and gp.offering_id = v_offering_id
      and gp.calculation_mode = 'direct'
  ) then
    raise exception 'Choose a direct grading period from this course.';
  end if;

  if not exists (
    select 1 from public.grading_categories gc
    where gc.id = p_category_id
      and gc.offering_id = v_offering_id
  ) then
    raise exception 'Choose a grading category from this course.';
  end if;

  select at.code
    into v_type_code
  from public.assignment_types at
  where at.id = p_assignment_type_id
    and at.offering_id = v_offering_id
    and at.active = true;

  if v_type_code is null then
    raise exception 'Choose an active assignment type from this course.';
  end if;

  insert into public.assignment_link_groups(id, offering_id, created_by)
  values (v_link_group_id, v_offering_id, v_user_id);

  return query
  with selected as (
    select distinct unnest(p_section_ids) as selected_section_id
  ), inserted as (
    insert into public.assignments (
      id,
      section_id,
      assignment_type_id,
      category_id,
      grading_period_id,
      link_group_id,
      title,
      assignment_type,
      assignment_date,
      points_possible,
      allow_retakes,
      created_by
    )
    select
      gen_random_uuid(),
      selected.selected_section_id,
      p_assignment_type_id,
      p_category_id,
      p_grading_period_id,
      v_link_group_id,
      btrim(p_title),
      v_type_code,
      p_assignment_date,
      p_points_possible,
      coalesce(p_allow_retakes, false),
      v_user_id
    from selected
    returning assignments.section_id, assignments.id
  )
  select inserted.section_id, inserted.id as assignment_id, v_link_group_id
  from inserted;
end;
$$;

revoke all on function public.create_linked_assignments(uuid, uuid[], uuid, uuid, uuid, text, date, numeric, boolean) from public;
revoke all on function public.create_linked_assignments(uuid, uuid[], uuid, uuid, uuid, text, date, numeric, boolean) from anon;
grant execute on function public.create_linked_assignments(uuid, uuid[], uuid, uuid, uuid, text, date, numeric, boolean) to authenticated;
