revoke execute on function public.clear_assignment_scores(uuid) from public, anon;
revoke execute on function public.delete_empty_assignment(uuid) from public, anon;
revoke execute on function public.link_current_student_account_by_email() from public, anon;

grant execute on function public.clear_assignment_scores(uuid) to authenticated, service_role;
grant execute on function public.delete_empty_assignment(uuid) to authenticated, service_role;
grant execute on function public.link_current_student_account_by_email() to authenticated, service_role;
