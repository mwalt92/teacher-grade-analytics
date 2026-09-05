-- AI-assisted grading foundation.
-- This migration stores imports, rubric versions, AI recommendations, diagnostics,
-- usage telemetry, and teacher decisions separately from official grade records.
-- Nothing in this schema automatically creates or changes an official grade.

create table if not exists public.ai_grading_settings (
  section_id uuid primary key references public.sections(id) on delete cascade,
  enabled boolean not null default false,
  live_student_data_approved boolean not null default false,
  provider text not null default 'disabled',
  monthly_budget_usd numeric(10,4) not null default 0 check (monthly_budget_usd >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_rubric_versions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  rubric_key text not null,
  title text not null,
  version integer not null check (version >= 1),
  source_label text,
  rubric_json jsonb not null,
  score_map_json jsonb not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(section_id, rubric_key, version)
);

create table if not exists public.external_submissions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  student_id uuid references public.profiles(id) on delete restrict,
  source_platform text not null,
  source_submission_key text,
  source_lesson text,
  source_item text,
  question_text text not null,
  response_text text,
  submission_state text not null default 'submitted' check (submission_state in ('submitted','missing')),
  imported_by uuid references public.profiles(id) on delete set null,
  imported_at timestamptz not null default now()
);

create unique index if not exists external_submissions_source_key_idx
  on public.external_submissions(section_id, source_platform, source_submission_key)
  where source_submission_key is not null;
create index if not exists external_submissions_assignment_idx on public.external_submissions(assignment_id);
create index if not exists external_submissions_student_idx on public.external_submissions(student_id);

create table if not exists public.ai_grading_runs (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  rubric_version_id uuid not null references public.ai_rubric_versions(id) on delete restrict,
  mode text not null default 'demo' check (mode in ('demo','live')),
  provider text not null,
  model text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  escalated boolean not null default false,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_grading_runs_section_time_idx on public.ai_grading_runs(section_id, created_at desc);
create index if not exists ai_grading_runs_assignment_idx on public.ai_grading_runs(assignment_id);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  grading_run_id uuid not null references public.ai_grading_runs(id) on delete cascade,
  external_submission_id uuid not null references public.external_submissions(id) on delete cascade,
  proposed_proficiency numeric(8,4) not null check (proposed_proficiency >= 0),
  proficiency_possible numeric(8,4) not null check (proficiency_possible > 0),
  proposed_points numeric(12,4) not null check (proposed_points >= 0),
  points_possible numeric(12,4) not null check (points_possible > 0),
  confidence numeric(6,5) not null check (confidence between 0 and 1),
  confidence_band text not null check (confidence_band in ('high','medium','review')),
  review_required boolean not null default false,
  suggested_feedback text,
  rationale_summary text,
  concept_tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(grading_run_id, external_submission_id)
);
create index if not exists ai_recommendations_submission_idx on public.ai_recommendations(external_submission_id);

create table if not exists public.ai_question_diagnostics (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.ai_recommendations(id) on delete cascade,
  criterion_key text not null,
  label text not null,
  earned numeric(8,4) not null check (earned >= 0),
  possible numeric(8,4) not null check (possible > 0),
  confidence numeric(6,5) not null check (confidence between 0 and 1),
  evidence_summary text,
  unique(recommendation_id, criterion_key)
);

create table if not exists public.ai_teacher_decisions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null unique references public.ai_recommendations(id) on delete cascade,
  grade_record_id uuid references public.grade_records(id) on delete set null,
  decision text not null check (decision in ('approved','edited','rejected','missing','exempt')),
  final_points numeric(12,4) check (final_points is null or final_points >= 0),
  final_feedback text,
  teacher_note text,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);
create index if not exists ai_teacher_decisions_reviewer_idx on public.ai_teacher_decisions(reviewed_by, reviewed_at desc);

alter table public.ai_grading_settings enable row level security;
alter table public.ai_rubric_versions enable row level security;
alter table public.external_submissions enable row level security;
alter table public.ai_grading_runs enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.ai_question_diagnostics enable row level security;
alter table public.ai_teacher_decisions enable row level security;

grant select, insert, update, delete on public.ai_grading_settings to authenticated;
grant select, insert, update, delete on public.ai_rubric_versions to authenticated;
grant select, insert, update, delete on public.external_submissions to authenticated;
grant select, insert, update, delete on public.ai_grading_runs to authenticated;
grant select, insert, update, delete on public.ai_recommendations to authenticated;
grant select, insert, update, delete on public.ai_question_diagnostics to authenticated;
grant select, insert, update, delete on public.ai_teacher_decisions to authenticated;

create policy ai_grading_settings_teacher_all on public.ai_grading_settings
  for all to authenticated
  using ((select private.is_teacher_for_section(section_id)))
  with check ((select private.is_teacher_for_section(section_id)));

create policy ai_rubric_versions_teacher_all on public.ai_rubric_versions
  for all to authenticated
  using ((select private.is_teacher_for_section(section_id)))
  with check ((select private.is_teacher_for_section(section_id)));

create policy external_submissions_teacher_all on public.external_submissions
  for all to authenticated
  using ((select private.is_teacher_for_section(section_id)))
  with check ((select private.is_teacher_for_section(section_id)));

create policy ai_grading_runs_teacher_all on public.ai_grading_runs
  for all to authenticated
  using ((select private.is_teacher_for_section(section_id)))
  with check ((select private.is_teacher_for_section(section_id)));

create policy ai_recommendations_teacher_all on public.ai_recommendations
  for all to authenticated
  using (exists (
    select 1 from public.external_submissions es
    where es.id = external_submission_id and (select private.is_teacher_for_section(es.section_id))
  ))
  with check (exists (
    select 1 from public.external_submissions es
    where es.id = external_submission_id and (select private.is_teacher_for_section(es.section_id))
  ));

create policy ai_question_diagnostics_teacher_all on public.ai_question_diagnostics
  for all to authenticated
  using (exists (
    select 1 from public.ai_recommendations ar
    join public.external_submissions es on es.id = ar.external_submission_id
    where ar.id = recommendation_id and (select private.is_teacher_for_section(es.section_id))
  ))
  with check (exists (
    select 1 from public.ai_recommendations ar
    join public.external_submissions es on es.id = ar.external_submission_id
    where ar.id = recommendation_id and (select private.is_teacher_for_section(es.section_id))
  ));

create policy ai_teacher_decisions_teacher_all on public.ai_teacher_decisions
  for all to authenticated
  using (exists (
    select 1 from public.ai_recommendations ar
    join public.external_submissions es on es.id = ar.external_submission_id
    where ar.id = recommendation_id and (select private.is_teacher_for_section(es.section_id))
  ))
  with check (
    reviewed_by = (select auth.uid()) and exists (
      select 1 from public.ai_recommendations ar
      join public.external_submissions es on es.id = ar.external_submission_id
      where ar.id = recommendation_id and (select private.is_teacher_for_section(es.section_id))
    )
  );
