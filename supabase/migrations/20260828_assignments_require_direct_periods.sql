create or replace function private.require_direct_assignment_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_section_id uuid;
  v_mode text;
begin
  if new.grading_period_id is null then
    return new;
  end if;

  select gp.section_id, gp.calculation_mode
    into v_section_id, v_mode
  from public.grading_periods gp
  where gp.id = new.grading_period_id;

  if v_section_id is null then
    raise exception 'Grading period does not exist.';
  end if;
  if v_section_id <> new.section_id then
    raise exception 'Assignment grading period must belong to the same section.';
  end if;
  if v_mode <> 'direct' then
    raise exception 'Assignments can only be attached to direct grading periods.';
  end if;
  return new;
end;
$$;

revoke all on function private.require_direct_assignment_period() from public;

drop trigger if exists assignments_require_direct_period on public.assignments;
create trigger assignments_require_direct_period
before insert or update of grading_period_id, section_id
on public.assignments
for each row execute function private.require_direct_assignment_period();
