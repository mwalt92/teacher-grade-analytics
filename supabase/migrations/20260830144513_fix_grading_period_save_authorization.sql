create or replace function public.save_grading_period_settings(
  p_section_id uuid,
  p_periods jsonb,
  p_components jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1
    from public.teacher_sections ts
    where ts.teacher_id = auth.uid()
      and ts.section_id = p_section_id
  ) then
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

  if exists (select 1 from tmp_grading_periods where code = '' or name = '') then
    raise exception 'Every grading period needs a code and name';
  end if;
  if exists (select 1 from tmp_grading_periods where code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$') then
    raise exception 'Grading-period codes may use only letters, numbers, hyphens, and underscores';
  end if;
  if exists (select lower(code) from tmp_grading_periods group by lower(code) having count(*) > 1) then
    raise exception 'Grading-period codes must be unique within the course';
  end if;
  if exists (select lower(name) from tmp_grading_periods group by lower(name) having count(*) > 1) then
    raise exception 'Grading-period names must be unique within the course';
  end if;
  if exists (select 1 from tmp_grading_periods where calculation_mode not in ('direct','composite')) then
    raise exception 'Invalid grading-period calculation mode';
  end if;
  if exists (select 1 from tmp_grading_periods where period_role not in ('standard','exam')) then
    raise exception 'Invalid grading-period role';
  end if;
  if exists (select 1 from tmp_grading_periods where calculation_mode = 'composite' and period_role <> 'standard') then
    raise exception 'Composite grading periods must use the standard role';
  end if;
  if not exists (select 1 from tmp_grading_periods where calculation_mode = 'direct') then
    raise exception 'Keep at least one direct grading period so assignments have somewhere to belong';
  end if;

  if exists (
    select 1
    from tmp_grading_periods submitted
    join public.grading_periods current on current.id = submitted.id
    where current.section_id <> p_section_id
  ) then
    raise exception 'A grading period does not belong to this course';
  end if;

  if exists (
    select 1
    from public.grading_periods current
    where current.section_id = p_section_id
      and not exists (select 1 from tmp_grading_periods submitted where submitted.id = current.id)
  ) then
    raise exception 'Existing grading periods cannot be removed from this screen yet';
  end if;

  if exists (
    select 1
    from tmp_grading_periods submitted
    join public.grading_periods current on current.id = submitted.id
    where current.section_id = p_section_id
      and current.calculation_mode <> submitted.calculation_mode
  ) then
    raise exception 'Existing grading-period types cannot be changed';
  end if;

  if exists (
    select 1
    from tmp_grading_periods submitted
    join public.grading_periods current on current.id = submitted.id
    where current.section_id = p_section_id
      and current.code <> submitted.code
      and (
        exists (select 1 from public.assignments a where a.grading_period_id = current.id)
        or exists (
          select 1 from public.grading_period_components c
          where c.parent_period_id = current.id or c.component_period_id = current.id
        )
        or exists (select 1 from public.power_school_snapshots ps where ps.grading_period_id = current.id)
      )
  ) then
    raise exception 'A grading-period code is locked because the period already has assignments, composite links, or imported grade history';
  end if;

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

  if exists (select 1 from tmp_grading_period_components where weight <= 0) then
    raise exception 'Composite component weights must be greater than 0';
  end if;
  if exists (
    select 1
    from tmp_grading_period_components c
    left join tmp_grading_periods parent on parent.id = c.parent_period_id
    left join tmp_grading_periods component on component.id = c.component_period_id
    where parent.id is null or component.id is null
      or parent.calculation_mode <> 'composite'
      or component.calculation_mode <> 'direct'
      or parent.id = component.id
  ) then
    raise exception 'Composite periods may contain only direct periods from the same course';
  end if;
  if exists (
    select 1 from tmp_grading_periods p
    where p.calculation_mode = 'direct'
      and exists (select 1 from tmp_grading_period_components c where c.parent_period_id = p.id)
  ) then
    raise exception 'Direct grading periods cannot contain components';
  end if;
  if exists (
    select 1
    from tmp_grading_periods p
    where p.calculation_mode = 'composite'
      and not exists (select 1 from tmp_grading_period_components c where c.parent_period_id = p.id)
  ) then
    raise exception 'Every composite grading period needs at least one component';
  end if;
  if exists (
    select 1
    from tmp_grading_periods p
    where p.calculation_mode = 'composite'
      and abs((select coalesce(sum(c.weight),0) from tmp_grading_period_components c where c.parent_period_id = p.id) - 1) > 0.00005
  ) then
    raise exception 'Each composite grading period must total 100 percent';
  end if;

  insert into public.grading_periods(
    id, section_id, code, name, starts_on, ends_on, calculation_mode, sort_order, period_role
  )
  select p.id, p_section_id, p.code, p.name, null, null, p.calculation_mode, p.sort_order, p.period_role
  from tmp_grading_periods p
  on conflict (id) do update
  set code = excluded.code,
      name = excluded.name,
      sort_order = excluded.sort_order,
      period_role = excluded.period_role
  where public.grading_periods.section_id = p_section_id;

  delete from public.grading_period_components c
  using public.grading_periods p
  where c.parent_period_id = p.id
    and p.section_id = p_section_id;

  insert into public.grading_period_components(parent_period_id, component_period_id, weight, sort_order)
  select parent_period_id, component_period_id, weight, sort_order
  from tmp_grading_period_components;
end;
$$;

revoke all on function public.save_grading_period_settings(uuid,jsonb,jsonb) from public;
revoke all on function public.save_grading_period_settings(uuid,jsonb,jsonb) from anon;
grant execute on function public.save_grading_period_settings(uuid,jsonb,jsonb) to authenticated;
