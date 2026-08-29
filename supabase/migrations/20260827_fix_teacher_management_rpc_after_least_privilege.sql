create or replace function public.clear_assignment_scores(p_assignment_id uuid)
returns integer
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public'
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

  if not exists (
    select 1
    from public.teacher_sections ts
    where ts.teacher_id = auth.uid()
      and ts.section_id = v_section_id
  ) then
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

create or replace function public.delete_empty_assignment(p_assignment_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public'
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

  if not exists (
    select 1
    from public.teacher_sections ts
    where ts.teacher_id = auth.uid()
      and ts.section_id = v_section_id
  ) then
    raise exception 'Not authorized to delete this assignment';
  end if;

  if exists (select 1 from public.grade_records where assignment_id = p_assignment_id) then
    return false;
  end if;

  delete from public.assignments where id = p_assignment_id;
  return found;
end;
$$;

revoke all on function public.clear_assignment_scores(uuid) from public, anon;
revoke all on function public.delete_empty_assignment(uuid) from public, anon;
grant execute on function public.clear_assignment_scores(uuid), public.delete_empty_assignment(uuid) to authenticated, service_role;
