import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getTeacherDashboardData } from "@/lib/data/dashboard";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

type HomePageProps = { searchParams: Promise<{ period?: string }> };

export default async function HomePage({ searchParams }: HomePageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", userId).maybeSingle();

  if (!profile) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Account setup</p><h1>Finishing your profile</h1><p className="subtle">Your Google account is authenticated, but the application profile has not been created yet. Refresh once and, if this persists, review the auth bootstrap configuration.</p></article></main>;
  }

  if (profile.role !== "teacher" && profile.role !== "admin") redirect("/student");

  const [sections, section, params] = await Promise.all([getTeacherSections(), getActiveTeacherSection(), searchParams]);
  if (!section) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Teacher setup</p><h1>No section assigned yet</h1><p className="subtle">Your teacher account is ready. The next setup step is assigning a school year, course, section, and roster.</p></article></main>;
  }

  const dashboard = await getTeacherDashboardData(section.sectionId, params.period);

  return <DashboardShell
    courseName={displayCourseName(section.courseName, section.courseCode)}
    schoolYear={section.schoolYearLabel}
    sectionName={section.sectionName}
    sections={sections}
    activeSectionId={section.sectionId}
    dashboard={dashboard}
  />;
}
