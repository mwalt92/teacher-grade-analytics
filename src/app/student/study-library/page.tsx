import { redirect } from "next/navigation";
import { StudentStudyLibraryView, type StudentStudyGuideCard } from "@/components/student-study-library-view";
import { getCurrentStudentSections, type StudentSectionSummary } from "@/lib/data/student-context";
import { bestAttemptPercent, selectSuggestedStudyGuide, type StudyRecommendationCandidate } from "@/lib/study/recommendations";
import { createClient } from "@/lib/supabase/server";

type StudentStudyLibraryPageProps = { searchParams: Promise<{ sectionId?: string }> };

type StudyCardCandidate = StudentStudyGuideCard & StudyRecommendationCandidate;

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

function uniqueOfferings(sections: StudentSectionSummary[]) {
  const byOffering = new Map<string, StudentSectionSummary>();
  for (const section of sections) if (!byOffering.has(section.offeringId)) byOffering.set(section.offeringId, section);
  return [...byOffering.values()];
}

export default async function StudentStudyLibraryPage({ searchParams }: StudentStudyLibraryPageProps) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (claimsError || typeof profileId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!profile) redirect("/");
  if (profile.role === "teacher" || profile.role === "admin") redirect("/student/preview/study-library");

  const [sections, params] = await Promise.all([getCurrentStudentSections(), searchParams]);
  if (!sections.length) redirect("/student");
  const courseSections = uniqueOfferings(sections);
  const section = (params.sectionId ? courseSections.find((item) => item.sectionId === params.sectionId) : null) ?? courseSections[0];
  if (!section) redirect("/student");

  const { data: assignmentsData } = await supabase
    .from("assignments")
    .select("id,title,assignment_date,points_possible,allow_retakes,study_guide_id")
    .eq("section_id", section.sectionId)
    .eq("archived", false)
    .not("study_guide_id", "is", null)
    .order("assignment_date", { ascending: false });
  const assignments = assignmentsData ?? [];
  const guideIds = [...new Set(assignments.flatMap((assignment) => assignment.study_guide_id ? [assignment.study_guide_id] : []))];

  const { data: guidesData } = guideIds.length
    ? await supabase.from("study_guides").select("id,title,description,student_visible").in("id", guideIds)
    : { data: [] as { id: string; title: string; description: string | null; student_visible: boolean }[] };
  const guides = guidesData ?? [];
  const visibleGuideIds = new Set(guides.map((guide) => guide.id));
  const visibleAssignments = assignments.filter((assignment) => assignment.study_guide_id && visibleGuideIds.has(assignment.study_guide_id));
  const assignmentIds = visibleAssignments.map((assignment) => assignment.id);

  const [{ data: skillRows }, { data: resourceRows }, { data: gradeRecords }] = await Promise.all([
    guideIds.length ? supabase.from("study_guide_skills").select("guide_id,skill_id").in("guide_id", guideIds) : Promise.resolve({ data: [] as { guide_id: string; skill_id: string }[] }),
    guideIds.length ? supabase.from("study_guide_resources").select("guide_id,featured").in("guide_id", guideIds) : Promise.resolve({ data: [] as { guide_id: string; featured: boolean }[] }),
    assignmentIds.length ? supabase.from("grade_records").select("id,assignment_id,missing,exempt").eq("student_id", section.studentId).in("assignment_id", assignmentIds) : Promise.resolve({ data: [] as { id: string; assignment_id: string; missing: boolean; exempt: boolean }[] }),
  ]);

  const gradeRecordIds = (gradeRecords ?? []).map((record) => record.id);
  const { data: attemptsData } = gradeRecordIds.length
    ? await supabase.from("grade_attempts").select("grade_record_id,attempt_number,points_earned").in("grade_record_id", gradeRecordIds)
    : { data: [] as { grade_record_id: string; attempt_number: number; points_earned: number | string }[] };

  const guideById = new Map(guides.map((guide) => [guide.id, guide]));
  const recordByAssignment = new Map((gradeRecords ?? []).map((record) => [record.assignment_id, record]));
  const attemptsByRecord = new Map<string, Array<number | string>>();
  for (const attempt of attemptsData ?? []) {
    const existing = attemptsByRecord.get(attempt.grade_record_id) ?? [];
    existing.push(attempt.points_earned);
    attemptsByRecord.set(attempt.grade_record_id, existing);
  }
  const skillCountByGuide = new Map<string, number>();
  for (const row of skillRows ?? []) skillCountByGuide.set(row.guide_id, (skillCountByGuide.get(row.guide_id) ?? 0) + 1);
  const resourceCountByGuide = new Map<string, number>();
  const recommendedCountByGuide = new Map<string, number>();
  for (const row of resourceRows ?? []) {
    resourceCountByGuide.set(row.guide_id, (resourceCountByGuide.get(row.guide_id) ?? 0) + 1);
    if (row.featured) recommendedCountByGuide.set(row.guide_id, (recommendedCountByGuide.get(row.guide_id) ?? 0) + 1);
  }

  const candidates: StudyCardCandidate[] = visibleAssignments.flatMap((assignment) => {
    if (!assignment.study_guide_id) return [];
    const guide = guideById.get(assignment.study_guide_id);
    if (!guide) return [];
    const record = recordByAssignment.get(assignment.id);
    const attempts = record ? attemptsByRecord.get(record.id) ?? [] : [];
    const attemptCount = attempts.length;
    const bestPercent = bestAttemptPercent(Number(assignment.points_possible), attempts);
    const recommendedCount = recommendedCountByGuide.get(guide.id) ?? 0;
    const resourceCount = resourceCountByGuide.get(guide.id) ?? 0;
    const status: StudentStudyGuideCard["status"] = attemptCount === 0
      ? "Not attempted"
      : assignment.allow_retakes
        ? "Retake available"
        : recommendedCount > 0
          ? "Recommended practice"
          : "Completed";
    return [{
      assignmentId: assignment.id,
      title: assignment.title,
      date: assignment.assignment_date,
      guideTitle: guide.title,
      description: guide.description,
      skillCount: skillCountByGuide.get(guide.id) ?? 0,
      resourceCount,
      recommendedCount,
      attemptCount,
      bestPercent,
      status,
      href: `/student/assignments/${assignment.id}`,
      allowRetakes: assignment.allow_retakes,
      missing: record?.missing ?? false,
      exempt: record?.exempt ?? false,
      visibleToStudent: true,
    }];
  });

  const suggested = selectSuggestedStudyGuide(candidates);
  const cards: StudentStudyGuideCard[] = candidates.map(({ allowRetakes: _allowRetakes, missing: _missing, exempt: _exempt, visibleToStudent: _visibleToStudent, ...card }) => ({
    ...card,
    suggested: card.assignmentId === suggested?.assignmentId,
  }));

  return <StudentStudyLibraryView
    studentName={section.studentName}
    courseName={displayCourseName(section.courseName, section.courseCode)}
    sectionName={section.sectionName}
    schoolYear={section.schoolYearLabel}
    guides={cards}
    courseOptions={courseSections.map((item) => ({ sectionId: item.sectionId, label: displayCourseName(item.courseName, item.courseCode) }))}
    selectedSectionId={section.sectionId}
    courseActionPath="/student/study-library"
  />;
}