import { redirect } from "next/navigation";
import { AIGraderDemo } from "@/components/ai-grader-demo";
import { TeacherContextBar } from "@/components/teacher-context-bar";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

export default async function AIGradingPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") redirect("/login");

  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) redirect("/");

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>AI Grader</h1>
        <p className="subtle">Safe demonstration workspace for Code.org import, rubric diagnostics, teacher review, and pilot analytics.</p>
      </div>
    </header>
    <TeacherPrimaryNav/>
    <TeacherContextBar sections={sections} activeSectionId={section.sectionId} returnTo="/ai-grading"/>
    <AIGraderDemo courseName={displayCourseName(section.courseName, section.courseCode)} sectionName={section.sectionName} schoolYear={section.schoolYearLabel}/>
  </main>;
}
