import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") redirect("/login");

  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) redirect("/");
  const courseName = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Teacher Grade Analytics</p><h1>Analytics</h1><p className="subtle">{courseName} • {section.sectionName}</p><TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/analytics"/></div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <article className="panel">
        <p className="eyebrow">Analytics workspace</p>
        <h2>Course analytics will live here.</h2>
        <p className="subtle">This destination is now part of the permanent teacher navigation. The deeper analytics workspace will be migrated to live course-specific data in a later phase rather than showing misleading demo values here.</p>
      </article>
    </section>
  </main>;
}
