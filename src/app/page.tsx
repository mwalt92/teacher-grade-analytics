import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", userId).maybeSingle();

  if (!profile) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Account setup</p><h1>Finishing your profile</h1><p className="subtle">Your Google account is authenticated, but the application profile has not been created yet. Refresh once and, if this persists, review the auth bootstrap configuration.</p></article></main>;
  }

  if (profile.role !== "teacher" && profile.role !== "admin") redirect("/student");

  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Teacher setup</p><h1>No section assigned yet</h1><p className="subtle">Your teacher account is ready. The next setup step is assigning a school year, course, section, and roster.</p></article></main>;
  }

  const [roster, { data: periods }] = await Promise.all([
    getSectionRoster(section.sectionId, "active"),
    supabase
      .from("grading_periods")
      .select("code,name,sort_order,period_role")
      .eq("section_id", section.sectionId)
      .neq("period_role", "exam")
      .order("sort_order")
      .order("code"),
  ]);

  return <DashboardShell
    courseName={displayCourseName(section.courseName, section.courseCode)}
    schoolYear={section.schoolYearLabel}
    sectionName={section.sectionName}
    studentCount={roster.length}
    dataMode="Live Supabase roster"
    sections={sections}
    activeSectionId={section.sectionId}
    gradingPeriods={(periods ?? []).map((period) => ({ code: period.code, name: period.name }))}
  />;
}
