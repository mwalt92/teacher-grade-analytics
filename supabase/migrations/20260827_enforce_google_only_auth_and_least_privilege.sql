-- Require Google as the only end-user identity provider.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception 'Google sign-in is required for this application.';
  end if;

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@unknown.local'),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'New User'), '@', 1)),
    'student'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name;

  return new;
end;
$$;

create or replace function private.enforce_google_identity()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'auth'
as $$
begin
  if new.provider <> 'google' then
    raise exception 'Only Google identities are permitted for this application.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_google_identity on auth.identities;
create trigger enforce_google_identity
before insert or update of provider on auth.identities
for each row execute function private.enforce_google_identity();

create or replace function private.block_password_credentials()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'auth'
as $$
begin
  if coalesce(new.encrypted_password, '') <> '' then
    raise exception 'Password credentials are disabled; use Google sign-in.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_password_credentials on auth.users;
create trigger block_password_credentials
before insert or update of encrypted_password on auth.users
for each row execute function private.block_password_credentials();

create or replace function public.link_current_student_account_by_email()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile uuid := auth.uid();
  current_email text;
  current_role text;
  matched_student uuid;
  linked_student uuid;
  claimed_by uuid;
begin
  if current_profile is null then
    return 'unauthenticated';
  end if;

  if not exists (
    select 1 from auth.identities i
    where i.user_id = current_profile
      and i.provider = 'google'
  ) then
    return 'google_required';
  end if;

  select p.role into current_role
  from public.profiles p
  where p.id = current_profile;

  if current_role is distinct from 'student' then
    return 'not_student';
  end if;

  select sa.student_id into linked_student
  from public.student_accounts sa
  where sa.profile_id = current_profile;

  if linked_student is not null then
    return 'already_linked';
  end if;

  select u.email into current_email
  from auth.users u
  where u.id = current_profile;

  if current_email is null or btrim(current_email) = '' then
    return 'no_email';
  end if;

  select s.id into matched_student
  from public.students s
  where s.school_email is not null
    and lower(btrim(s.school_email)) = lower(btrim(current_email));

  if matched_student is null then
    return 'no_match';
  end if;

  select sa.profile_id into claimed_by
  from public.student_accounts sa
  where sa.student_id = matched_student;

  if claimed_by is not null and claimed_by <> current_profile then
    return 'already_claimed';
  end if;

  insert into public.student_accounts (student_id, profile_id)
  values (matched_student, current_profile)
  on conflict do nothing;

  if exists (
    select 1 from public.student_accounts sa
    where sa.student_id = matched_student and sa.profile_id = current_profile
  ) then
    return 'linked';
  end if;

  return 'link_failed';
end;
$$;

revoke all on function public.link_current_student_account_by_email() from public, anon;
grant execute on function public.link_current_student_account_by_email() to authenticated, service_role;

-- Tighten the one overly broad delete policy.
drop policy if exists grade_attempts_teacher_delete on public.grade_attempts;
create policy grade_attempts_teacher_delete
on public.grade_attempts
for delete
to authenticated
using ((select private.is_teacher_for_section((select private.grade_record_section(grade_attempts.grade_record_id)))));

-- Students need the school-year label for their own enrolled section, but nothing else.
drop policy if exists school_years_teacher_or_student_select on public.school_years;
drop policy if exists school_years_teacher_select on public.school_years;
create policy school_years_teacher_or_student_select
on public.school_years
for select
to authenticated
using (exists (
  select 1 from public.sections s
  where s.school_year_id = school_years.id
    and ((select private.is_teacher_for_section(s.id)) or (select private.is_student_in_section(s.id)))
));

-- Anonymous users should have no direct access to application tables.
revoke all privileges on all tables in schema public from anon;

-- Replace broad default authenticated grants with the minimum currently used by the app.
revoke all privileges on all tables in schema public from authenticated;
grant select on public.school_years, public.courses, public.profiles, public.sections, public.teacher_sections,
  public.grading_periods, public.grading_categories, public.student_accounts to authenticated;
grant select, insert, update on public.enrollments to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.grade_records to authenticated;
grant select, insert, update, delete on public.grade_attempts to authenticated;
grant select, insert on public.grade_changes to authenticated;
grant select, insert, update on public.grade_issue_reports to authenticated;
grant select, insert on public.power_school_snapshots to authenticated;
grant select, insert, update on public.students to authenticated;
grant select, insert, update on public.roster_import_batches to authenticated;

-- Private helper functions remain inaccessible as an API schema; explicitly scope execution anyway.
revoke all on function private.can_teacher_view_profile(uuid) from public, anon;
revoke all on function private.can_teacher_view_student(uuid) from public, anon;
revoke all on function private.current_student_id() from public, anon;
revoke all on function private.grade_record_section(uuid) from public, anon;
revoke all on function private.is_current_student(uuid) from public, anon;
revoke all on function private.is_student_in_section(uuid) from public, anon;
revoke all on function private.is_teacher_account() from public, anon;
revoke all on function private.is_teacher_for_section(uuid) from public, anon;
grant execute on function private.can_teacher_view_profile(uuid), private.can_teacher_view_student(uuid), private.current_student_id(), private.grade_record_section(uuid), private.is_current_student(uuid), private.is_student_in_section(uuid), private.is_teacher_account(), private.is_teacher_for_section(uuid) to authenticated;
