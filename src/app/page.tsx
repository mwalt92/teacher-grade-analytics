import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string") {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return (
      <main className="content-wrap">
        <article className="panel">
          <p className="eyebrow">Account setup</p>
          <h1>Finishing your profile</h1>
          <p className="subtle">Your Google account is authenticated, but the application profile has not been created yet. Refresh once and, if this persists, review the auth bootstrap configuration.</p>
        </article>
      </main>
    );
  }

  if (profile.role !== "teacher" && profile.role !== "admin") {
    return (
      <main className="content-wrap">
        <article className="panel">
          <p className="eyebrow">Signed in</p>
          <h1>Teacher access is not enabled yet</h1>
          <p className="subtle">{profile.display_name}, your account is authenticated successfully. For safety, new accounts start with student-level permissions until an administrator explicitly grants teacher access.</p>
        </article>
      </main>
    );
  }

  const sections = await getTeacherSections();
  const section = sections[0];

  if (!section) {
    return (
      <main className="content-wrap">
        <article className="panel">
          <p className="eyebrow">Teacher setup</p>
          <h1>No section assigned yet</h1>
          <p className="subtle">Your teacher account is ready. The next setup step is assigning a school year, course, section, and roster.</p>
        </article>
      </main>
    );
  }

  const roster = await getSectionRoster(section.sectionId, "active");

  return (
    <DashboardShell
      courseName={section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName}
      schoolYear={section.schoolYearLabel}
      sectionName={section.sectionName}
      studentCount={roster.length}
      dataMode="Live Supabase roster"
    />
  );
}
