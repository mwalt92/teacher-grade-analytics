-- Roster identity and import architecture.
-- Students exist independently of authenticated profiles so teachers can import
-- rosters before students ever sign in. Google accounts link later through student_accounts.

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_email text,
  display_name text not null,
  first_name text,
  last_name text,
  external_student_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_external_student_key_key unique (external_student_key)
);

create table if not exists public.student_accounts (
  student_id uuid primary key references public.students(id) on delete cascade,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  linked_at timestamptz not null default now()
);

-- Preserve any auth-linked student data when upgrading an early database.
insert into public.students (id, school_email, display_name)
select p.id, nullif(p.email, ''), p.display_name
from public.profiles p
where p.role = 'student'
on conflict (id) do nothing;

insert into public.student_accounts (student_id, profile_id)
select p.id, p.id
from public.profiles p
where p.role = 'student'
on conflict do nothing;

alter table public.enrollments drop constraint if exists enrollments_student_id_fkey;
alter table public.enrollments add constraint enrollments_student_id_fkey foreign key (student_id) references public.students(id) on delete restrict;
alter table public.grade_records drop constraint if exists grade_records_student_id_fkey;
alter table public.grade_records add constraint grade_records_student_id_fkey foreign key (student_id) references public.students(id) on delete restrict;
alter table public.grade_issue_reports drop constraint if exists grade_issue_reports_student_id_fkey;
alter table public.grade_issue_reports add constraint grade_issue_reports_student_id_fkey foreign key (student_id) references public.students(id) on delete restrict;
alter table public.power_school_snapshots drop constraint if exists power_school_snapshots_student_id_fkey;
alter table public.power_school_snapshots add constraint power_school_snapshots_student_id_fkey foreign key (student_id) references public.students(id) on delete restrict;

create index if not exists student_accounts_profile_idx on public.student_accounts(profile_id);
create index if not exists students_name_idx on public.students(last_name, first_name);

alter table public.students enable row level security;
alter table public.student_accounts enable row level security;
revoke all on public.students, public.student_accounts from anon;
grant select, insert, update on public.students to authenticated;
grant select on public.student_accounts to authenticated;

create or replace function private.current_student_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select sa.student_id
  from public.student_accounts sa
  where sa.profile_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.is_current_student(target_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_student = (select private.current_student_id());
$$;

create or replace function private.is_teacher_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('teacher','admin')
  );
$$;

create or replace function private.can_teacher_view_student(target_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.enrollments e
    join public.teacher_sections ts on ts.section_id = e.section_id
    where e.student_id = target_student
      and ts.teacher_id = (select auth.uid())
  );
$$;

create or replace function private.is_student_in_section(target_section uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.enrollments e
    where e.student_id = (select private.current_student_id())
      and e.section_id = target_section
  );
$$;

create or replace function private.can_teacher_view_profile(target_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.student_accounts sa
    where sa.profile_id = target_profile
      and (select private.can_teacher_view_student(sa.student_id))
  );
$$;

revoke all on function private.current_student_id() from public;
revoke all on function private.is_current_student(uuid) from public;
revoke all on function private.is_teacher_account() from public;
revoke all on function private.can_teacher_view_student(uuid) from public;
grant execute on function private.current_student_id(), private.is_current_student(uuid), private.is_teacher_account(), private.can_teacher_view_student(uuid) to authenticated;

-- Replace early auth-id policies with student-record policies.
drop policy if exists enrollments_student_or_teacher_select on public.enrollments;
create policy enrollments_student_or_teacher_select on public.enrollments for select to authenticated
using ((select private.is_current_student(student_id)) or (select private.is_teacher_for_section(section_id)));

drop policy if exists grade_records_student_or_teacher_select on public.grade_records;
create policy grade_records_student_or_teacher_select on public.grade_records for select to authenticated using (
  (select private.is_current_student(student_id)) or
  (select private.is_teacher_for_section((select a.section_id from public.assignments a where a.id=assignment_id))));

drop policy if exists grade_attempts_student_or_teacher_select on public.grade_attempts;
create policy grade_attempts_student_or_teacher_select on public.grade_attempts for select to authenticated using (exists(
  select 1 from public.grade_records gr where gr.id=grade_record_id and
  ((select private.is_current_student(gr.student_id)) or (select private.is_teacher_for_section((select private.grade_record_section(gr.id)))))));

drop policy if exists grade_changes_student_or_teacher_select on public.grade_changes;
create policy grade_changes_student_or_teacher_select on public.grade_changes for select to authenticated using (exists(
  select 1 from public.grade_records gr where gr.id=grade_record_id and
  ((select private.is_current_student(gr.student_id)) or (select private.is_teacher_for_section((select private.grade_record_section(gr.id)))))));

drop policy if exists grade_issues_student_or_teacher_select on public.grade_issue_reports;
create policy grade_issues_student_or_teacher_select on public.grade_issue_reports for select to authenticated using (
  (select private.is_current_student(student_id)) or (select private.is_teacher_for_section((select private.grade_record_section(grade_record_id)))));

drop policy if exists grade_issues_student_insert on public.grade_issue_reports;
create policy grade_issues_student_insert on public.grade_issue_reports for insert to authenticated with check (
  (select private.is_current_student(student_id)) and exists(
    select 1 from public.grade_records gr where gr.id=grade_record_id and gr.student_id=grade_issue_reports.student_id));

drop policy if exists students_self_or_teacher_select on public.students;
create policy students_self_or_teacher_select on public.students for select to authenticated
using ((select private.is_current_student(id)) or (select private.can_teacher_view_student(id)));

drop policy if exists students_teacher_insert on public.students;
create policy students_teacher_insert on public.students for insert to authenticated
with check ((select private.is_teacher_account()));

drop policy if exists students_teacher_update on public.students;
create policy students_teacher_update on public.students for update to authenticated
using ((select private.can_teacher_view_student(id))) with check ((select private.can_teacher_view_student(id)));

drop policy if exists student_accounts_self_or_teacher_select on public.student_accounts;
create policy student_accounts_self_or_teacher_select on public.student_accounts for select to authenticated
using (profile_id=(select auth.uid()) or (select private.can_teacher_view_student(student_id)));

-- Teacher roster writes. Inactive students are preserved rather than deleted.
drop policy if exists enrollments_teacher_insert on public.enrollments;
create policy enrollments_teacher_insert on public.enrollments for insert to authenticated
with check ((select private.is_teacher_for_section(section_id)));

drop policy if exists enrollments_teacher_update on public.enrollments;
create policy enrollments_teacher_update on public.enrollments for update to authenticated
using ((select private.is_teacher_for_section(section_id)))
with check ((select private.is_teacher_for_section(section_id)));

-- Short-lived server-validated roster previews.
create table if not exists public.roster_import_batches (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  source_filename text not null,
  parsed_rows jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  status text not null default 'preview' check (status in ('preview','imported','cancelled','expired')),
  result_summary jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  imported_at timestamptz
);
create index if not exists roster_import_batches_teacher_created_idx on public.roster_import_batches(teacher_id, created_at desc);
create index if not exists roster_import_batches_expires_idx on public.roster_import_batches(expires_at);
alter table public.roster_import_batches enable row level security;
revoke all on public.roster_import_batches from anon;
grant select, insert, update on public.roster_import_batches to authenticated;

drop policy if exists roster_import_batches_select_own on public.roster_import_batches;
create policy roster_import_batches_select_own on public.roster_import_batches for select to authenticated using (teacher_id=(select auth.uid()));
drop policy if exists roster_import_batches_insert_own on public.roster_import_batches;
create policy roster_import_batches_insert_own on public.roster_import_batches for insert to authenticated with check (
  teacher_id=(select auth.uid()) and (select private.is_teacher_account()));
drop policy if exists roster_import_batches_update_own on public.roster_import_batches;
create policy roster_import_batches_update_own on public.roster_import_batches for update to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

-- An earlier prototype RPC was intentionally removed; roster writes go through
-- authenticated server actions plus RLS instead of a browser-callable SECURITY DEFINER RPC.
drop function if exists public.upsert_student_enrollment(uuid,text,text,text,text,text,date);
