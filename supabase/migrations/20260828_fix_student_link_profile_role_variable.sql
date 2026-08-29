create or replace function public.link_current_student_account_by_email()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_profile uuid := auth.uid();
  current_email text;
  v_profile_role text;
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

  select p.role into v_profile_role
  from public.profiles p
  where p.id = current_profile;

  if v_profile_role is distinct from 'student' then
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
$function$;

revoke all on function public.link_current_student_account_by_email() from public;
grant execute on function public.link_current_student_account_by_email() to authenticated, service_role;
