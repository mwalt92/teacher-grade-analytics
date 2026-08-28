alter table public.grading_categories
  add column if not exists code text,
  add column if not exists calculation_method text not null default 'equal_assignment_percentage',
  add column if not exists sort_order integer not null default 0;

update public.grading_categories
set code = case lower(trim(name))
  when 'participation' then 'participation'
  when 'quiz' then 'quiz'
  when 'quizzes' then 'quiz'
  when 'test' then 'test'
  when 'tests' then 'test'
  when 'assessment' then 'assessment'
  when 'assessments' then 'assessment'
  when 'project' then 'project'
  when 'projects' then 'project'
  else lower(regexp_replace(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'))
end
where code is null or btrim(code) = '';

update public.grading_categories
set sort_order = case code
  when 'participation' then 10
  when 'quiz' then 20
  when 'test' then 30
  else sort_order
end
where sort_order = 0;

alter table public.grading_categories
  alter column code set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'grading_categories_calculation_method_check'
      and conrelid = 'public.grading_categories'::regclass
  ) then
    alter table public.grading_categories
      add constraint grading_categories_calculation_method_check
      check (calculation_method in ('equal_assignment_percentage', 'total_points'));
  end if;
end $$;

create unique index if not exists grading_categories_section_code_uidx
  on public.grading_categories (section_id, code);

create index if not exists grading_categories_section_sort_idx
  on public.grading_categories (section_id, sort_order, name);