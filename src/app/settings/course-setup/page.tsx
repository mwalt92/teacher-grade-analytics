import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
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

  const [sections, activeSection] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!activeSection) redirect("/");

  const uniqueOfferings = Array.from(new Map(sections.map((section) => [section.offeringId, section])).values());
  const sources = await Promise.all(uniqueOfferings.map(async (section) => {
    const [{ count: categoryCount }, { count: assignmentTypeCount }, { count: gradingPeriodCount }] = await Promise.all([
      supabase.from("grading_categories").select("id", { count: "exact", head: true }).eq("offering_id", section.offeringId),
      supabase.from("assignment_types").select("id", { count: "exact", head: true }).eq("offering_id", section.offeringId),
      supabase.from("grading_periods").select("id", { count: "exact", head: true }).eq("offering_id", section.offeringId),
    ]);
    return {
      offeringId: section.offeringId,
      label: displayName(section.courseName, section.courseCode),
      schoolYearLabel: section.schoolYearLabel,
      categoryCount: categoryCount ?? 0,
      assignmentTypeCount: assignmentTypeCount ?? 0,
      gradingPeriodCount: gradingPeriodCount ?? 0,
    };
  }));

  return <main className="app-shell">
    <header className="topbar"><div>
      <p className="eyebrow">Teacher Grade Analytics</p>
      <h1>Create Course</h1>
      <p className="subtle">{activeSection.schoolYearLabel} • start blank or reuse an existing course configuration</p>
      <TeacherSectionSwitcher sections={sections} activeSectionId={activeSection.sectionId} returnTo="/settings/course-setup"/>
    </div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <div className="section-heading">
        <div><p className="eyebrow">Course setup</p><h2>Create once, then add class periods</h2><p className="subtle">The first section is created with the course. Additional sections share its course configuration while keeping separate rosters, assignments, and grades.</p></div>
        <Link className="secondary-link" href="/settings?area=course-sections">Back to Settings</Link>
      </div>
      <CourseSetupForm schoolYearId={activeSection.schoolYearId} schoolYearLabel={activeSection.schoolYearLabel} sources={sources}/>
    </section>
  </main>;
}
