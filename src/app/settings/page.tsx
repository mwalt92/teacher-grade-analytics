import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") redirect("/login");

  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) redirect("/");
  const courseName = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Teacher Grade Analytics</p><h1>Settings</h1><p className="subtle">{courseName} • {section.sectionName}</p><TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/settings"/></div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <article className="panel">
        <p className="eyebrow">Course settings</p>
        <h2>Course-level configuration will live here.</h2>
        <p className="subtle">The permanent navigation is ready now. Future configurable grading rules and the course-level assignment-type hotlist will be surfaced here as those management tools are built.</p>
      </article>
    </section>
  </main>;
}
