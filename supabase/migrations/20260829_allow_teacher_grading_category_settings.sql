grant insert, update on table public.grading_categories to authenticated;

create policy grading_categories_teacher_insert
on public.grading_categories
for insert
to authenticated
with check ((select private.is_teacher_for_section(grading_categories.section_id)));

create policy grading_categories_teacher_update
on public.grading_categories
for update
to authenticated
using ((select private.is_teacher_for_section(grading_categories.section_id)))
with check ((select private.is_teacher_for_section(grading_categories.section_id)));
