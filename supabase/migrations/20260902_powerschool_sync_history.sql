create table if not exists public.powerschool_sync_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  section_id uuid null references public.sections(id) on delete set null,
  assignment_id uuid null references public.assignments(id) on delete set null,
  student_id uuid null references public.students(id) on delete set null,
  resource_type text not null check (resource_type in ('category','assignment','score','status','connection','other')),
  operation_type text not null check (operation_type in ('preview','create','update','restore','verify','other')),
  phase text not null check (phase in ('before_snapshot','proposed_change','response','verified_after','warning','conflict','error')),
  external_resource_id text null,
  payload jsonb null,
  summary text null,
  source_event_id uuid null references public.powerschool_sync_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint powerschool_sync_event_student_requires_section check (student_id is null or section_id is not null),
  constraint powerschool_sync_event_assignment_requires_section check (assignment_id is null or section_id is not null)
);

create index if not exists powerschool_sync_events_teacher_created_idx
  on public.powerschool_sync_events (teacher_id, created_at desc);
create index if not exists powerschool_sync_events_operation_idx
  on public.powerschool_sync_events (operation_id, created_at asc);
create index if not exists powerschool_sync_events_section_idx
  on public.powerschool_sync_events (section_id, created_at desc)
  where section_id is not null;

alter table public.powerschool_sync_events enable row level security;

drop policy if exists powerschool_sync_events_teacher_select on public.powerschool_sync_events;
create policy powerschool_sync_events_teacher_select
on public.powerschool_sync_events
for select
to authenticated
using (teacher_id = (select auth.uid()));

drop policy if exists powerschool_sync_events_teacher_insert on public.powerschool_sync_events;
create policy powerschool_sync_events_teacher_insert
on public.powerschool_sync_events
for insert
to authenticated
with check (
  teacher_id = (select auth.uid())
  and (
    section_id is null
    or (select private.is_teacher_for_section(section_id))
  )
  and (
    assignment_id is null
    or exists (
      select 1
      from public.assignments a
      where a.id = assignment_id
        and a.section_id = section_id
        and (select private.is_teacher_for_section(a.section_id))
    )
  )
  and (
    student_id is null
    or exists (
      select 1
      from public.enrollments e
      where e.section_id = section_id
        and e.student_id = student_id
    )
  )
);

-- Deliberately no UPDATE or DELETE policy. Sync history is append-only through normal authenticated access.

grant select, insert on public.powerschool_sync_events to authenticated;
