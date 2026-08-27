create or replace function public.clear_assignment_scores(p_assignment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_section_id uuid;
  v_deleted integer;
begin
  select section_id into v_section_id
  from public.assignments
  where id = p_assignment_id;

  if v_section_id is null then
    raise exception 'Assignment not found.';
  end if;

  if not private.is_teacher_for_section(v_section_id) then
    raise exception 'You do not have access to clear this assignment.';
  end if;

  select count(*)::integer into v_deleted
  from public.grade_records
  where assignment_id = p_assignment_id;

  delete from public.grade_records
  where assignment_id = p_assignment_id;

  return v_deleted;
end;
$$;

revoke all on function public.clear_assignment_scores(uuid) from public;
grant execute on function public.clear_assignment_scores(uuid) to authenticated;
