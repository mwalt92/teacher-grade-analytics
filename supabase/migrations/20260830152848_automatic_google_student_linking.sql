-- Automatically link verified Google student identities to roster records by school email.
-- The privileged implementation stays in the non-exposed private schema; no student-callable SECURITY DEFINER RPC remains in public.

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

  select count(*), min(s.id)
    into v_match_count, v_student_id
  from public.students s
  where s.school_email is not null
    and lower(btrim(s.school_email)) = v_email;

  if v_match_count <> 1 then
    -- Ambiguous or missing roster email must never retain automatic access.
    delete from public.student_accounts sa
    where sa.profile_id = p_profile_id;
    return case when v_match_count = 0 then 'no_match' else 'ambiguous_match' end;
  end if;

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

create or replace function private.reconcile_google_identity_student_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if new.provider <> 'google' then
    return new;
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = new.user_id;

  perform private.reconcile_student_account_link(new.user_id, v_email);
  return new;
end;
$$;

revoke all on function private.reconcile_google_identity_student_link() from public, anon, authenticated;
grant execute on function private.reconcile_google_identity_student_link() to service_role;

drop trigger if exists reconcile_google_student_link on auth.identities;
create trigger reconcile_google_student_link
after insert or update of provider, user_id
on auth.identities
for each row
execute function private.reconcile_google_identity_student_link();

create or replace function private.reconcile_roster_student_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_profile_email text;
begin
  -- If an existing automatic link no longer matches the roster email, clear it first.
  select sa.profile_id, u.email
    into v_profile_id, v_profile_email
  from public.student_accounts sa
  join auth.users u on u.id = sa.profile_id
  where sa.student_id = new.id;

  if v_profile_id is not null
     and lower(btrim(coalesce(v_profile_email, ''))) is distinct from lower(btrim(coalesce(new.school_email, ''))) then
    delete from public.student_accounts
    where student_id = new.id
      and profile_id = v_profile_id;
    v_profile_id := null;
  end if;

  if new.school_email is null or btrim(new.school_email) = '' then
    return new;
  end if;

  select u.id
    into v_profile_id
  from auth.users u
  join public.profiles p on p.id = u.id and p.role = 'student'
  where lower(btrim(coalesce(u.email, ''))) = lower(btrim(new.school_email))
    and exists (
      select 1
      from auth.identities i
      where i.user_id = u.id
        and i.provider = 'google'
    )
  limit 1;

  if v_profile_id is not null then
    perform private.reconcile_student_account_link(v_profile_id, new.school_email);
  end if;

  return new;
end;
$$;

revoke all on function private.reconcile_roster_student_link() from public, anon, authenticated;
grant execute on function private.reconcile_roster_student_link() to service_role;

drop trigger if exists reconcile_roster_student_link on public.students;
create trigger reconcile_roster_student_link
after insert or update of school_email
on public.students
for each row
execute function private.reconcile_roster_student_link();

-- Reconcile when a Google user's email changes after initial identity creation.
create or replace function private.reconcile_auth_user_student_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email is distinct from new.email then
    perform private.reconcile_student_account_link(new.id, new.email);
  end if;
  return new;
end;
$$;

revoke all on function private.reconcile_auth_user_student_link() from public, anon, authenticated;
grant execute on function private.reconcile_auth_user_student_link() to service_role;

drop trigger if exists reconcile_auth_user_student_link on auth.users;
create trigger reconcile_auth_user_student_link
after update of email
on auth.users
for each row
execute function private.reconcile_auth_user_student_link();

-- Remove the old exposed privileged linking endpoint. Linking is now automatic from trusted database events.
revoke execute on function public.link_current_student_account_by_email() from public, anon, authenticated;
drop function if exists public.link_current_student_account_by_email();
