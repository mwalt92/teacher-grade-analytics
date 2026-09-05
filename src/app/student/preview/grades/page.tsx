import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentGradesView } from "@/components/student-grades-view";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionRoster } from "@/lib/data/roster";
import { getStudentDashboardData } from "@/lib/data/student-dashboard";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

type PreviewGradesPageProps = { searchParams: Promise<{ studentId?: string; period?: string; sectionId?: string; anchorSectionId?: string }> };

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

export default async function PreviewGradesPage({ searchParams }: PreviewGradesPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) redirect("/student");

  const [sections, activeSection, params] = await Promise.all([getTeacherSections(), getActiveTeacherSection(), searchParams]);
  const section = (params.sectionId ? sections.find((item) => item.sectionId === params.sectionId) : null) ?? activeSection;
  if (!section) redirect("/");
  const anchorSectionId = params.anchorSectionId ?? section.sectionId;
  const roster = await getSectionRoster(section.sectionId, "active");
  const student = roster.find((item) => item.studentId === params.studentId) ?? roster[0];
  if (!student) redirect("/student/preview");

  const data = await getStudentDashboardData(section.sectionId, student.studentId, params.period);
  if (!data) redirect(`/student/preview?studentId=${encodeURIComponent(student.studentId)}&sectionId=${encodeURIComponent(section.sectionId)}&anchorSectionId=${encodeURIComponent(anchorSectionId)}&view=course`);

  const navParams = new URLSearchParams({ studentId: student.studentId, sectionId: section.sectionId, anchorSectionId });
  const dashboardParams = new URLSearchParams(navParams);
  dashboardParams.set("period", data.periodCode);
  dashboardParams.set("view", "course");
  const gradesParams = new URLSearchParams(navParams);
  gradesParams.set("period", data.periodCode);
  const studyParams = new URLSearchParams({ studentId: student.studentId, sectionId: section.sectionId });
  const sectionSwitcher = <TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/student/preview/grades"/>;
  const studentProfileHref = `/students/${student.studentId}?sectionId=${encodeURIComponent(section.sectionId)}&period=${encodeURIComponent(data.periodCode)}`;

  return <StudentGradesView
    studentName={student.displayName}
    courseName={displayCourseName(section.courseName, section.courseCode)}
    sectionName={section.sectionName}
    schoolYear={section.schoolYearLabel}
    data={data}
    actionPath="/student/preview/grades"
    hiddenFields={[
      { name: "studentId", value: student.studentId },
      { name: "sectionId", value: section.sectionId },
      { name: "anchorSectionId", value: anchorSectionId },
    ]}
    selectedSectionId={section.sectionId}
    courseOptions={sections.map((item) => ({ sectionId: item.sectionId, label: `${displayCourseName(item.courseName, item.courseCode)} • ${item.sectionName}` }))}
    preview
    previewLabel="This is the complete period grade history the selected student will see."
    previewHeaderActions={sectionSwitcher}
    previewBannerActions={<Link className="secondary-link" href={studentProfileHref}>Student Profile</Link>}
    previewStudents={roster.map((item) => ({ studentId: item.studentId, displayName: item.displayName }))}
    previewStudentId={student.studentId}
    previewActionPath="/student/preview/grades"
    dashboardHref={`/student/preview?${dashboardParams.toString()}`}
    gradesHref={`/student/preview/grades?${gradesParams.toString()}`}
    studyLibraryHref={`/student/preview/study-library?${studyParams.toString()}`}
  />;
}