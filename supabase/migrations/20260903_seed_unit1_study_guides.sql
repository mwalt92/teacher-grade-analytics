-- Seed the current 2026-27 ACP Calculus Unit 1 Mastery Checks as teacher-only draft study guides.
-- Current IXL URLs were verified on 2026-09-03. The newly added "Find limits using tables" skill does not yet have a stable public skill code in the published skill-plan PDFs, so its external_code is intentionally null.

do $$
declare
  v_course uuid := 'b1238f2a-ddd0-433b-b73b-31fc9affef48';
  v_offering uuid := 'e98c203a-6015-45f0-86db-8513e777640f';
  v_teacher uuid := '587b2f38-848d-47e0-ab28-5c71b908fd52';
  v_ixl uuid;

  s_avg uuid; s_inst uuid; s_graph uuid; s_one uuid; s_table uuid;
  s_laws uuid; s_algebra uuid; s_trig uuid; s_strategy uuid;

  r_p8z uuid; r_myz uuid; r_xzu uuid; r_bf5 uuid; r_l7q uuid; r_9ys uuid; r_table uuid;
  r_btg uuid; r_mkt uuid; r_pjd uuid; r_w8j uuid; r_9by uuid; r_gxb uuid; r_mfs uuid;

  v_assignment uuid;
  v_guide uuid;
begin
  select id into strict v_ixl from public.resource_providers where slug = 'ixl';

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.RATE.AVG', 'Average rate of change', 'Calculate and interpret average rate of change over an interval, including appropriate units.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_avg;

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.RATE.INST', 'Instantaneous rate of change', 'Estimate and interpret instantaneous rate of change and connect it to tangent-line slope.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_inst;

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.LIMIT.GRAPH', 'Evaluate limits from graphs', 'Read two-sided limit values from graphical behavior without confusing the limit with the function value.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_graph;

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.LIMIT.ONE_SIDED', 'One-sided limits and limit existence', 'Compare left- and right-hand behavior to evaluate one-sided limits and decide whether a two-sided limit exists.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_one;

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.LIMIT.TABLE', 'Estimate limits from tables', 'Use numerical values approaching a target from both sides to estimate a limit.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_table;

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.LIMIT.LAWS', 'Use algebraic limit laws', 'Apply sum, difference, product, quotient, power, root, and combined limit laws to evaluate limits.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_laws;

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.LIMIT.ALGEBRA', 'Algebraic manipulation of limits', 'Evaluate indeterminate limits using factoring, cancellation, rationalization, and related algebraic techniques.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_algebra;

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.LIMIT.TRIG', 'Trigonometric limits', 'Evaluate limits that involve trigonometric functions and special trigonometric limit relationships.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_trig;

  insert into public.study_skills(course_id, code, title, description, created_by)
  values (v_course, 'U1.LIMIT.STRATEGY', 'Select a limit-evaluation procedure', 'Recognize the form of a limit and choose an efficient procedure such as direct substitution, limit laws, factoring, rationalization, or a trigonometric limit.', v_teacher)
  on conflict (course_id, code) do update set title=excluded.title, description=excluded.description, active=true, updated_at=now()
  returning id into s_strategy;

  select id into r_p8z from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/average-rate-of-change' limit 1;
  if r_p8z is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Average rate of change I','Practice calculating average rate of change from functions and representations.','https://www.ixl.com/math/calculus/average-rate-of-change','P8Z','skill_practice',v_teacher) returning id into r_p8z; end if;
  select id into r_myz from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/average-rate-of-change-ii' limit 1;
  if r_myz is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Average rate of change II','Additional average-rate-of-change practice with more involved representations.','https://www.ixl.com/math/calculus/average-rate-of-change-ii','MYZ','skill_practice',v_teacher) returning id into r_myz; end if;
  select id into r_xzu from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-instantaneous-rates-of-change' limit 1;
  if r_xzu is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find instantaneous rates of change','Practice estimating and interpreting instantaneous rates of change.','https://www.ixl.com/math/calculus/find-instantaneous-rates-of-change','XZU','skill_practice',v_teacher) returning id into r_xzu; end if;

  select id into r_bf5 from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-using-graphs' limit 1;
  if r_bf5 is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits using graphs','Practice reading limit values from graphical behavior.','https://www.ixl.com/math/calculus/find-limits-using-graphs','BF5','skill_practice',v_teacher) returning id into r_bf5; end if;
  select id into r_l7q from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-one-sided-limits-using-graphs' limit 1;
  if r_l7q is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find one-sided limits using graphs','Practice left-hand and right-hand limits from graphs.','https://www.ixl.com/math/calculus/find-one-sided-limits-using-graphs','L7Q','skill_practice',v_teacher) returning id into r_l7q; end if;
  select id into r_9ys from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/determine-if-a-limit-exists' limit 1;
  if r_9ys is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Determine if a limit exists','Use left- and right-hand behavior to decide whether a limit exists.','https://www.ixl.com/math/calculus/determine-if-a-limit-exists','9YS','skill_practice',v_teacher) returning id into r_9ys; end if;
  select id into r_table from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-using-tables' limit 1;
  if r_table is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits using tables','New IXL Calculus skill for estimating limits numerically from tables.','https://www.ixl.com/math/calculus/find-limits-using-tables',null,'skill_practice',v_teacher) returning id into r_table; end if;

  select id into r_btg from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-using-addition-subtraction-and-multiplication-laws' limit 1;
  if r_btg is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits using addition, subtraction, and multiplication laws','Practice the basic algebraic limit laws for sums, differences, and products.','https://www.ixl.com/math/calculus/find-limits-using-addition-subtraction-and-multiplication-laws','BTG','skill_practice',v_teacher) returning id into r_btg; end if;
  select id into r_mkt from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-using-the-division-law' limit 1;
  if r_mkt is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits using the division law','Practice quotient limits when the denominator limit is nonzero.','https://www.ixl.com/math/calculus/find-limits-using-the-division-law','MKT','skill_practice',v_teacher) returning id into r_mkt; end if;
  select id into r_pjd from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-using-power-and-root-laws' limit 1;
  if r_pjd is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits using power and root laws','Practice power and root limit laws.','https://www.ixl.com/math/calculus/find-limits-using-power-and-root-laws','PJD','skill_practice',v_teacher) returning id into r_pjd; end if;
  select id into r_w8j from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-using-limit-laws' limit 1;
  if r_w8j is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits using limit laws','Mixed practice selecting and applying limit laws.','https://www.ixl.com/math/calculus/find-limits-using-limit-laws','W8J','skill_practice',v_teacher) returning id into r_w8j; end if;
  select id into r_9by from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-of-polynomials-and-rational-functions' limit 1;
  if r_9by is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits of polynomials and rational functions','Practice direct substitution and algebraic evaluation for polynomial and rational limits.','https://www.ixl.com/math/calculus/find-limits-of-polynomials-and-rational-functions','9BY','skill_practice',v_teacher) returning id into r_9by; end if;
  select id into r_gxb from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-involving-factorization-and-rationalization' limit 1;
  if r_gxb is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits involving factorization and rationalization','Practice algebraic simplification of indeterminate limits using factoring and rationalization.','https://www.ixl.com/math/calculus/find-limits-involving-factorization-and-rationalization','GXB','skill_practice',v_teacher) returning id into r_gxb; end if;
  select id into r_mfs from public.study_resources where provider_id=v_ixl and url='https://www.ixl.com/math/calculus/find-limits-involving-trigonometric-functions' limit 1;
  if r_mfs is null then insert into public.study_resources(provider_id,title,description,url,external_code,resource_type,created_by) values(v_ixl,'Find limits involving trigonometric functions','Practice evaluating limits involving trigonometric functions.','https://www.ixl.com/math/calculus/find-limits-involving-trigonometric-functions','MFS','skill_practice',v_teacher) returning id into r_mfs; end if;

  insert into public.study_resource_skills(resource_id,skill_id,alignment_kind) values
    (r_p8z,s_avg,'direct'),(r_myz,s_avg,'direct'),(r_xzu,s_inst,'direct'),
    (r_bf5,s_graph,'direct'),(r_l7q,s_one,'direct'),(r_9ys,s_one,'direct'),(r_table,s_table,'direct'),
    (r_btg,s_laws,'direct'),(r_mkt,s_laws,'direct'),(r_pjd,s_laws,'direct'),(r_w8j,s_laws,'direct'),
    (r_9by,s_algebra,'direct'),(r_gxb,s_algebra,'direct'),(r_mfs,s_trig,'direct'),
    (r_w8j,s_strategy,'supporting'),(r_9by,s_strategy,'supporting'),(r_gxb,s_strategy,'supporting'),(r_mfs,s_strategy,'supporting')
  on conflict (resource_id,skill_id) do update set alignment_kind=excluded.alignment_kind;

  -- MC 1.1
  select id,study_guide_id into strict v_assignment,v_guide from public.assignments where section_id in (select id from public.sections where offering_id=v_offering) and title='MC 1.1' and archived=false;
  if v_guide is null then
    insert into public.study_guides(offering_id,title,description,student_visible,created_by) values(v_offering,'MC 1.1 Study / Retake Preparation','Review average and instantaneous rates of change before your next Mastery Check attempt.',false,v_teacher) returning id into v_guide;
    update public.assignments set study_guide_id=v_guide where id=v_assignment;
  end if;
  insert into public.study_guide_skills(guide_id,skill_id,sort_order) values(v_guide,s_avg,10),(v_guide,s_inst,20) on conflict do nothing;
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_p8z,s_avg,10,'retake_preparation',true where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_p8z);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_myz,s_avg,20,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_myz);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_xzu,s_inst,30,'retake_preparation',true where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_xzu);

  -- MC 1.2
  v_guide := null;
  select id,study_guide_id into strict v_assignment,v_guide from public.assignments where section_id in (select id from public.sections where offering_id=v_offering) and title='MC 1.2' and archived=false;
  if v_guide is null then insert into public.study_guides(offering_id,title,description,student_visible,created_by) values(v_offering,'MC 1.2 Study / Retake Preparation','Review graphical, one-sided, and two-sided limits before your next attempt.',false,v_teacher) returning id into v_guide; update public.assignments set study_guide_id=v_guide where id=v_assignment; end if;
  insert into public.study_guide_skills(guide_id,skill_id,sort_order) values(v_guide,s_graph,10),(v_guide,s_one,20) on conflict do nothing;
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_bf5,s_graph,10,'retake_preparation',true where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_bf5);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_l7q,s_one,20,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_l7q);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_9ys,s_one,30,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_9ys);

  -- MC 1.3
  v_guide := null;
  select id,study_guide_id into strict v_assignment,v_guide from public.assignments where section_id in (select id from public.sections where offering_id=v_offering) and title='MC 1.3' and archived=false;
  if v_guide is null then insert into public.study_guides(offering_id,title,description,student_visible,created_by) values(v_offering,'MC 1.3 Study / Retake Preparation','Focus on reading limit behavior from graphs and distinguishing one-sided limits, two-sided limits, and function values.',false,v_teacher) returning id into v_guide; update public.assignments set study_guide_id=v_guide where id=v_assignment; end if;
  insert into public.study_guide_skills(guide_id,skill_id,sort_order) values(v_guide,s_graph,10),(v_guide,s_one,20) on conflict do nothing;
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_bf5,s_graph,10,'retake_preparation',true where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_bf5);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_l7q,s_one,20,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_l7q);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_9ys,s_one,30,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_9ys);

  -- MC 1.4 -- IXL added this exact skill in the current Calculus catalog.
  v_guide := null;
  select id,study_guide_id into strict v_assignment,v_guide from public.assignments where section_id in (select id from public.sections where offering_id=v_offering) and title='MC 1.4' and archived=false;
  if v_guide is null then insert into public.study_guides(offering_id,title,description,student_visible,created_by) values(v_offering,'MC 1.4 Study / Retake Preparation','Practice estimating limits numerically from table values approaching the target from both sides.',false,v_teacher) returning id into v_guide; update public.assignments set study_guide_id=v_guide where id=v_assignment; end if;
  insert into public.study_guide_skills(guide_id,skill_id,sort_order) values(v_guide,s_table,10) on conflict do nothing;
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured,teacher_note) select v_guide,r_table,s_table,10,'retake_preparation',true,'This is a newly added IXL Calculus skill.' where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_table);

  -- MC 1.5
  v_guide := null;
  select id,study_guide_id into strict v_assignment,v_guide from public.assignments where section_id in (select id from public.sections where offering_id=v_offering) and title='MC 1.5' and archived=false;
  if v_guide is null then insert into public.study_guides(offering_id,title,description,student_visible,created_by) values(v_offering,'MC 1.5 Study / Retake Preparation','Review the algebraic properties of limits and practice choosing the correct limit law.',false,v_teacher) returning id into v_guide; update public.assignments set study_guide_id=v_guide where id=v_assignment; end if;
  insert into public.study_guide_skills(guide_id,skill_id,sort_order) values(v_guide,s_laws,10) on conflict do nothing;
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_w8j,s_laws,10,'retake_preparation',true where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_w8j);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_btg,s_laws,20,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_btg);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_mkt,s_laws,30,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_mkt);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_pjd,s_laws,40,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_pjd);

  -- MC 1.6
  v_guide := null;
  select id,study_guide_id into strict v_assignment,v_guide from public.assignments where section_id in (select id from public.sections where offering_id=v_offering) and title='MC 1.6' and archived=false;
  if v_guide is null then insert into public.study_guides(offering_id,title,description,student_visible,created_by) values(v_offering,'MC 1.6 Study / Retake Preparation','Practice evaluating limits that require algebraic manipulation, including factoring, rationalization, and trigonometric techniques.',false,v_teacher) returning id into v_guide; update public.assignments set study_guide_id=v_guide where id=v_assignment; end if;
  insert into public.study_guide_skills(guide_id,skill_id,sort_order) values(v_guide,s_algebra,10),(v_guide,s_trig,20) on conflict do nothing;
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_gxb,s_algebra,10,'retake_preparation',true where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_gxb);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_9by,s_algebra,20,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_9by);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_mfs,s_trig,30,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_mfs);

  -- MC 1.7
  v_guide := null;
  select id,study_guide_id into strict v_assignment,v_guide from public.assignments where section_id in (select id from public.sections where offering_id=v_offering) and title='MC 1.7' and archived=false;
  if v_guide is null then insert into public.study_guides(offering_id,title,description,student_visible,created_by) values(v_offering,'MC 1.7 Study / Retake Preparation','Practice recognizing the form of a limit and selecting an efficient evaluation procedure.',false,v_teacher) returning id into v_guide; update public.assignments set study_guide_id=v_guide where id=v_assignment; end if;
  insert into public.study_guide_skills(guide_id,skill_id,sort_order) values(v_guide,s_strategy,10),(v_guide,s_laws,20),(v_guide,s_algebra,30),(v_guide,s_trig,40) on conflict do nothing;
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured,teacher_note) select v_guide,r_w8j,s_strategy,10,'retake_preparation',true,'Use this as mixed practice for choosing and applying limit laws.' where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_w8j);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_9by,s_strategy,20,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_9by);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_gxb,s_strategy,30,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_gxb);
  insert into public.study_guide_resources(guide_id,resource_id,skill_id,sort_order,availability_rule,featured) select v_guide,r_mfs,s_strategy,40,'retake_preparation',false where not exists(select 1 from public.study_guide_resources where guide_id=v_guide and resource_id=r_mfs);
end $$;
