create or replace function private.is_offering_creator(target_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_offerings co
    join public.profiles p on p.id = (select auth.uid())
    where co.id = target_offering
      and co.created_by = (select auth.uid())
      and p.role = 'teacher'
  );
$$;

revoke all on function private.is_offering_creator(uuid) from public;
grant execute on function private.is_offering_creator(uuid) to authenticated;

drop policy if exists sections_creator_insert on public.sections;
create policy sections_creator_insert
on public.sections
for insert
to authenticated
with check ((select private.is_offering_creator(sections.offering_id)));
