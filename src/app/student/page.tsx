import { redirect } from "next/navigation";
import { StudentDashboardView } from "@/components/student-dashboard-view";
import { getCurrentStudentSections } from "@/lib/data/student-context";
import { getStudentDashboardData } from "@/lib/data/student-dashboard";
import { createClient } from "@/lib/supabase/server";

type StudentPageProps = { searchParams: Promise<{ period?: string; sectionId?: string }> };

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

export default async function StudentPage({ searchParams }: StudentPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role,display_name").eq("id", userId).maybeSingle();
  if (!profile) redirect("/");
  if (profile.role === "teacher" || profile.role === "admin") redirect("/student/preview");

  const [sections, params] = await Promise.all([getCurrentStudentSections(), searchParams]);
  if (!sections.length) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Student account setup</p><h1>Your school account is signed in</h1><p className="subtle">Your login has not been linked to a roster record yet. Once your school email is matched to your class roster, your grade dashboard will appear here.</p></article></main>;
  }

  const section = sections.find((item) => item.sectionId === params.sectionId) ?? sections[0];
  const data = await getStudentDashboardData(section.sectionId, section.studentId, params.period);
  if (!data) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Student progress</p><h1>No grading periods are ready yet</h1><p className="subtle">Your class is linked correctly, but there is not enough grading-period information to build the dashboard yet.</p></article></main>;
  }

  return <StudentDashboardView
    studentName={section.studentName}
    courseName={displayCourseName(section.courseName, section.courseCode)}
    sectionName={section.sectionName}
    schoolYear={section.schoolYearLabel}
    data={data}
    periodActionPath="/student"
    hiddenFields={sections.length > 1 ? [{ name: "sectionId", value: section.sectionId }] : []}
  />;
}
