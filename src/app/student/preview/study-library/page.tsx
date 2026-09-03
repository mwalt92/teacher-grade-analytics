import { redirect } from "next/navigation";
import { StudentStudyLibraryView, type StudentStudyGuideCard } from "@/components/student-study-library-view";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

type PreviewStudyLibraryPageProps = { searchParams: Promise<{ studentId?: string; sectionId?: string }> };

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

export default async function PreviewStudyLibraryPage({ searchParams }: PreviewStudyLibraryPageProps) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (claimsError || typeof profileId !== "string") redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) redirect("/student");

  const [sections, activeSection, params] = await Promise.all([getTeacherSections(), getActiveTeacherSection(), searchParams]);
  const section = (params.sectionId ? sections.find((item) => item.sectionId === params.sectionId) : null) ?? activeSection;
  if (!section) redirect("/");
  const roster = await getSectionRoster(section.sectionId, "active");
  const student = roster.find((item) => item.studentId === params.studentId) ?? roster[0];
  if (!student) redirect("/study-library");

  const { data: assignmentsData } = await supabase
    .from("assignments")
    .select("id,title,assignment_date,allow_retakes,study_guide_id")
    .eq("section_id", section.sectionId)
    .eq("archived", false)
    .not("study_guide_id", "is", null)
    .order("assignment_date", { ascending: false });
  const assignments = assignmentsData ?? [];
  const guideIds = [...new Set(assignments.flatMap((assignment) => assignment.study_guide_id ? [assignment.study_guide_id] : []))];
  const assignmentIds = assignments.map((assignment) => assignment.id);

  const [{ data: guidesData }, { data: skillRows }, { data: resourceRows }, { data: gradeRecords }] = await Promise.all([
    guideIds.length ? supabase.from("study_guides").select("id,title,description,student_visible").in("id", guideIds) : Promise.resolve({ data: [] as { id: string; title: string; description: string | null; student_visible: boolean }[] }),
    guideIds.length ? supabase.from("study_guide_skills").select("guide_id,skill_id").in("guide_id", guideIds) : Promise.resolve({ data: [] as { guide_id: string; skill_id: string }[] }),
    guideIds.length ? supabase.from("study_guide_resources").select("guide_id,featured,availability_rule").in("guide_id", guideIds) : Promise.resolve({ data: [] as { guide_id: string; featured: boolean; availability_rule: string }[] }),
    assignmentIds.length ? supabase.from("grade_records").select("id,assignment_id").eq("student_id", student.studentId).in("assignment_id", assignmentIds) : Promise.resolve({ data: [] as { id: string; assignment_id: string }[] }),
  ]);
  const guides = guidesData ?? [];
  const guideById = new Map(guides.map((guide) => [guide.id, guide]));
  const recordByAssignment = new Map((gradeRecords ?? []).map((record) => [record.assignment_id, record]));
  const gradeRecordIds = (gradeRecords ?? []).map((record) => record.id);
  const { data: attemptsData } = gradeRecordIds.length
    ? await supabase.from("grade_attempts").select("grade_record_id,attempt_number").in("grade_record_id", gradeRecordIds)
    : { data: [] as { grade_record_id: string; attempt_number: number }[] };
  const attemptCountByRecord = new Map<string, number>();
  for (const attempt of attemptsData ?? []) attemptCountByRecord.set(attempt.grade_record_id, (attemptCountByRecord.get(attempt.grade_record_id) ?? 0) + 1);

  const skillCountByGuide = new Map<string, number>();
  for (const row of skillRows ?? []) skillCountByGuide.set(row.guide_id, (skillCountByGuide.get(row.guide_id) ?? 0) + 1);

  const cards: StudentStudyGuideCard[] = assignments.flatMap((assignment) => {
    if (!assignment.study_guide_id) return [];
    const guide = guideById.get(assignment.study_guide_id);
    if (!guide) return [];
    const record = recordByAssignment.get(assignment.id);
    const attemptCount = record ? attemptCountByRecord.get(record.id) ?? 0 : 0;
    const hasAttempt = attemptCount > 0;
    const releasedRows = (resourceRows ?? []).filter((row) => {
      if (row.guide_id !== guide.id) return false;
      if (row.availability_rule === "teacher_only") return false;
      if (row.availability_rule === "always") return true;
      if (row.availability_rule === "after_first_attempt") return hasAttempt;
      if (row.availability_rule === "retake_preparation") return assignment.allow_retakes && hasAttempt;
      return false;
    });
    const recommendedCount = releasedRows.filter((row) => row.featured).length;
    const status: StudentStudyGuideCard["status"] = attemptCount === 0
      ? "Not attempted"
      : assignment.allow_retakes
        ? "Retake available"
        : recommendedCount > 0
          ? "Recommended practice"
          : "Completed";
    const previewParams = new URLSearchParams({ studentId: student.studentId, anchorSectionId: section.sectionId });
    return [{
      assignmentId: assignment.id,
      title: assignment.title,
      date: assignment.assignment_date,
      guideTitle: guide.title,
      description: guide.description,
      skillCount: skillCountByGuide.get(guide.id) ?? 0,
      resourceCount: releasedRows.length,
      recommendedCount,
      attemptCount,
      status,
      href: `/student/preview/assignments/${assignment.id}?${previewParams.toString()}`,
      draft: !guide.student_visible,
    }];
  });

  return <StudentStudyLibraryView
    studentName={student.displayName}
    courseName={displayCourseName(section.courseName, section.courseCode)}
    sectionName={section.sectionName}
    schoolYear={section.schoolYearLabel}
    guides={cards}
    selectedSectionId={section.sectionId}
    courseActionPath="/student/preview/study-library"
    preview
    previewLabel="This shows the student's Study Library using the selected student's attempts and the same release rules. Draft guides are included here only so you can review them before publishing."
    previewHeaderActions={<TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/student/preview/study-library"/>}
    previewStudents={roster.map((item) => ({ studentId: item.studentId, displayName: item.displayName }))}
    previewStudentId={student.studentId}
    previewActionPath="/student/preview/study-library"
    previewCarryFields={[{ name: "sectionId", value: section.sectionId }]}
  />;
}
