import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { StudentCoursesView } from "@/components/student-courses-view";
import { StudentDashboardView } from "@/components/student-dashboard-view";
import { getSectionRoster } from "@/lib/data/roster";
import { getStudentDashboardData } from "@/lib/data/student-dashboard";
import { getActiveTeacherSection, getTeacherSections, type TeacherSectionSummary } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

type PreviewPageProps = { searchParams: Promise<{ studentId?: string; period?: string; sectionId?: string; anchorSectionId?: string; view?: string }> };

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

function uniqueOfferings(sections: TeacherSectionSummary[]) {
  const byOffering = new Map<string, TeacherSectionSummary>();
  for (const section of sections) {
    if (!byOffering.has(section.offeringId)) byOffering.set(section.offeringId, section);
  }
  return [...byOffering.values()];
}

function myCoursesHref(studentId: string, anchorSectionId: string) {
  const params = new URLSearchParams({ studentId, anchorSectionId, view: "courses" });
  return `/student/preview?${params.toString()}`;
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
  const anchorSection = sections.find((item) => item.sectionId === params.anchorSectionId) ?? activeSection;
  if (!anchorSection) redirect("/");

  const anchorSwitcher = <TeacherSectionSwitcher sections={sections} activeSectionId={anchorSection.sectionId} returnTo="/student/preview"/>;
  const anchorRoster = await getSectionRoster(anchorSection.sectionId, "active");
  if (!anchorRoster.length) {
    return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Student preview</p><h1>{displayCourseName(anchorSection.courseName, anchorSection.courseCode)}</h1><p className="subtle">{anchorSection.sectionName} • {anchorSection.schoolYearLabel}</p>{anchorSwitcher}</div></header><TeacherPrimaryNav/><section className="content-wrap"><article className="panel"><h2>No active students are enrolled.</h2><p className="subtle">Switch to a course with an active roster, or add students to this section first.</p></article></section></main>;
  }

  const student = anchorRoster.find((item) => item.studentId === params.studentId) ?? anchorRoster[0];
  const teacherSectionIds = sections.map((item) => item.sectionId);
  const { data: activeEnrollments, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("section_id")
    .eq("student_id", student.studentId)
    .eq("active", true)
    .in("section_id", teacherSectionIds);

  const enrolledSectionIds = new Set((activeEnrollments ?? []).map((item) => item.section_id));
  const studentSections = enrollmentError ? [anchorSection] : sections.filter((item) => enrolledSectionIds.has(item.sectionId));
  const courseSections = uniqueOfferings(studentSections.length ? studentSections : [anchorSection]);
  const hasMultipleCourses = courseSections.length > 1;

  if (hasMultipleCourses && params.view !== "course") {
    const courses = await Promise.all(courseSections.map(async (item) => ({
      sectionId: item.sectionId,
      courseName: displayCourseName(item.courseName, item.courseCode),
      sectionName: item.sectionName,
      schoolYear: item.schoolYearLabel,
      data: await getStudentDashboardData(item.sectionId, student.studentId),
    })));

    return <StudentCoursesView
      studentName={student.displayName}
      courses={courses}
      actionPath="/student/preview"
      openCourseFields={[
        { name: "studentId", value: student.studentId },
        { name: "anchorSectionId", value: anchorSection.sectionId },
        { name: "view", value: "course" },
      ]}
      preview
      previewLabel="Read-only teacher preview of the same My Courses landing page a multi-course student will see."
      previewStudents={anchorRoster.map((item) => ({ studentId: item.studentId, displayName: item.displayName }))}
      previewStudentId={student.studentId}
      previewActionPath="/student/preview"
      previewCarryFields={[
        { name: "anchorSectionId", value: anchorSection.sectionId },
        { name: "view", value: "courses" },
      ]}
      previewHeaderActions={anchorSwitcher}
    />;
  }

  const section = (params.sectionId ? studentSections.find((item) => item.sectionId === params.sectionId) : null) ?? courseSections[0] ?? anchorSection;
  const sectionSwitcher = <TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/student/preview"/>;
  const roster = section.sectionId === anchorSection.sectionId ? anchorRoster : await getSectionRoster(section.sectionId, "active");
  const sectionStudent = roster.find((item) => item.studentId === student.studentId) ?? student;
  const data = await getStudentDashboardData(section.sectionId, sectionStudent.studentId, params.period);
  if (!data) {
    return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Student preview</p><h1>{displayCourseName(section.courseName, section.courseCode)}</h1>{sectionSwitcher}</div></header><TeacherPrimaryNav/><section className="content-wrap"><article className="panel"><h2>No grading periods are ready yet.</h2>{hasMultipleCourses ? <Link className="secondary-link" href={myCoursesHref(student.studentId, anchorSection.sectionId)}>My Courses</Link> : null}</article></section></main>;
  }

  const headerActions = <>
    {sectionSwitcher}
    {hasMultipleCourses ? <Link className="secondary-link" href={myCoursesHref(student.studentId, anchorSection.sectionId)}>My Courses</Link> : null}
  </>;

  return <StudentDashboardView
    studentName={sectionStudent.displayName}
    courseName={displayCourseName(section.courseName, section.courseCode)}
    sectionName={section.sectionName}
    schoolYear={section.schoolYearLabel}
    data={data}
    periodActionPath="/student/preview"
    hiddenFields={[
      { name: "studentId", value: sectionStudent.studentId },
      { name: "sectionId", value: section.sectionId },
      { name: "anchorSectionId", value: anchorSection.sectionId },
      { name: "view", value: "course" },
    ]}
    preview
    previewLabel="Read-only teacher preview using the selected student's real grade data and the same canonical grading engine."
    previewStudents={roster.map((item) => ({ studentId: item.studentId, displayName: item.displayName }))}
    previewStudentId={sectionStudent.studentId}
    previewActionPath="/student/preview"
    previewHeaderActions={headerActions}
  />;
}
