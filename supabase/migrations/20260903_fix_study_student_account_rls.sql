-- Student roster records are distinct from auth profiles. Resolve the signed-in profile through student_accounts before checking enrollment or attempts.

create or replace function private.can_student_view_study_guide(target_guide uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.student_accounts sa
    join public.enrollments e on e.student_id = sa.student_id and e.active = true
    join public.assignments a on a.section_id = e.section_id and a.archived = false
    join public.study_guides sg on sg.id = a.study_guide_id
    where sa.profile_id = (select auth.uid())
      and sg.id = target_guide
      and sg.student_visible = true
  );
$$;

create or replace function private.can_student_view_study_guide_resource(target_item uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.student_accounts sa
    join public.enrollments e on e.student_id = sa.student_id and e.active = true
    join public.assignments a on a.section_id = e.section_id and a.archived = false
    join public.study_guides sg on sg.id = a.study_guide_id
    join public.study_guide_resources sgr on sgr.guide_id = sg.id
    where sa.profile_id = (select auth.uid())
      and sgr.id = target_item
      and sg.student_visible = true
      and (
        sgr.availability_rule = 'always'
        or (
          sgr.availability_rule in ('after_first_attempt','retake_preparation')
          and (sgr.availability_rule <> 'retake_preparation' or a.allow_retakes = true)
          and exists (
            select 1
            from public.grade_records gr
            join public.grade_attempts ga on ga.grade_record_id = gr.id
            where gr.assignment_id = a.id
              and gr.student_id = sa.student_id
          )
        )
      )
  );
$$;

revoke all on function private.can_student_view_study_guide(uuid) from public;
revoke all on function private.can_student_view_study_guide_resource(uuid) from public;
grant execute on function private.can_student_view_study_guide(uuid), private.can_student_view_study_guide_resource(uuid) to authenticated;
