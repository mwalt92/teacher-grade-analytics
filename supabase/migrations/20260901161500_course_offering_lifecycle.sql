drop policy if exists course_offerings_teacher_update on public.course_offerings;

drop function if exists public.set_teacher_course_offering_active(uuid, boolean);

create function public.set_teacher_course_offering_active(
  p_offering_id uuid,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_teacher_for_offering(p_offering_id) then
    raise exception 'You do not have permission to manage this course.';
  end if;

  update public.course_offerings
  set active = p_active
  where id = p_offering_id;

  return found;
end;
$$;

revoke all on function public.set_teacher_course_offering_active(uuid, boolean) from public;
revoke all on function public.set_teacher_course_offering_active(uuid, boolean) from anon;
grant execute on function public.set_teacher_course_offering_active(uuid, boolean) to authenticated;
