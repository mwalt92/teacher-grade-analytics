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

  return new;
end;
$$;

drop trigger if exists assignments_require_direct_period on public.assignments;
create trigger assignments_require_direct_period
before insert or update of grading_period_id, category_id, assignment_type_id, section_id
on public.assignments
for each row
execute function private.require_direct_assignment_period();
