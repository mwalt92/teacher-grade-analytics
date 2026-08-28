import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { StudentDashboardView } from "@/components/student-dashboard-view";
import { getSectionRoster } from "@/lib/data/roster";
import { getStudentDashboardData } from "@/lib/data/student-dashboard";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

type PreviewPageProps = { searchParams: Promise<{ studentId?: string; period?: string; sectionId?: string }> };

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

export default async function StudentPreviewPage({ searchParams }: PreviewPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile) redirect("/");
  if (profile.role !== "teacher" && profile.role !== "admin") redirect("/student");

  const [sections, activeSection, params] = await Promise.all([getTeacherSections(), getActiveTeacherSection(), searchParams]);
  const section = sections.find((item) => item.sectionId === params.sectionId) ?? activeSection;
  if (!section) redirect("/");

  const sectionSwitcher = <TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/student/preview"/>;
  const roster = await getSectionRoster(section.sectionId, "active");
  if (!roster.length) {
    return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Student preview</p><h1>{displayCourseName(section.courseName, section.courseCode)}</h1><p className="subtle">{section.sectionName} • {section.schoolYearLabel}</p>{sectionSwitcher}</div></header><TeacherPrimaryNav/><section className="content-wrap"><article className="panel"><h2>No active students are enrolled.</h2><p className="subtle">Switch to a course with an active roster, or add students to this section first.</p></article></section></main>;
  }

  const student = roster.find((item) => item.studentId === params.studentId) ?? roster[0];
  const data = await getStudentDashboardData(section.sectionId, student.studentId, params.period);
  if (!data) {
    return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Student preview</p><h1>{displayCourseName(section.courseName, section.courseCode)}</h1>{sectionSwitcher}</div></header><TeacherPrimaryNav/><section className="content-wrap"><article className="panel"><h2>No grading periods are ready yet.</h2></article></section></main>;
  }

  return <StudentDashboardView
    studentName={student.displayName}
    courseName={displayCourseName(section.courseName, section.courseCode)}
    sectionName={section.sectionName}
    schoolYear={section.schoolYearLabel}
    data={data}
    periodActionPath="/student/preview"
    hiddenFields={[{ name: "studentId", value: student.studentId }, { name: "sectionId", value: section.sectionId }]}
    preview
    previewLabel="Read-only teacher preview using the selected student's real grade data and the same canonical grading engine."
    previewStudents={roster.map((item) => ({ studentId: item.studentId, displayName: item.displayName }))}
    previewStudentId={student.studentId}
    previewActionPath="/student/preview"
    previewHeaderActions={sectionSwitcher}
  />;
}
