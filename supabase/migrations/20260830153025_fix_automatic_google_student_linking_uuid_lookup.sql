create or replace function private.reconcile_student_account_link(
  p_profile_id uuid,
  p_email text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_match_count integer;
  v_student_id uuid;
  v_existing_student_id uuid;
  v_claimed_by uuid;
begin
  if p_profile_id is null then
    return 'unauthenticated';
  end if;

  if v_email = '' then
    delete from public.student_accounts where profile_id = p_profile_id;
    return 'no_email';
  end if;

  if not exists (
    select 1
    from auth.identities i
    where i.user_id = p_profile_id
      and i.provider = 'google'
  ) then
    delete from public.student_accounts where profile_id = p_profile_id;
    return 'google_required';
  end if;

  select p.role
    into v_role
  from public.profiles p
  where p.id = p_profile_id;

  if v_role is distinct from 'student' then
    delete from public.student_accounts where profile_id = p_profile_id;
    return 'not_student';
  end if;

  select count(*)
    into v_match_count
  from public.students s
  where s.school_email is not null
    and lower(btrim(s.school_email)) = v_email;

  if v_match_count <> 1 then
    delete from public.student_accounts sa
    where sa.profile_id = p_profile_id;
    return case when v_match_count = 0 then 'no_match' else 'ambiguous_match' end;
  end if;

  select s.id
    into v_student_id
  from public.students s
  where s.school_email is not null
    and lower(btrim(s.school_email)) = v_email
  limit 1;

  select sa.student_id
    into v_existing_student_id
  from public.student_accounts sa
  where sa.profile_id = p_profile_id;

  if v_existing_student_id is not null and v_existing_student_id <> v_student_id then
    delete from public.student_accounts where profile_id = p_profile_id;
  end if;

  select sa.profile_id
    into v_claimed_by
  from public.student_accounts sa
  where sa.student_id = v_student_id;

  if v_claimed_by is not null and v_claimed_by <> p_profile_id then
    return 'already_claimed';
  end if;

  insert into public.student_accounts (student_id, profile_id)
  values (v_student_id, p_profile_id)
  on conflict do nothing;

  if exists (
    select 1
    from public.student_accounts sa
    where sa.student_id = v_student_id
      and sa.profile_id = p_profile_id
  ) then
    return 'linked';
  end if;

  return 'link_failed';
end;
$$;

revoke all on function private.reconcile_student_account_link(uuid, text) from public, anon, authenticated;
grant execute on function private.reconcile_student_account_link(uuid, text) to service_role;
