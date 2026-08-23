import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Upload, UserPlus } from "lucide-react";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { addStudent, setEnrollmentActive } from "./actions";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") redirect("/login");
  const sections = await getTeacherSections();
  const section = sections[0];
  if (!section) redirect("/");
  const { view } = await searchParams;
  const filter = view === "inactive" ? "inactive" : view === "all" ? "all" : "active";
  const roster = await getSectionRoster(section.sectionId, filter);

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">Teacher Grade Analytics</p><h1>Roster</h1><p className="subtle">{section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName} • {section.sectionName}</p></div>
      <div className="toolbar-group"><Link className="secondary-link" href="/"><ArrowLeft size={17}/> Dashboard</Link></div>
    </header>
    <nav className="main-nav" aria-label="Roster filters">
      <Link className={filter === "active" ? "nav-button active" : "nav-button"} href="/students">Active</Link>
      <Link className={filter === "inactive" ? "nav-button active" : "nav-button"} href="/students?view=inactive">Inactive</Link>
      <Link className={filter === "all" ? "nav-button active" : "nav-button"} href="/students?view=all">All students</Link>
    </nav>
    <section className="content-wrap">
      <div className="roster-layout">
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">{filter} roster</p><h2>{roster.length} {roster.length === 1 ? "student" : "students"}</h2></div><span className="save-indicator">● Live Supabase data</span></div>
          {roster.length === 0 ? <div className="empty-state"><UserPlus size={30}/><h3>No students here yet</h3><p className="subtle">Add a student manually for testing, or use the PowerSchool importer when it is enabled.</p></div> : <div className="roster-table">
            <div className="roster-row roster-head"><span>Student</span><span>Student #</span><span>Email</span><span>Status</span><span></span></div>
            {roster.map((student) => <div className="roster-row" key={student.enrollmentId}>
              <strong>{student.displayName}</strong><span>{student.externalStudentKey ?? "—"}</span><span>{student.email ?? "Not linked yet"}</span><span className={student.active ? "status success-pill" : "status neutral-pill"}>{student.active ? "Active" : "Inactive"}</span>
              <form action={setEnrollmentActive}><input type="hidden" name="sectionId" value={section.sectionId}/><input type="hidden" name="enrollmentId" value={student.enrollmentId}/><input type="hidden" name="active" value={student.active ? "false" : "true"}/><button className="text-button" type="submit">{student.active ? "Hide" : "Reactivate"}</button></form>
            </div>)}
          </div>}
        </article>
        <aside className="roster-sidebar">
          <article className="panel"><p className="eyebrow">Quick add</p><h3>Add one student</h3><form className="stack-form" action={addStudent}>
            <input type="hidden" name="sectionId" value={section.sectionId}/><label>Student name<input name="displayName" required placeholder="Last, First"/></label><label>Student number<input name="studentNumber" required placeholder="PowerSchool student #"/></label><label>School email <span className="optional">optional</span><input name="schoolEmail" type="email" placeholder="student@school.org"/></label><button className="primary-button" type="submit"><UserPlus size={17}/> Add to roster</button>
          </form></article>
          <article className="panel import-card"><span className="metric-icon"><Upload size={20}/></span><div><p className="eyebrow">PowerSchool import</p><h3>Bulk roster import</h3><p className="subtle">Designed for Student Number + Name + Course exports. Preview, matching, and duplicate review are next.</p></div><button className="secondary-button" disabled>Import roster — coming next</button></article>
        </aside>
      </div>
    </section>
  </main>;
}
