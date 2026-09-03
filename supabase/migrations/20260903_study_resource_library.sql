-- Provider-neutral study / retake preparation library.
-- Study guides are course-offering specific so each school year can activate a different curriculum subset.
-- Skills remain course-level so they can be reused across offerings and future assessment analytics.

create table public.resource_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.study_skills (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  code text,
  title text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id, code)
);

create table public.study_resources (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.resource_providers(id) on delete restrict,
  title text not null,
  description text,
  url text,
  external_code text,
  resource_type text not null default 'reference' check (resource_type in ('skill_practice','notes','practice','solutions','worksheet','video','reference','other')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_resource_skills (
  resource_id uuid not null references public.study_resources(id) on delete cascade,
  skill_id uuid not null references public.study_skills(id) on delete cascade,
  alignment_kind text not null default 'direct' check (alignment_kind in ('direct','supporting','prerequisite')),
  teacher_note text,
  created_at timestamptz not null default now(),
  primary key (resource_id, skill_id)
);

create table public.study_guides (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  title text not null,
  description text,
  student_visible boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_guide_skills (
  guide_id uuid not null references public.study_guides(id) on delete cascade,
  skill_id uuid not null references public.study_skills(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (guide_id, skill_id)
);

create table public.study_guide_resources (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.study_guides(id) on delete cascade,
  resource_id uuid not null references public.study_resources(id) on delete cascade,
  skill_id uuid references public.study_skills(id) on delete set null,
  sort_order integer not null default 0,
  teacher_note text,
  availability_rule text not null default 'always' check (availability_rule in ('always','after_first_attempt','retake_preparation','teacher_only')),
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.assignments
  add column study_guide_id uuid references public.study_guides(id) on delete set null;

create index study_skills_course_idx on public.study_skills(course_id, active);
create index study_resources_provider_idx on public.study_resources(provider_id, active);
create index study_resource_skills_skill_idx on public.study_resource_skills(skill_id);
create index study_guides_offering_idx on public.study_guides(offering_id, student_visible);
create index study_guide_skills_skill_idx on public.study_guide_skills(skill_id);
create index study_guide_resources_guide_order_idx on public.study_guide_resources(guide_id, sort_order);
create index study_guide_resources_resource_idx on public.study_guide_resources(resource_id);
create index assignments_study_guide_idx on public.assignments(study_guide_id) where study_guide_id is not null;

alter table public.resource_providers enable row level security;
alter table public.study_skills enable row level security;
alter table public.study_resources enable row level security;
alter table public.study_resource_skills enable row level security;
alter table public.study_guides enable row level security;
alter table public.study_guide_skills enable row level security;
alter table public.study_guide_resources enable row level security;

revoke all on table public.resource_providers from anon, authenticated;
revoke all on table public.study_skills from anon, authenticated;
revoke all on table public.study_resources from anon, authenticated;
revoke all on table public.study_resource_skills from anon, authenticated;
revoke all on table public.study_guides from anon, authenticated;
revoke all on table public.study_guide_skills from anon, authenticated;
revoke all on table public.study_guide_resources from anon, authenticated;

grant select on table public.resource_providers to authenticated;
grant select, insert, update, delete on table public.study_skills to authenticated;
grant select, insert, update, delete on table public.study_resources to authenticated;
grant select, insert, update, delete on table public.study_resource_skills to authenticated;
grant select, insert, update, delete on table public.study_guides to authenticated;
grant select, insert, update, delete on table public.study_guide_skills to authenticated;
grant select, insert, update, delete on table public.study_guide_resources to authenticated;

create or replace function private.is_teacher_for_offering(target_offering uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.sections s
    join public.teacher_sections ts on ts.section_id = s.id
    where s.offering_id = target_offering
      and ts.teacher_id = (select auth.uid())
  );
$$;

create or replace function private.is_teacher_for_course(target_course uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.sections s
    join public.teacher_sections ts on ts.section_id = s.id
    where s.course_id = target_course
      and ts.teacher_id = (select auth.uid())
  );
$$;

create or replace function private.is_any_teacher()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.teacher_sections ts
    where ts.teacher_id = (select auth.uid())
  );
$$;

create or replace function private.can_student_view_study_guide(target_guide uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.study_guides sg
    join public.assignments a on a.study_guide_id = sg.id and a.archived = false
    join public.enrollments e on e.section_id = a.section_id
    where sg.id = target_guide
      and sg.student_visible = true
      and e.student_id = (select auth.uid())
      and e.active = true
  );
$$;

create or replace function private.can_student_view_study_guide_resource(target_item uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.study_guide_resources sgr
    join public.study_guides sg on sg.id = sgr.guide_id
    join public.assignments a on a.study_guide_id = sg.id and a.archived = false
    join public.enrollments e on e.section_id = a.section_id
    where sgr.id = target_item
      and sg.student_visible = true
      and e.student_id = (select auth.uid())
      and e.active = true
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
              and gr.student_id = (select auth.uid())
          )
        )
      )
  );
$$;

revoke all on function private.is_teacher_for_offering(uuid) from public;
revoke all on function private.is_teacher_for_course(uuid) from public;
revoke all on function private.is_any_teacher() from public;
revoke all on function private.can_student_view_study_guide(uuid) from public;
revoke all on function private.can_student_view_study_guide_resource(uuid) from public;
grant execute on function private.is_teacher_for_offering(uuid), private.is_teacher_for_course(uuid), private.is_any_teacher(), private.can_student_view_study_guide(uuid), private.can_student_view_study_guide_resource(uuid) to authenticated;

create policy resource_providers_authenticated_select on public.resource_providers
for select to authenticated using (true);

create policy study_skills_select on public.study_skills
for select to authenticated using (
  (select private.is_teacher_for_course(course_id))
  or exists (
    select 1 from public.study_guide_skills sgs
    where sgs.skill_id = study_skills.id
      and (select private.can_student_view_study_guide(sgs.guide_id))
  )
);
create policy study_skills_teacher_insert on public.study_skills
for insert to authenticated with check (
  created_by = (select auth.uid()) and (select private.is_teacher_for_course(course_id))
);
create policy study_skills_teacher_update on public.study_skills
for update to authenticated using ((select private.is_teacher_for_course(course_id)))
with check ((select private.is_teacher_for_course(course_id)));
create policy study_skills_teacher_delete on public.study_skills
for delete to authenticated using ((select private.is_teacher_for_course(course_id)));

create policy study_resources_select on public.study_resources
for select to authenticated using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.study_resource_skills srs
    join public.study_skills ss on ss.id = srs.skill_id
    where srs.resource_id = study_resources.id
      and (select private.is_teacher_for_course(ss.course_id))
  )
  or exists (
    select 1 from public.study_guide_resources sgr
    where sgr.resource_id = study_resources.id
      and (select private.can_student_view_study_guide_resource(sgr.id))
  )
  or exists (
    select 1 from public.study_guide_resources sgr
    join public.study_guides sg on sg.id = sgr.guide_id
    where sgr.resource_id = study_resources.id
      and (select private.is_teacher_for_offering(sg.offering_id))
  )
);
create policy study_resources_teacher_insert on public.study_resources
for insert to authenticated with check (
  created_by = (select auth.uid()) and (select private.is_any_teacher())
);
create policy study_resources_teacher_update on public.study_resources
for update to authenticated using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));
create policy study_resources_teacher_delete on public.study_resources
for delete to authenticated using (created_by = (select auth.uid()));

create policy study_resource_skills_select on public.study_resource_skills
for select to authenticated using (
  exists (
    select 1 from public.study_skills ss
    where ss.id = study_resource_skills.skill_id
      and (select private.is_teacher_for_course(ss.course_id))
  )
  or exists (
    select 1 from public.study_guide_resources sgr
    where sgr.resource_id = study_resource_skills.resource_id
      and sgr.skill_id = study_resource_skills.skill_id
      and (select private.can_student_view_study_guide_resource(sgr.id))
  )
);
create policy study_resource_skills_teacher_insert on public.study_resource_skills
for insert to authenticated with check (
  exists (
    select 1 from public.study_skills ss
    where ss.id = study_resource_skills.skill_id
      and (select private.is_teacher_for_course(ss.course_id))
  )
);
create policy study_resource_skills_teacher_update on public.study_resource_skills
for update to authenticated using (
  exists (
    select 1 from public.study_skills ss
    where ss.id = study_resource_skills.skill_id
      and (select private.is_teacher_for_course(ss.course_id))
  )
) with check (
  exists (
    select 1 from public.study_skills ss
    where ss.id = study_resource_skills.skill_id
      and (select private.is_teacher_for_course(ss.course_id))
  )
);
create policy study_resource_skills_teacher_delete on public.study_resource_skills
for delete to authenticated using (
  exists (
    select 1 from public.study_skills ss
    where ss.id = study_resource_skills.skill_id
      and (select private.is_teacher_for_course(ss.course_id))
  )
);

create policy study_guides_select on public.study_guides
for select to authenticated using (
  (select private.is_teacher_for_offering(offering_id))
  or (select private.can_student_view_study_guide(id))
);
create policy study_guides_teacher_insert on public.study_guides
for insert to authenticated with check (
  created_by = (select auth.uid()) and (select private.is_teacher_for_offering(offering_id))
);
create policy study_guides_teacher_update on public.study_guides
for update to authenticated using ((select private.is_teacher_for_offering(offering_id)))
with check ((select private.is_teacher_for_offering(offering_id)));
create policy study_guides_teacher_delete on public.study_guides
for delete to authenticated using ((select private.is_teacher_for_offering(offering_id)));

create policy study_guide_skills_select on public.study_guide_skills
for select to authenticated using (
  exists (
    select 1 from public.study_guides sg
    where sg.id = study_guide_skills.guide_id
      and ((select private.is_teacher_for_offering(sg.offering_id)) or (select private.can_student_view_study_guide(sg.id)))
  )
);
create policy study_guide_skills_teacher_insert on public.study_guide_skills
for insert to authenticated with check (
  exists (
    select 1
    from public.study_guides sg
    join public.course_offerings co on co.id = sg.offering_id
    join public.study_skills ss on ss.id = study_guide_skills.skill_id and ss.course_id = co.course_id
    where sg.id = study_guide_skills.guide_id
      and (select private.is_teacher_for_offering(sg.offering_id))
  )
);
create policy study_guide_skills_teacher_update on public.study_guide_skills
for update to authenticated using (
  exists (select 1 from public.study_guides sg where sg.id = study_guide_skills.guide_id and (select private.is_teacher_for_offering(sg.offering_id)))
) with check (
  exists (
    select 1
    from public.study_guides sg
    join public.course_offerings co on co.id = sg.offering_id
    join public.study_skills ss on ss.id = study_guide_skills.skill_id and ss.course_id = co.course_id
    where sg.id = study_guide_skills.guide_id
      and (select private.is_teacher_for_offering(sg.offering_id))
  )
);
create policy study_guide_skills_teacher_delete on public.study_guide_skills
for delete to authenticated using (
  exists (select 1 from public.study_guides sg where sg.id = study_guide_skills.guide_id and (select private.is_teacher_for_offering(sg.offering_id)))
);

create policy study_guide_resources_select on public.study_guide_resources
for select to authenticated using (
  exists (
    select 1 from public.study_guides sg
    where sg.id = study_guide_resources.guide_id
      and (select private.is_teacher_for_offering(sg.offering_id))
  )
  or (select private.can_student_view_study_guide_resource(id))
);
create policy study_guide_resources_teacher_insert on public.study_guide_resources
for insert to authenticated with check (
  exists (
    select 1
    from public.study_guides sg
    join public.course_offerings co on co.id = sg.offering_id
    where sg.id = study_guide_resources.guide_id
      and (select private.is_teacher_for_offering(sg.offering_id))
      and (
        study_guide_resources.skill_id is null
        or exists (select 1 from public.study_skills ss where ss.id = study_guide_resources.skill_id and ss.course_id = co.course_id)
      )
  )
);
create policy study_guide_resources_teacher_update on public.study_guide_resources
for update to authenticated using (
  exists (select 1 from public.study_guides sg where sg.id = study_guide_resources.guide_id and (select private.is_teacher_for_offering(sg.offering_id)))
) with check (
  exists (
    select 1
    from public.study_guides sg
    join public.course_offerings co on co.id = sg.offering_id
    where sg.id = study_guide_resources.guide_id
      and (select private.is_teacher_for_offering(sg.offering_id))
      and (
        study_guide_resources.skill_id is null
        or exists (select 1 from public.study_skills ss where ss.id = study_guide_resources.skill_id and ss.course_id = co.course_id)
      )
  )
);
create policy study_guide_resources_teacher_delete on public.study_guide_resources
for delete to authenticated using (
  exists (select 1 from public.study_guides sg where sg.id = study_guide_resources.guide_id and (select private.is_teacher_for_offering(sg.offering_id)))
);

insert into public.resource_providers(slug, name)
values
  ('ixl', 'IXL'),
  ('teacher-materials', 'Teacher Materials'),
  ('khan-academy', 'Khan Academy'),
  ('youtube', 'YouTube')
on conflict (slug) do nothing;
