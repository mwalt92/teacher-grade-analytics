create table if not exists public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  school_year_id uuid not null references public.school_years(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (course_id, school_year_id)
);

alter table public.course_offerings enable row level security;

alter table public.sections add column if not exists offering_id uuid;
alter table public.sections add column if not exists period_number integer;
alter table public.sections add column if not exists sort_order integer not null default 0;

insert into public.course_offerings (course_id, school_year_id)
select distinct s.course_id, s.school_year_id
from public.sections s
on conflict (course_id, school_year_id) do nothing;

update public.sections s
set offering_id = o.id
from public.course_offerings o
where o.course_id = s.course_id
  and o.school_year_id = s.school_year_id
  and s.offering_id is null;

with ranked as (
  select id, row_number() over (partition by offering_id order by created_at, name, id) * 10 as desired_order
  from public.sections
)
update public.sections s
set sort_order = ranked.desired_order
from ranked
where ranked.id = s.id
  and s.sort_order = 0;

alter table public.sections alter column offering_id set not null;
alter table public.sections
  add constraint sections_offering_id_fkey foreign key (offering_id) references public.course_offerings(id) on delete restrict;

create unique index if not exists sections_offering_name_unique
  on public.sections (offering_id, lower(name));

create or replace function private.is_teacher_for_offering(target_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_sections ts
    join public.sections s on s.id = ts.section_id
    where ts.teacher_id = (select auth.uid())
      and s.offering_id = target_offering
  );
$$;

create or replace function private.is_student_in_offering(target_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.sections s on s.id = e.section_id
    where e.student_id = (select private.current_student_id())
      and s.offering_id = target_offering
  );
$$;

revoke all on function private.is_teacher_for_offering(uuid) from public, anon, authenticated;
revoke all on function private.is_student_in_offering(uuid) from public, anon, authenticated;

drop policy if exists course_offerings_teacher_or_student_select on public.course_offerings;
create policy course_offerings_teacher_or_student_select
on public.course_offerings
for select
to authenticated
using (
  (select private.is_teacher_for_offering(course_offerings.id))
  or (select private.is_student_in_offering(course_offerings.id))
);

drop policy if exists sections_teacher_insert on public.sections;
create policy sections_teacher_insert
on public.sections
for insert
to authenticated
with check ((select private.is_teacher_for_offering(sections.offering_id)));

drop policy if exists sections_teacher_update on public.sections;
create policy sections_teacher_update
on public.sections
for update
to authenticated
using ((select private.is_teacher_for_offering(sections.offering_id)))
with check ((select private.is_teacher_for_offering(sections.offering_id)));

drop policy if exists teacher_sections_teacher_insert on public.teacher_sections;
create policy teacher_sections_teacher_insert
on public.teacher_sections
for insert
to authenticated
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.sections s
    where s.id = teacher_sections.section_id
      and (select private.is_teacher_for_offering(s.offering_id))
  )
);

alter table public.grading_categories add column if not exists offering_id uuid;
alter table public.grading_periods add column if not exists offering_id uuid;
alter table public.assignment_types add column if not exists offering_id uuid;

update public.grading_categories gc
set offering_id = s.offering_id
from public.sections s
where s.id = gc.section_id
  and gc.offering_id is null;

update public.grading_periods gp
set offering_id = s.offering_id
from public.sections s
where s.id = gp.section_id
  and gp.offering_id is null;

update public.assignment_types at
set offering_id = s.offering_id
from public.sections s
where s.id = at.section_id
  and at.offering_id is null;

alter table public.grading_categories alter column offering_id set not null;
alter table public.grading_periods alter column offering_id set not null;
alter table public.assignment_types alter column offering_id set not null;

alter table public.grading_categories
  add constraint grading_categories_offering_id_fkey foreign key (offering_id) references public.course_offerings(id) on delete restrict;
alter table public.grading_periods
  add constraint grading_periods_offering_id_fkey foreign key (offering_id) references public.course_offerings(id) on delete restrict;
alter table public.assignment_types
  add constraint assignment_types_offering_id_fkey foreign key (offering_id) references public.course_offerings(id) on delete restrict;

create unique index if not exists grading_categories_offering_name_unique
  on public.grading_categories (offering_id, lower(name));
create unique index if not exists grading_categories_offering_code_unique
  on public.grading_categories (offering_id, code);
create unique index if not exists grading_periods_offering_code_unique
  on public.grading_periods (offering_id, code);
create unique index if not exists grading_periods_offering_name_unique
  on public.grading_periods (offering_id, lower(name));
create unique index if not exists assignment_types_offering_code_unique
  on public.assignment_types (offering_id, code);
create unique index if not exists assignment_types_offering_name_unique
  on public.assignment_types (offering_id, lower(name));

create or replace function private.set_config_offering_from_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_offering uuid;
begin
  select s.offering_id into resolved_offering
  from public.sections s
  where s.id = new.section_id;

  if resolved_offering is null then
    raise exception 'Configuration must reference a valid section';
  end if;

  if new.offering_id is null then
    new.offering_id := resolved_offering;
  elsif new.offering_id <> resolved_offering then
    raise exception 'Configuration section and course offering do not match';
  end if;

  return new;
end;
$$;

revoke all on function private.set_config_offering_from_section() from public, anon, authenticated;

drop trigger if exists grading_categories_set_offering on public.grading_categories;
create trigger grading_categories_set_offering
before insert or update of section_id, offering_id on public.grading_categories
for each row execute function private.set_config_offering_from_section();

drop trigger if exists grading_periods_set_offering on public.grading_periods;
create trigger grading_periods_set_offering
before insert or update of section_id, offering_id on public.grading_periods
for each row execute function private.set_config_offering_from_section();

drop trigger if exists assignment_types_set_offering on public.assignment_types;
create trigger assignment_types_set_offering
before insert or update of section_id, offering_id on public.assignment_types
for each row execute function private.set_config_offering_from_section();

drop policy if exists grading_categories_section_select on public.grading_categories;
drop policy if exists grading_categories_teacher_insert on public.grading_categories;
drop policy if exists grading_categories_teacher_update on public.grading_categories;
create policy grading_categories_offering_select on public.grading_categories
for select to authenticated
using ((select private.is_teacher_for_offering(grading_categories.offering_id)) or (select private.is_student_in_offering(grading_categories.offering_id)));
create policy grading_categories_teacher_insert on public.grading_categories
for insert to authenticated
with check ((select private.is_teacher_for_offering(grading_categories.offering_id)));
create policy grading_categories_teacher_update on public.grading_categories
for update to authenticated
using ((select private.is_teacher_for_offering(grading_categories.offering_id)))
with check ((select private.is_teacher_for_offering(grading_categories.offering_id)));

drop policy if exists grading_periods_section_select on public.grading_periods;
drop policy if exists grading_periods_teacher_insert on public.grading_periods;
drop policy if exists grading_periods_teacher_update on public.grading_periods;
create policy grading_periods_offering_select on public.grading_periods
for select to authenticated
using ((select private.is_teacher_for_offering(grading_periods.offering_id)) or (select private.is_student_in_offering(grading_periods.offering_id)));
create policy grading_periods_teacher_insert on public.grading_periods
for insert to authenticated
with check ((select private.is_teacher_for_offering(grading_periods.offering_id)));
create policy grading_periods_teacher_update on public.grading_periods
for update to authenticated
using ((select private.is_teacher_for_offering(grading_periods.offering_id)))
with check ((select private.is_teacher_for_offering(grading_periods.offering_id)));

drop policy if exists assignment_types_teacher_select on public.assignment_types;
drop policy if exists assignment_types_teacher_insert on public.assignment_types;
drop policy if exists assignment_types_teacher_update on public.assignment_types;
drop policy if exists assignment_types_teacher_delete on public.assignment_types;
create policy assignment_types_teacher_select on public.assignment_types
for select to authenticated
using ((select private.is_teacher_for_offering(assignment_types.offering_id)));
create policy assignment_types_teacher_insert on public.assignment_types
for insert to authenticated
with check ((select private.is_teacher_for_offering(assignment_types.offering_id)));
create policy assignment_types_teacher_update on public.assignment_types
for update to authenticated
using ((select private.is_teacher_for_offering(assignment_types.offering_id)))
with check ((select private.is_teacher_for_offering(assignment_types.offering_id)));
create policy assignment_types_teacher_delete on public.assignment_types
for delete to authenticated
using ((select private.is_teacher_for_offering(assignment_types.offering_id)));

drop policy if exists grading_period_components_section_select on public.grading_period_components;
drop policy if exists grading_period_components_teacher_insert on public.grading_period_components;
drop policy if exists grading_period_components_teacher_update on public.grading_period_components;
drop policy if exists grading_period_components_teacher_delete on public.grading_period_components;
create policy grading_period_components_offering_select on public.grading_period_components
for select to authenticated
using (exists (
  select 1 from public.grading_periods parent
  where parent.id = grading_period_components.parent_period_id
    and ((select private.is_teacher_for_offering(parent.offering_id)) or (select private.is_student_in_offering(parent.offering_id)))
));
create policy grading_period_components_teacher_insert on public.grading_period_components
for insert to authenticated
with check (exists (
  select 1
  from public.grading_periods parent
  join public.grading_periods component on component.id = grading_period_components.component_period_id
  where parent.id = grading_period_components.parent_period_id
    and parent.offering_id = component.offering_id
    and (select private.is_teacher_for_offering(parent.offering_id))
));
create policy grading_period_components_teacher_update on public.grading_period_components
for update to authenticated
using (exists (
  select 1 from public.grading_periods parent
  where parent.id = grading_period_components.parent_period_id
    and (select private.is_teacher_for_offering(parent.offering_id))
))
with check (exists (
  select 1
  from public.grading_periods parent
  join public.grading_periods component on component.id = grading_period_components.component_period_id
  where parent.id = grading_period_components.parent_period_id
    and parent.offering_id = component.offering_id
    and (select private.is_teacher_for_offering(parent.offering_id))
));
create policy grading_period_components_teacher_delete on public.grading_period_components
for delete to authenticated
using (exists (
  select 1 from public.grading_periods parent
  where parent.id = grading_period_components.parent_period_id
    and (select private.is_teacher_for_offering(parent.offering_id))
));

create or replace function public.save_grading_period_settings(p_section_id uuid, p_periods jsonb, p_components jsonb)
returns void
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_offering_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select s.offering_id into v_offering_id
  from public.sections s
  join public.teacher_sections ts on ts.section_id = s.id
  where s.id = p_section_id
    and ts.teacher_id = auth.uid();

  if v_offering_id is null then
    raise exception 'You do not have access to this section';
  end if;

  if jsonb_typeof(p_periods) <> 'array' or jsonb_array_length(p_periods) = 0 then
    raise exception 'At least one grading period is required';
  end if;
  if jsonb_typeof(p_components) <> 'array' then
    raise exception 'Invalid grading-period components';
  end if;

  create temporary table tmp_grading_periods (
    id uuid primary key,
    code text not null,
    name text not null,
    calculation_mode text not null,
    period_role text not null,
    sort_order integer not null
  ) on commit drop;

  insert into tmp_grading_periods(id, code, name, calculation_mode, period_role, sort_order)
  select id, trim(code), trim(name), calculation_mode, period_role, sort_order
  from jsonb_to_recordset(p_periods) as x(
    id uuid,
    code text,
    name text,
    calculation_mode text,
    period_role text,
    sort_order integer
  );

  if exists (select 1 from tmp_grading_periods where code = '' or name = '') then raise exception 'Every grading period needs a code and name'; end if;
  if exists (select 1 from tmp_grading_periods where code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$') then raise exception 'Grading-period codes may use only letters, numbers, hyphens, and underscores'; end if;
  if exists (select lower(code) from tmp_grading_periods group by lower(code) having count(*) > 1) then raise exception 'Grading-period codes must be unique within the course'; end if;
  if exists (select lower(name) from tmp_grading_periods group by lower(name) having count(*) > 1) then raise exception 'Grading-period names must be unique within the course'; end if;
  if exists (select 1 from tmp_grading_periods where calculation_mode not in ('direct','composite')) then raise exception 'Invalid grading-period calculation mode'; end if;
  if exists (select 1 from tmp_grading_periods where period_role not in ('standard','exam')) then raise exception 'Invalid grading-period role'; end if;
  if exists (select 1 from tmp_grading_periods where calculation_mode = 'composite' and period_role <> 'standard') then raise exception 'Composite grading periods must use the standard role'; end if;
  if not exists (select 1 from tmp_grading_periods where calculation_mode = 'direct') then raise exception 'Keep at least one direct grading period so assignments have somewhere to belong'; end if;

  if exists (
    select 1 from tmp_grading_periods submitted
    join public.grading_periods current on current.id = submitted.id
    where current.offering_id <> v_offering_id
  ) then raise exception 'A grading period does not belong to this course'; end if;

  if exists (
    select 1 from public.grading_periods current
    where current.offering_id = v_offering_id
      and not exists (select 1 from tmp_grading_periods submitted where submitted.id = current.id)
  ) then raise exception 'Existing grading periods cannot be removed from this screen yet'; end if;

  if exists (
    select 1 from tmp_grading_periods submitted
    join public.grading_periods current on current.id = submitted.id
    where current.offering_id = v_offering_id
      and current.calculation_mode <> submitted.calculation_mode
  ) then raise exception 'Existing grading-period types cannot be changed'; end if;

  if exists (
    select 1 from tmp_grading_periods submitted
    join public.grading_periods current on current.id = submitted.id
    where current.offering_id = v_offering_id
      and current.code <> submitted.code
      and (
        exists (select 1 from public.assignments a where a.grading_period_id = current.id)
        or exists (select 1 from public.grading_period_components c where c.parent_period_id = current.id or c.component_period_id = current.id)
        or exists (select 1 from public.power_school_snapshots ps where ps.grading_period_id = current.id)
      )
  ) then raise exception 'A grading-period code is locked because the period already has assignments, composite links, or imported grade history'; end if;

  create temporary table tmp_grading_period_components (
    parent_period_id uuid not null,
    component_period_id uuid not null,
    weight numeric not null,
    sort_order integer not null,
    primary key(parent_period_id, component_period_id)
  ) on commit drop;

  insert into tmp_grading_period_components(parent_period_id, component_period_id, weight, sort_order)
  select parent_period_id, component_period_id, weight, sort_order
  from jsonb_to_recordset(p_components) as x(
    parent_period_id uuid,
    component_period_id uuid,
    weight numeric,
    sort_order integer
  );

  if exists (select 1 from tmp_grading_period_components where weight <= 0) then raise exception 'Composite component weights must be greater than 0'; end if;
  if exists (
    select 1
    from tmp_grading_period_components c
    left join tmp_grading_periods parent on parent.id = c.parent_period_id
    left join tmp_grading_periods component on component.id = c.component_period_id
    where parent.id is null or component.id is null
      or parent.calculation_mode <> 'composite'
      or component.calculation_mode <> 'direct'
      or parent.id = component.id
  ) then raise exception 'Composite periods may contain only direct periods from the same course'; end if;
  if exists (
    select 1 from tmp_grading_periods p
    where p.calculation_mode = 'direct'
      and exists (select 1 from tmp_grading_period_components c where c.parent_period_id = p.id)
  ) then raise exception 'Direct grading periods cannot contain components'; end if;
  if exists (
    select 1 from tmp_grading_periods p
    where p.calculation_mode = 'composite'
      and not exists (select 1 from tmp_grading_period_components c where c.parent_period_id = p.id)
  ) then raise exception 'Every composite grading period needs at least one component'; end if;
  if exists (
    select 1 from tmp_grading_periods p
    where p.calculation_mode = 'composite'
      and abs((select coalesce(sum(c.weight),0) from tmp_grading_period_components c where c.parent_period_id = p.id) - 1) > 0.00005
  ) then raise exception 'Each composite grading period must total 100 percent'; end if;

  insert into public.grading_periods(
    id, section_id, offering_id, code, name, starts_on, ends_on, calculation_mode, sort_order, period_role
  )
  select p.id, p_section_id, v_offering_id, p.code, p.name, null, null, p.calculation_mode, p.sort_order, p.period_role
  from tmp_grading_periods p
  on conflict (id) do update
  set code = excluded.code,
      name = excluded.name,
      sort_order = excluded.sort_order,
      period_role = excluded.period_role
  where public.grading_periods.offering_id = v_offering_id;

  delete from public.grading_period_components c
  using public.grading_periods p
  where c.parent_period_id = p.id
    and p.offering_id = v_offering_id;

  insert into public.grading_period_components(parent_period_id, component_period_id, weight, sort_order)
  select parent_period_id, component_period_id, weight, sort_order
  from tmp_grading_period_components;
end;
$$;
