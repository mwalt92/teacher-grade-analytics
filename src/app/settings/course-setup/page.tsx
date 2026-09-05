import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getTeacherCourseLifecycleOfferings } from "@/lib/data/course-lifecycle";
import { getTeacherCourseTemplates } from "@/lib/data/course-templates";
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

  const [sections, activeSection, lifecycleOfferings, templates, schoolYearResult] = await Promise.all([
    getTeacherSections(),
    getActiveTeacherSection(),
    getTeacherCourseLifecycleOfferings(),
    getTeacherCourseTemplates(),
    supabase.from("school_years").select("id,label,starts_on,archived").order("starts_on", { ascending: false }),
  ]);

  const schoolYearsFromDb = (schoolYearResult.data ?? []).map((year) => ({
    id: year.id,
    label: year.label,
    archived: Boolean(year.archived),
  }));
  const fallbackSchoolYears = Array.from(new Map(lifecycleOfferings.map((offering) => [offering.schoolYearId, {
    id: offering.schoolYearId,
    label: offering.schoolYearLabel,
    archived: false,
  }])).values());
  const schoolYears = schoolYearsFromDb.length ? schoolYearsFromDb : fallbackSchoolYears;

  const defaultSchoolYear = schoolYears.find((year) => year.id === activeSection?.schoolYearId)
    ?? schoolYears.find((year) => !year.archived)
    ?? schoolYears[0]
    ?? null;
  if (!defaultSchoolYear) redirect("/settings/courses?error=No+available+school+year+was+found+for+course+creation.");

  const sources = await Promise.all(lifecycleOfferings.map(async (offering) => {
    const [{ count: categoryCount }, { count: assignmentTypeCount }, { count: gradingPeriodCount }] = await Promise.all([
      supabase.from("grading_categories").select("id", { count: "exact", head: true }).eq("offering_id", offering.offeringId),
      supabase.from("assignment_types").select("id", { count: "exact", head: true }).eq("offering_id", offering.offeringId),
      supabase.from("grading_periods").select("id", { count: "exact", head: true }).eq("offering_id", offering.offeringId),
    ]);
    return {
      offeringId: offering.offeringId,
      label: displayName(offering.courseName, offering.courseCode),
      schoolYearLabel: offering.schoolYearLabel,
      active: offering.active,
      categoryCount: categoryCount ?? 0,
      assignmentTypeCount: assignmentTypeCount ?? 0,
      gradingPeriodCount: gradingPeriodCount ?? 0,
    };
  }));

  return <main className="app-shell">
    <header className="topbar"><div>
      <p className="eyebrow">Teacher Grade Analytics</p>
      <h1>Create Course</h1>
      <p className="subtle">Choose the school year, then start blank, from a reusable template, or from an active or historical course configuration.</p>
      {activeSection ? <TeacherSectionSwitcher sections={sections} activeSectionId={activeSection.sectionId} returnTo="/settings/course-setup"/> : null}
    </div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <div className="section-heading">
        <div><p className="eyebrow">Course setup</p><h2>Create once, then add class periods</h2><p className="subtle">The first section is created with the course. Additional sections share its course configuration while keeping separate rosters, assignments, and grades.</p></div>
        <Link className="secondary-link" href={activeSection ? "/settings?area=course-sections" : "/settings/courses"}>{activeSection ? "Back to Settings" : "Back to Course Library"}</Link>
      </div>
      <CourseSetupForm defaultSchoolYearId={defaultSchoolYear.id} schoolYears={schoolYears} sources={sources} templates={templates}/>
    </section>
  </main>;
}
