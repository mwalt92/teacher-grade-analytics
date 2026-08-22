-- Initial schema plan only. Do not run against production yet.

create table school_years (
  id uuid primary key,
  label text not null unique,
  starts_on date not null,
  ends_on date not null,
  archived boolean not null default false
);

create table courses (
  id uuid primary key,
  code text,
  name text not null
);

create table sections (
  id uuid primary key,
  course_id uuid not null references courses(id),
  school_year_id uuid not null references school_years(id),
  name text not null,
  active boolean not null default true
);

create table profiles (
  id uuid primary key,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('teacher','student','admin','parent'))
);

create table enrollments (
  id uuid primary key,
  student_id uuid not null references profiles(id),
  section_id uuid not null references sections(id),
  enrolled_on date not null,
  exited_on date,
  active boolean not null default true
);

create table grading_categories (
  id uuid primary key,
  section_id uuid not null references sections(id),
  name text not null,
  weight numeric(8,6) not null,
  drop_lowest integer not null default 0,
  late_deduction numeric(8,6) not null default 0
);

create table assignments (
  id uuid primary key,
  section_id uuid not null references sections(id),
  category_id uuid not null references grading_categories(id),
  title text not null,
  assignment_type text not null check (assignment_type in ('participation','quiz','test','project')),
  assignment_date date not null,
  points_possible numeric(12,4) not null check (points_possible > 0),
  allow_retakes boolean not null default false,
  created_at timestamptz not null default now()
);

create table grade_records (
  id uuid primary key,
  assignment_id uuid not null references assignments(id),
  student_id uuid not null references profiles(id),
  missing boolean not null default false,
  exempt boolean not null default false,
  unique (assignment_id, student_id)
);

create table grade_attempts (
  id uuid primary key,
  grade_record_id uuid not null references grade_records(id),
  attempt_number integer not null,
  points_earned numeric(12,4) not null,
  occurred_on date not null,
  created_at timestamptz not null default now(),
  unique (grade_record_id, attempt_number)
);

create table grade_changes (
  id uuid primary key,
  grade_record_id uuid not null references grade_records(id),
  changed_by uuid not null references profiles(id),
  changed_at timestamptz not null default now(),
  old_value jsonb,
  new_value jsonb not null,
  action text not null
);

create table power_school_snapshots (
  id uuid primary key,
  student_id uuid not null references profiles(id),
  section_id uuid not null references sections(id),
  grading_period text not null,
  captured_at timestamptz not null default now(),
  powerschool_percent numeric(8,4) not null,
  website_percent numeric(8,4) not null
);
