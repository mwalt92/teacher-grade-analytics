-- Teacher Grade Analytics initial remote-schema baseline.
-- Mirrors the secured Supabase project created 2026-08-22.
-- Development data must remain fake until authentication/RLS testing is complete.

create schema if not exists private;

create table public.school_years (
  id uuid primary key default gen_random_uuid(), label text not null unique,
  starts_on date not null, ends_on date not null, archived boolean not null default false,
  created_at timestamptz not null default now(), check (starts_on < ends_on)
);
create table public.courses (
  id uuid primary key default gen_random_uuid(), code text, name text not null,
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique, display_name text not null,
  role text not null check (role in ('teacher','student','admin','parent')),
  created_at timestamptz not null default now()
);
create table public.sections (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete restrict,
  school_year_id uuid not null references public.school_years(id) on delete restrict,
  name text not null, active boolean not null default true, created_at timestamptz not null default now()
);
create table public.teacher_sections (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  primary key (teacher_id, section_id)
);
create table public.enrollments (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete restrict,
  section_id uuid not null references public.sections(id) on delete restrict,
  enrolled_on date not null, exited_on date, active boolean not null default true,
  created_at timestamptz not null default now(), unique(student_id, section_id),
  check (exited_on is null or exited_on >= enrolled_on)
);
create table public.grading_periods (
  id uuid primary key default gen_random_uuid(), section_id uuid not null references public.sections(id) on delete cascade,
  code text not null, name text not null, starts_on date, ends_on date, unique(section_id, code)
);
create table public.grading_categories (
  id uuid primary key default gen_random_uuid(), section_id uuid not null references public.sections(id) on delete cascade,
  name text not null, weight numeric(8,6) not null check (weight between 0 and 1),
  drop_lowest integer not null default 0 check (drop_lowest >= 0),
  late_deduction numeric(8,6) not null default 0 check (late_deduction between 0 and 1),
  unique(section_id, name)
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(), section_id uuid not null references public.sections(id) on delete cascade,
  category_id uuid not null references public.grading_categories(id) on delete restrict,
  grading_period_id uuid references public.grading_periods(id) on delete restrict,
  title text not null, assignment_type text not null check (assignment_type in ('participation','quiz','test','project')),
  assignment_date date not null, points_possible numeric(12,4) not null check (points_possible > 0),
  allow_retakes boolean not null default false,
  late_deduction_override numeric(8,6) check (late_deduction_override is null or late_deduction_override between 0 and 1),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.grade_records (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  missing boolean not null default false, exempt boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(assignment_id, student_id)
);
create table public.grade_attempts (
  id uuid primary key default gen_random_uuid(), grade_record_id uuid not null references public.grade_records(id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1), points_earned numeric(12,4) not null check (points_earned >= 0),
  occurred_on date not null, is_late boolean not null default false,
  entered_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
  unique(grade_record_id, attempt_number)
);
create table public.grade_changes (
  id uuid primary key default gen_random_uuid(), grade_record_id uuid not null references public.grade_records(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null, changed_at timestamptz not null default now(),
  old_value jsonb, new_value jsonb not null, action text not null
);
create table public.grade_issue_reports (
  id uuid primary key default gen_random_uuid(), grade_record_id uuid not null references public.grade_records(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict, message text not null,
  status text not null default 'open' check (status in ('open','reviewed','resolved')),
  created_at timestamptz not null default now(), resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create table public.power_school_snapshots (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete restrict,
  section_id uuid not null references public.sections(id) on delete cascade,
  grading_period_id uuid references public.grading_periods(id) on delete set null,
  captured_at timestamptz not null default now(), powerschool_percent numeric(8,4) not null,
  website_percent numeric(8,4) not null, note text
);

create index enrollments_student_idx on public.enrollments(student_id);
create index enrollments_section_active_idx on public.enrollments(section_id, active);
create index teacher_sections_teacher_idx on public.teacher_sections(teacher_id);
create index teacher_sections_section_idx on public.teacher_sections(section_id);
create index sections_course_idx on public.sections(course_id);
create index sections_school_year_idx on public.sections(school_year_id);
create index assignments_section_date_idx on public.assignments(section_id, assignment_date desc);
create index assignments_category_idx on public.assignments(category_id);
create index assignments_grading_period_idx on public.assignments(grading_period_id);
create index assignments_created_by_idx on public.assignments(created_by);
create index grade_records_student_idx on public.grade_records(student_id);
create index grade_records_assignment_idx on public.grade_records(assignment_id);
create index grade_attempts_record_idx on public.grade_attempts(grade_record_id);
create index grade_attempts_entered_by_idx on public.grade_attempts(entered_by);
create index grade_changes_record_time_idx on public.grade_changes(grade_record_id, changed_at desc);
create index grade_changes_changed_by_idx on public.grade_changes(changed_by);
create index grade_issue_student_idx on public.grade_issue_reports(student_id);
create index grade_issue_record_idx on public.grade_issue_reports(grade_record_id);
create index grade_issue_resolved_by_idx on public.grade_issue_reports(resolved_by);
create index powerschool_section_student_idx on public.power_school_snapshots(section_id, student_id);
create index powerschool_student_idx on public.power_school_snapshots(student_id);
create index powerschool_period_idx on public.power_school_snapshots(grading_period_id);

alter table public.school_years enable row level security;
alter table public.courses enable row level security;
alter table public.profiles enable row level security;
alter table public.sections enable row level security;
alter table public.teacher_sections enable row level security;
alter table public.enrollments enable row level security;
alter table public.grading_periods enable row level security;
alter table public.grading_categories enable row level security;
alter table public.assignments enable row level security;
alter table public.grade_records enable row level security;
alter table public.grade_attempts enable row level security;
alter table public.grade_changes enable row level security;
alter table public.grade_issue_reports enable row level security;
alter table public.power_school_snapshots enable row level security;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

create or replace function private.is_teacher_for_section(target_section uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.teacher_sections ts where ts.teacher_id=(select auth.uid()) and ts.section_id=target_section);
$$;
create or replace function private.is_student_in_section(target_section uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.enrollments e where e.student_id=(select auth.uid()) and e.section_id=target_section);
$$;
create or replace function private.grade_record_section(target_record uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.section_id from public.grade_records gr join public.assignments a on a.id=gr.assignment_id where gr.id=target_record;
$$;
create or replace function private.can_teacher_view_profile(target_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.enrollments e join public.teacher_sections ts on ts.section_id=e.section_id
    where e.student_id=target_profile and ts.teacher_id=(select auth.uid()));
$$;
revoke all on function private.is_teacher_for_section(uuid) from public;
revoke all on function private.is_student_in_section(uuid) from public;
revoke all on function private.grade_record_section(uuid) from public;
revoke all on function private.can_teacher_view_profile(uuid) from public;
grant execute on function private.is_teacher_for_section(uuid), private.is_student_in_section(uuid), private.grade_record_section(uuid), private.can_teacher_view_profile(uuid) to authenticated;

create policy profiles_select_self on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_teacher_select_enrolled on public.profiles for select to authenticated using ((select private.can_teacher_view_profile(id)));
create policy teacher_sections_teacher_select on public.teacher_sections for select to authenticated using (teacher_id=(select auth.uid()));
create policy enrollments_student_or_teacher_select on public.enrollments for select to authenticated
  using (student_id=(select auth.uid()) or (select private.is_teacher_for_section(section_id)));
create policy sections_teacher_or_student_select on public.sections for select to authenticated
  using ((select private.is_teacher_for_section(id)) or (select private.is_student_in_section(id)));
create policy courses_teacher_or_student_select on public.courses for select to authenticated using (exists(
  select 1 from public.sections s where s.course_id=courses.id and ((select private.is_teacher_for_section(s.id)) or (select private.is_student_in_section(s.id)))));
create policy school_years_teacher_select on public.school_years for select to authenticated using (exists(
  select 1 from public.sections s where s.school_year_id=school_years.id and (select private.is_teacher_for_section(s.id))));
create policy grading_periods_section_select on public.grading_periods for select to authenticated
  using ((select private.is_teacher_for_section(section_id)) or (select private.is_student_in_section(section_id)));
create policy grading_categories_section_select on public.grading_categories for select to authenticated
  using ((select private.is_teacher_for_section(section_id)) or (select private.is_student_in_section(section_id)));
create policy assignments_section_select on public.assignments for select to authenticated
  using ((select private.is_teacher_for_section(section_id)) or (select private.is_student_in_section(section_id)));
create policy assignments_teacher_insert on public.assignments for insert to authenticated
  with check ((select private.is_teacher_for_section(section_id)) and created_by=(select auth.uid()));
create policy assignments_teacher_update on public.assignments for update to authenticated
  using ((select private.is_teacher_for_section(section_id))) with check ((select private.is_teacher_for_section(section_id)));
create policy grade_records_student_or_teacher_select on public.grade_records for select to authenticated using (
  student_id=(select auth.uid()) or (select private.is_teacher_for_section((select a.section_id from public.assignments a where a.id=assignment_id))));
create policy grade_records_teacher_insert on public.grade_records for insert to authenticated with check (
  (select private.is_teacher_for_section((select a.section_id from public.assignments a where a.id=assignment_id))));
create policy grade_records_teacher_update on public.grade_records for update to authenticated using (
  (select private.is_teacher_for_section((select a.section_id from public.assignments a where a.id=assignment_id)))) with check (
  (select private.is_teacher_for_section((select a.section_id from public.assignments a where a.id=assignment_id))));
create policy grade_attempts_student_or_teacher_select on public.grade_attempts for select to authenticated using (exists(
  select 1 from public.grade_records gr where gr.id=grade_record_id and
  (gr.student_id=(select auth.uid()) or (select private.is_teacher_for_section((select private.grade_record_section(gr.id)))))));
create policy grade_attempts_teacher_insert on public.grade_attempts for insert to authenticated with check (
  (select private.is_teacher_for_section((select private.grade_record_section(grade_record_id)))));
create policy grade_attempts_teacher_update on public.grade_attempts for update to authenticated using (
  (select private.is_teacher_for_section((select private.grade_record_section(grade_record_id))))) with check (
  (select private.is_teacher_for_section((select private.grade_record_section(grade_record_id))));
create policy grade_changes_student_or_teacher_select on public.grade_changes for select to authenticated using (exists(
  select 1 from public.grade_records gr where gr.id=grade_record_id and
  (gr.student_id=(select auth.uid()) or (select private.is_teacher_for_section((select private.grade_record_section(gr.id)))))));
create policy grade_changes_teacher_insert on public.grade_changes for insert to authenticated with check (
  (select private.is_teacher_for_section((select private.grade_record_section(grade_record_id)))) and changed_by=(select auth.uid()));
create policy grade_issues_student_or_teacher_select on public.grade_issue_reports for select to authenticated using (
  student_id=(select auth.uid()) or (select private.is_teacher_for_section((select private.grade_record_section(grade_record_id)))));
create policy grade_issues_student_insert on public.grade_issue_reports for insert to authenticated with check (
  student_id=(select auth.uid()) and exists(select 1 from public.grade_records gr where gr.id=grade_record_id and gr.student_id=(select auth.uid())));
create policy grade_issues_teacher_update on public.grade_issue_reports for update to authenticated using (
  (select private.is_teacher_for_section((select private.grade_record_section(grade_record_id))))) with check (
  (select private.is_teacher_for_section((select private.grade_record_section(grade_record_id))));
create policy powerschool_teacher_select on public.power_school_snapshots for select to authenticated using ((select private.is_teacher_for_section(section_id)));
create policy powerschool_teacher_insert on public.power_school_snapshots for insert to authenticated with check ((select private.is_teacher_for_section(section_id)));

create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,display_name,role)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',new.email,'User'),'student')
  on conflict(id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public;
create trigger on_auth_user_created_teacher_grade_analytics after insert on auth.users
for each row execute procedure private.handle_new_auth_user();
