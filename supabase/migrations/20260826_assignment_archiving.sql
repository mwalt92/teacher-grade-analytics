alter table public.assignments
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz null;

create index if not exists assignments_section_archived_date_idx
  on public.assignments (section_id, archived, assignment_date);
