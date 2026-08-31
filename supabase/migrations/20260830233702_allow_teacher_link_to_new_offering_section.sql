create or replace function private.can_teacher_join_section(target_section uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sections target
    join public.sections existing on existing.offering_id = target.offering_id
    join public.teacher_sections ts on ts.section_id = existing.id
    where target.id = target_section
      and ts.teacher_id = (select auth.uid())
  );
$$;

revoke all on function private.can_teacher_join_section(uuid) from public, anon;
grant execute on function private.can_teacher_join_section(uuid) to authenticated;

drop policy if exists teacher_sections_teacher_insert on public.teacher_sections;
create policy teacher_sections_teacher_insert
on public.teacher_sections
for insert
to authenticated
with check (
  teacher_id = (select auth.uid())
  and (select private.can_teacher_join_section(teacher_sections.section_id))
);
