import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getTeacherCourseLifecycleOfferings } from "@/lib/data/course-lifecycle";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { CourseSetupForm } from "./course-setup-form";

function displayName(name: string, code: string | null) {
  if (!code || name.toLowerCase().includes(code.toLowerCase())) return name;
  return `${name} ${code}`;
}

export default async function CourseSetupPage() {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const [sections, activeSection, lifecycleOfferings] = await Promise.all([
    getTeacherSections(),
    getActiveTeacherSection(),
    getTeacherCourseLifecycleOfferings(),
  ]);

  let schoolYearId = activeSection?.schoolYearId ?? null;
  let schoolYearLabel = activeSection?.schoolYearLabel ?? null;
  if (!schoolYearId || !schoolYearLabel) {
    const { data: schoolYears } = await supabase
      .from("school_years")
      .select("id,label,starts_on")
      .eq("archived", false)
      .order("starts_on", { ascending: false })
      .limit(1);
    schoolYearId = schoolYears?.[0]?.id ?? lifecycleOfferings[0]?.schoolYearId ?? null;
    schoolYearLabel = schoolYears?.[0]?.label ?? lifecycleOfferings[0]?.schoolYearLabel ?? null;
  }
  if (!schoolYearId || !schoolYearLabel) redirect("/settings/courses?error=No+available+school+year+was+found+for+course+creation.");

  const sourceOfferings = lifecycleOfferings.filter((offering) => offering.active);
  const sources = await Promise.all(sourceOfferings.map(async (offering) => {
    const [{ count: categoryCount }, { count: assignmentTypeCount }, { count: gradingPeriodCount }] = await Promise.all([
      supabase.from("grading_categories").select("id", { count: "exact", head: true }).eq("offering_id", offering.offeringId),
      supabase.from("assignment_types").select("id", { count: "exact", head: true }).eq("offering_id", offering.offeringId),
      supabase.from("grading_periods").select("id", { count: "exact", head: true }).eq("offering_id", offering.offeringId),
    ]);
    return {
      offeringId: offering.offeringId,
      label: displayName(offering.courseName, offering.courseCode),
      schoolYearLabel: offering.schoolYearLabel,
      categoryCount: categoryCount ?? 0,
      assignmentTypeCount: assignmentTypeCount ?? 0,
      gradingPeriodCount: gradingPeriodCount ?? 0,
    };
  }));

  return <main className="app-shell">
    <header className="topbar"><div>
      <p className="eyebrow">Teacher Grade Analytics</p>
      <h1>Create Course</h1>
      <p className="subtle">{schoolYearLabel} • start blank or reuse an existing active course configuration</p>
      {activeSection ? <TeacherSectionSwitcher sections={sections} activeSectionId={activeSection.sectionId} returnTo="/settings/course-setup"/> : null}
    </div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <div className="section-heading">
        <div><p className="eyebrow">Course setup</p><h2>Create once, then add class periods</h2><p className="subtle">The first section is created with the course. Additional sections share its course configuration while keeping separate rosters, assignments, and grades.</p></div>
        <Link className="secondary-link" href={activeSection ? "/settings?area=course-sections" : "/settings/courses"}>{activeSection ? "Back to Settings" : "Back to Course Library"}</Link>
      </div>
      <CourseSetupForm schoolYearId={schoolYearId} schoolYearLabel={schoolYearLabel} sources={sources}/>
    </section>
  </main>;
}
