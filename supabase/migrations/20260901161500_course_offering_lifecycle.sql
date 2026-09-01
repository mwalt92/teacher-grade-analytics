drop policy if exists course_offerings_teacher_update on public.course_offerings;

create policy course_offerings_teacher_update
on public.course_offerings
for update
to authenticated
using ((select private.is_teacher_for_offering(course_offerings.id)))
with check ((select private.is_teacher_for_offering(course_offerings.id)));
