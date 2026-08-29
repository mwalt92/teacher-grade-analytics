drop policy if exists grade_records_teacher_delete on public.grade_records;
create policy grade_records_teacher_delete
on public.grade_records
for delete
to authenticated
using (
  private.is_teacher_for_section((select a.section_id from public.assignments a where a.id = grade_records.assignment_id))
);

drop policy if exists assignments_teacher_delete on public.assignments;
create policy assignments_teacher_delete
on public.assignments
for delete
to authenticated
using (private.is_teacher_for_section(section_id));

alter function public.clear_assignment_scores(uuid) security invoker;
alter function public.delete_empty_assignment(uuid) security invoker;

revoke execute on function public.clear_assignment_scores(uuid) from public, anon;
revoke execute on function public.delete_empty_assignment(uuid) from public, anon;
grant execute on function public.clear_assignment_scores(uuid) to authenticated, service_role;
grant execute on function public.delete_empty_assignment(uuid) to authenticated, service_role;
