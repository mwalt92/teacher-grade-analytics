alter table public.grading_periods
  add column if not exists period_role text not null default 'standard';

alter table public.grading_periods
  drop constraint if exists grading_periods_period_role_check;
alter table public.grading_periods
  add constraint grading_periods_period_role_check
  check (period_role in ('standard','exam'));

update public.grading_periods
set period_role = case when code in ('E1','E2') then 'exam' else 'standard' end;
