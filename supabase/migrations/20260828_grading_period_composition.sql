alter table public.grading_periods
  add column if not exists calculation_mode text not null default 'direct',
  add column if not exists sort_order integer not null default 0;

alter table public.grading_periods
  drop constraint if exists grading_periods_calculation_mode_check;
alter table public.grading_periods
  add constraint grading_periods_calculation_mode_check
  check (calculation_mode in ('direct','composite'));

create table if not exists public.grading_period_components (
  id uuid primary key default gen_random_uuid(),
  parent_period_id uuid not null references public.grading_periods(id) on delete cascade,
  component_period_id uuid not null references public.grading_periods(id) on delete restrict,
  weight numeric(8,6) not null check (weight > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(parent_period_id, component_period_id),
  check (parent_period_id <> component_period_id)
);

alter table public.grading_period_components enable row level security;
revoke all on public.grading_period_components from anon;
grant select on public.grading_period_components to authenticated;

drop policy if exists grading_period_components_section_select on public.grading_period_components;
create policy grading_period_components_section_select
on public.grading_period_components
for select
to authenticated
using (
  exists (
    select 1
    from public.grading_periods parent
    where parent.id = grading_period_components.parent_period_id
      and (
        (select private.is_teacher_for_section(parent.section_id))
        or (select private.is_student_in_section(parent.section_id))
      )
  )
);

update public.grading_periods
set calculation_mode = case when code in ('S1','S2') then 'composite' else 'direct' end,
    sort_order = case code
      when 'Q1' then 10
      when 'Q2' then 20
      when 'S1' then 40
      when 'Q3' then 50
      when 'Q4' then 60
      when 'S2' then 80
      else sort_order
    end;

insert into public.grading_periods(section_id, code, name, calculation_mode, sort_order)
select s.id, 'E1', 'Semester 1 Exam', 'direct', 30
from public.sections s
join public.courses c on c.id = s.course_id
where c.code = 'M215'
  and not exists (
    select 1 from public.grading_periods gp where gp.section_id = s.id and gp.code = 'E1'
  );

insert into public.grading_periods(section_id, code, name, calculation_mode, sort_order)
select s.id, 'E2', 'Semester 2 Exam', 'direct', 70
from public.sections s
join public.courses c on c.id = s.course_id
where c.code = 'M215'
  and not exists (
    select 1 from public.grading_periods gp where gp.section_id = s.id and gp.code = 'E2'
  );

insert into public.grading_period_components(parent_period_id, component_period_id, weight, sort_order)
select parent.id, component.id, v.weight, v.sort_order
from public.grading_periods parent
join (values
  ('S1','Q1',0.4::numeric,10),
  ('S1','Q2',0.4::numeric,20),
  ('S1','E1',0.2::numeric,30),
  ('S2','Q3',0.4::numeric,10),
  ('S2','Q4',0.4::numeric,20),
  ('S2','E2',0.2::numeric,30)
) as v(parent_code, component_code, weight, sort_order)
  on parent.code = v.parent_code
join public.grading_periods component
  on component.section_id = parent.section_id and component.code = v.component_code
join public.sections s on s.id = parent.section_id
join public.courses c on c.id = s.course_id and c.code = 'M215'
where parent.section_id = component.section_id
on conflict (parent_period_id, component_period_id)
do update set weight = excluded.weight, sort_order = excluded.sort_order;
