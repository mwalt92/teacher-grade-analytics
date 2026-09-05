import { redirect } from "next/navigation";
import { StudentSimulatorView } from "@/components/student-simulator-view";
import { getCurrentStudentSections, type StudentSectionSummary } from "@/lib/data/student-context";
import { getStudentDashboardData } from "@/lib/data/student-dashboard";
import { createClient } from "@/lib/supabase/server";

type StudentSimulatorPageProps = { searchParams: Promise<{ period?: string; sectionId?: string }> };

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

function uniqueOfferings(sections: StudentSectionSummary[]) {
  const byOffering = new Map<string, StudentSectionSummary>();
  for (const section of sections) if (!byOffering.has(section.offeringId)) byOffering.set(section.offeringId, section);
  return [...byOffering.values()];
}

export default async function StudentSimulatorPage({ searchParams }: StudentSimulatorPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile) redirect("/");
  if (profile.role === "teacher" || profile.role === "admin") redirect("/student/preview/simulator");

  const [sections, params] = await Promise.all([getCurrentStudentSections(), searchParams]);
  if (!sections.length) redirect("/student");
  const courseSections = uniqueOfferings(sections);
  const section = (params.sectionId ? courseSections.find((item) => item.sectionId === params.sectionId) : null) ?? courseSections[0];
  if (!section) redirect("/student");

  const data = await getStudentDashboardData(section.sectionId, section.studentId, params.period);
  if (!data) redirect(`/student?sectionId=${encodeURIComponent(section.sectionId)}`);

  const periodQuery = `sectionId=${encodeURIComponent(section.sectionId)}&period=${encodeURIComponent(data.periodCode)}`;
  return <StudentSimulatorView
    studentName={section.studentName}
    courseName={displayCourseName(section.courseName, section.courseCode)}
    sectionName={section.sectionName}
    schoolYear={section.schoolYearLabel}
    data={data}
    actionPath="/student/simulator"
    selectedSectionId={section.sectionId}
    courseOptions={courseSections.map((item) => ({ sectionId: item.sectionId, label: displayCourseName(item.courseName, item.courseCode) }))}
    dashboardHref={`/student?${periodQuery}`}
    gradesHref={`/student/grades?${periodQuery}`}
    simulatorHref={`/student/simulator?${periodQuery}`}
    studyLibraryHref={`/student/study-library?sectionId=${encodeURIComponent(section.sectionId)}`}
  />;
}
