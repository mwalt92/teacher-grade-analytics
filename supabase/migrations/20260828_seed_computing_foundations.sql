-- Seed a second, structurally different course for multi-course testing.
-- This derives the current teacher and school year from the existing M215 section,
-- so no account-specific UUIDs are stored in source control.

do $$
declare
  v_school_year_id uuid;
  v_teacher_id uuid;
  v_course_id uuid;
  v_section_id uuid;
  v_participation_id uuid;
  v_assessments_id uuid;
  v_projects_id uuid;
begin
  select s.school_year_id, ts.teacher_id
    into v_school_year_id, v_teacher_id
  from public.courses c
  join public.sections s on s.course_id = c.id
  join public.teacher_sections ts on ts.section_id = s.id
  where c.code = 'M215'
  order by s.created_at
  limit 1;

  if v_school_year_id is null or v_teacher_id is null then
    raise exception 'M215 teacher/school-year context was not found';
  end if;

  select id into v_course_id
  from public.courses
  where name = 'Computing Foundations for a Digital Age'
  order by created_at
  limit 1;

  if v_course_id is null then
    insert into public.courses (name, code)
    values ('Computing Foundations for a Digital Age', null)
    returning id into v_course_id;
  end if;

  select id into v_section_id
  from public.sections
  where course_id = v_course_id
    and school_year_id = v_school_year_id
    and name = 'Section 1'
  order by created_at
  limit 1;

  if v_section_id is null then
    insert into public.sections (course_id, school_year_id, name, active)
    values (v_course_id, v_school_year_id, 'Section 1', true)
    returning id into v_section_id;
  end if;

  insert into public.teacher_sections (teacher_id, section_id)
  values (v_teacher_id, v_section_id)
  on conflict (teacher_id, section_id) do nothing;

  insert into public.grading_periods (section_id, code, name, calculation_mode, period_role, sort_order)
  values (v_section_id, 'S1', 'Semester 1', 'direct', 'standard', 10)
  on conflict (section_id, code) do update
    set name = excluded.name,
        calculation_mode = excluded.calculation_mode,
        period_role = excluded.period_role,
        sort_order = excluded.sort_order;

  insert into public.grading_categories (section_id, name, code, weight, drop_lowest, late_deduction, calculation_method, sort_order)
  values (v_section_id, 'Participation', 'participation', 0.40, 0, 0, 'total_points', 10)
  on conflict (section_id, name) do update
    set code = excluded.code,
        weight = excluded.weight,
        drop_lowest = excluded.drop_lowest,
        late_deduction = excluded.late_deduction,
        calculation_method = excluded.calculation_method,
        sort_order = excluded.sort_order
  returning id into v_participation_id;

  insert into public.grading_categories (section_id, name, code, weight, drop_lowest, late_deduction, calculation_method, sort_order)
  values (v_section_id, 'Assessments', 'assessment', 0.40, 0, 0, 'total_points', 20)
  on conflict (section_id, name) do update
    set code = excluded.code,
        weight = excluded.weight,
        drop_lowest = excluded.drop_lowest,
        late_deduction = excluded.late_deduction,
        calculation_method = excluded.calculation_method,
        sort_order = excluded.sort_order
  returning id into v_assessments_id;

  insert into public.grading_categories (section_id, name, code, weight, drop_lowest, late_deduction, calculation_method, sort_order)
  values (v_section_id, 'Projects', 'project', 0.20, 0, 0, 'total_points', 30)
  on conflict (section_id, name) do update
    set code = excluded.code,
        weight = excluded.weight,
        drop_lowest = excluded.drop_lowest,
        late_deduction = excluded.late_deduction,
        calculation_method = excluded.calculation_method,
        sort_order = excluded.sort_order
  returning id into v_projects_id;

  insert into public.assignment_types (section_id, code, name, description, default_category_id, default_points_possible, default_allow_retakes, active, sort_order)
  values
    (v_section_id, 'code_org_activity', 'Code.org Activity', 'Regular Code.org lesson activity.', v_participation_id, 10, false, true, 10),
    (v_section_id, 'code_org_written_response', 'Code.org Written Response', 'Written-response work reviewed against the course rubric.', v_assessments_id, 10, false, true, 20),
    (v_section_id, 'code_org_assessment', 'Code.org Assessment', 'Any Code.org item explicitly labeled as an assessment.', v_assessments_id, 10, false, true, 30),
    (v_section_id, 'unit_assessment', 'Unit Assessment', 'End-of-unit assessment.', v_assessments_id, 10, false, true, 40),
    (v_section_id, 'project', 'Project', 'Course project or larger applied task.', v_projects_id, 10, false, true, 50)
  on conflict (section_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        default_category_id = excluded.default_category_id,
        default_points_possible = excluded.default_points_possible,
        default_allow_retakes = excluded.default_allow_retakes,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = now();
end $$;
