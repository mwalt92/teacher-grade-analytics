-- Separate assignment type from grading category.
-- Assignment types are section-scoped templates/defaults; assignments keep resolved category/retake behavior.

create table public.assignment_types (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  default_category_id uuid not null references public.grading_categories(id) on delete restrict,
  default_points_possible numeric(12,4) not null default 10 check (default_points_possible > 0),
  default_allow_retakes boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(section_id, code),
  unique(section_id, name)
);

create index assignment_types_section_order_idx on public.assignment_types(section_id, sort_order, name);
create index assignment_types_default_category_idx on public.assignment_types(default_category_id);

alter table public.assignment_types enable row level security;
revoke all on table public.assignment_types from anon;
grant select, insert, update, delete on table public.assignment_types to authenticated;

create policy assignment_types_teacher_select on public.assignment_types
for select to authenticated
using ((select private.is_teacher_for_section(section_id)));

create policy assignment_types_teacher_insert on public.assignment_types
for insert to authenticated
with check ((select private.is_teacher_for_section(section_id)));

create policy assignment_types_teacher_update on public.assignment_types
for update to authenticated
using ((select private.is_teacher_for_section(section_id)))
with check ((select private.is_teacher_for_section(section_id)));

create policy assignment_types_teacher_delete on public.assignment_types
for delete to authenticated
using ((select private.is_teacher_for_section(section_id)));

alter table public.assignments
  add column assignment_type_id uuid references public.assignment_types(id) on delete restrict;

create index assignments_assignment_type_id_idx on public.assignments(assignment_type_id);

-- The legacy text field remains temporarily as a compatibility mirror, but it must support future configured type codes.
alter table public.assignments drop constraint if exists assignments_assignment_type_check;

insert into public.assignment_types(section_id, code, name, description, default_category_id, default_points_possible, default_allow_retakes, sort_order)
select gc.section_id,
       gc.code,
       case gc.code when 'participation' then 'Participation' when 'quiz' then 'Quiz' when 'test' then 'Test' else initcap(replace(gc.code, '_', ' ')) end,
       case gc.code
         when 'participation' then 'Routine classwork or participation entry. One attempt by default.'
         when 'quiz' then 'Quiz assessment. Retakes enabled by default.'
         when 'test' then 'Test assessment. Retakes enabled by default.'
         else null
       end,
       gc.id,
       10,
       gc.code in ('quiz','test'),
       gc.sort_order
from public.grading_categories gc
where gc.code in ('participation','quiz','test')
on conflict(section_id, code) do nothing;

update public.assignments a
set assignment_type_id = at.id
from public.assignment_types at
where at.section_id = a.section_id
  and at.code = a.assignment_type
  and a.assignment_type_id is null;

alter table public.assignments alter column assignment_type_id set not null;
