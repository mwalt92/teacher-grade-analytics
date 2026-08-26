import { redirect } from "next/navigation";
import { StudentDashboardView } from "@/components/student-dashboard-view";
import { getSectionRoster } from "@/lib/data/roster";
import { getStudentDashboardData } from "@/lib/data/student-dashboard";
import { getTeacherSections } from "@/lib/data/teacher-context";
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

  const [sections, params] = await Promise.all([getTeacherSections(), searchParams]);
  const section = sections.find((item) => item.sectionId === params.sectionId) ?? sections[0];
  if (!section) redirect("/");

  const roster = await getSectionRoster(section.sectionId, "active");
  if (!roster.length) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Student preview</p><h1>No active students are enrolled.</h1></article></main>;
  }

  const student = roster.find((item) => item.studentId === params.studentId) ?? roster[0];
  const data = await getStudentDashboardData(section.sectionId, student.studentId, params.period);
  if (!data) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Student preview</p><h1>No grading periods are ready yet.</h1></article></main>;
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
  />;
}
