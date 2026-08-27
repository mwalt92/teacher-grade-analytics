create or replace function public.delete_empty_assignment(p_assignment_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_section_id uuid;
begin
  select section_id into v_section_id
  from public.assignments
  where id = p_assignment_id;

  if v_section_id is null then
    return false;
  end if;

  if not private.is_teacher_for_section(v_section_id) then
    raise exception 'Not authorized to delete this assignment';
  end if;

  if exists (select 1 from public.grade_records where assignment_id = p_assignment_id) then
    return false;
  end if;

  delete from public.assignments where id = p_assignment_id;
  return found;
end;
$$;

revoke all on function public.delete_empty_assignment(uuid) from public;
grant execute on function public.delete_empty_assignment(uuid) to authenticated;
