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

function setupCopy(status: string | null, email: string) {
  if (status === "google_required") return "This login is not a Google identity. Sign out and use your school-managed Google account to access student grade data.";
  if (status === "already_claimed") return "That roster record is already connected to another login. Ask your teacher to review the account link before trying again.";
  if (status === "no_email") return "Google did not provide an email address for this login. Sign in with your school-managed Google account or ask your teacher for help.";
  if (status === "link_failed") return "Your account matched the roster, but the link could not be completed. Ask your teacher to review the account setup.";
  return `You are signed in as ${email}. Your teacher needs to place this exact school Google email on your roster record before your grade dashboard can open.`;
}

export default async function StudentPage({ searchParams }: StudentPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role,display_name,email").eq("id", userId).maybeSingle();
  if (!profile) redirect("/");
  if (profile.role === "teacher" || profile.role === "admin") redirect("/student/preview");

  const { data: linkStatus, error: linkError } = await supabase.rpc("link_current_student_account_by_email");
  const [sections, params] = await Promise.all([getCurrentStudentSections(), searchParams]);
  if (!sections.length) {
    const message = linkError
      ? "Your school account is authenticated, but the roster link could not be checked right now. Ask your teacher to review your login setup."
      : setupCopy(linkStatus, profile.email);
    return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Student Grade Analytics</p><h1>Account setup</h1><p className="subtle">Signed in as {profile.display_name}</p></div></header><section className="content-wrap"><article className="panel" style={{ maxWidth: 720, margin: "0 auto" }}><p className="eyebrow">School Google account</p><h2>Your grade dashboard is waiting for a roster match</h2><p className="subtle" style={{ lineHeight: 1.6 }}>{message}</p><div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "var(--brand-soft)", color: "var(--brand-dark)" }}><strong>What happens next?</strong><p style={{ marginTop: 6, lineHeight: 1.5 }}>Once the email on your roster matches this Google account, simply return to this page. The site will retry the secure link automatically; you do not need a code or password from your teacher.</p></div><a className="primary-button" href="/student" style={{ marginTop: 18 }}>Try roster match again</a></article></section></main>;
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
