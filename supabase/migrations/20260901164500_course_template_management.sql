create or replace function public.list_teacher_course_templates()
returns table (
  id uuid,
  name text,
  description text,
  default_course_name text,
  default_course_code text,
  category_count integer,
  assignment_type_count integer,
  grading_period_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = 'public', 'pg_temp'
as $$
  select
    ct.id,
    ct.name,
    ct.description,
    ct.default_course_name,
    ct.default_course_code,
    jsonb_array_length(coalesce(ct.config -> 'categories', '[]'::jsonb))::integer,
    jsonb_array_length(coalesce(ct.config -> 'assignmentTypes', '[]'::jsonb))::integer,
    jsonb_array_length(coalesce(ct.config -> 'gradingPeriods', '[]'::jsonb))::integer,
    ct.created_at,
    ct.updated_at
  from public.course_templates ct
  where ct.teacher_id = auth.uid()
  order by ct.updated_at desc, ct.name;
$$;

revoke all on function public.list_teacher_course_templates() from public;
revoke all on function public.list_teacher_course_templates() from anon;
grant execute on function public.list_teacher_course_templates() to authenticated;

create or replace function public.delete_teacher_course_template(p_template_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
begin
  delete from public.course_templates
  where id = p_template_id
    and teacher_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.delete_teacher_course_template(uuid) from public;
revoke all on function public.delete_teacher_course_template(uuid) from anon;
grant execute on function public.delete_teacher_course_template(uuid) to authenticated;
