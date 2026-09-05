import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TeacherContextBar } from "@/components/teacher-context-bar";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { ACTIVE_TEACHER_SECTION_COOKIE, getTeacherSections } from "@/lib/data/teacher-context";
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

  const sections = await getTeacherSections();
  const cookieStore = await cookies();
  const rememberedSectionId = cookieStore.get(ACTIVE_TEACHER_SECTION_COOKIE)?.value;
  const activeSection = rememberedSectionId
    ? sections.find((section) => section.sectionId === rememberedSectionId) ?? null
    : null;
  const { data: latestSchoolYear, error: schoolYearError } = activeSection
    ? { data: { id: activeSection.schoolYearId, label: activeSection.schoolYearLabel }, error: null }
    : await supabase.from("school_years").select("id,label").order("label", { ascending: false }).limit(1).maybeSingle();
  if (schoolYearError) throw schoolYearError;

  if (!latestSchoolYear) {
    return <main className="app-shell">
      <header className="topbar"><div><p className="eyebrow">Teacher Grade Analytics</p><h1>Create Course</h1><p className="subtle">A school year must be configured before courses can be created.</p></div></header>
      <TeacherPrimaryNav rootOnly/>
      <section className="content-wrap"><article className="panel"><h2>No school year is available</h2><p className="subtle">Create or activate the school year first, then return here to build the first course workspace.</p><Link className="secondary-link" href="/">Back to Courses</Link></article></section>
    </main>;
  }

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
      <p className="subtle">{latestSchoolYear.label} • start blank or reuse an existing course configuration</p>
    </div></header>
    <TeacherPrimaryNav rootOnly={!activeSection}/>
    {activeSection ? <TeacherContextBar sections={sections} activeSectionId={activeSection.sectionId} returnTo="/settings/course-setup"/> : null}
    <section className="content-wrap">
      <div className="section-heading">
        <div><p className="eyebrow">Course setup</p><h2>Create once, then add class periods</h2><p className="subtle">The first section is created with the course. Additional sections share its course configuration while keeping separate rosters, assignments, and grades.</p></div>
        <Link className="secondary-link" href={activeSection ? "/settings?area=course-sections" : "/"}>{activeSection ? "Back to Settings" : "Back to Courses"}</Link>
      </div>
      <CourseSetupForm schoolYearId={latestSchoolYear.id} schoolYearLabel={latestSchoolYear.label} sources={sources}/>
    </section>
  </main>;
}