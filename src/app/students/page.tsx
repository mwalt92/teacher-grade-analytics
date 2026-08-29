import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { addStudent, setEnrollmentActive } from "./actions";
import { updateStudentSchoolEmail } from "./student-email-actions";
import { RosterImportPreview } from "./roster-import-preview";
import styles from "./students.module.css";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") redirect("/login");
  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) redirect("/");
  const { view } = await searchParams;
  const filter = view === "inactive" ? "inactive" : view === "all" ? "all" : "active";
  const roster = await getSectionRoster(section.sectionId, filter);
  const linkedCount = roster.filter((student) => student.accountLinked).length;
  const readyCount = roster.filter((student) => !student.accountLinked && Boolean(student.email)).length;
  const needsEmailCount = roster.filter((student) => !student.accountLinked && !student.email).length;
  const sectionOptions = sections.map((item) => ({
    id: item.sectionId,
    label: `${item.courseCode ? `${item.courseName} ${item.courseCode}` : item.courseName} — ${item.sectionName}`,
  }));
  const returnTo = filter === "inactive" ? "/students?view=inactive" : filter === "all" ? "/students?view=all" : "/students";

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Roster</h1>
        <p className="subtle">{section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName} • {section.sectionName}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo={returnTo}/>
      </div>
    </header>
    <TeacherPrimaryNav/>
    <nav className="main-nav" aria-label="Roster filters" style={{ background: "var(--surface-soft)", paddingTop: 8 }}>
      <Link className={filter === "active" ? "nav-button active" : "nav-button"} href="/students">Active</Link>
      <Link className={filter === "inactive" ? "nav-button active" : "nav-button"} href="/students?view=inactive">Inactive</Link>
      <Link className={filter === "all" ? "nav-button active" : "nav-button"} href="/students?view=all">All students</Link>
    </nav>
    <section className="content-wrap">
      <div className="roster-layout">
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">{filter} roster</p><h2>{roster.length} {roster.length === 1 ? "student" : "students"}</h2></div><span className="save-indicator">● Live Supabase data</span></div>
          {roster.length ? <div className={styles.summary} aria-label="Student login readiness"><span><strong>{linkedCount}</strong> linked</span><span><strong>{readyCount}</strong> ready for login</span><span><strong>{needsEmailCount}</strong> need school email</span></div> : null}
          {roster.length === 0 ? <div className="empty-state"><UserPlus size={30}/><h3>No students here yet</h3><p className="subtle">Add a student manually for testing, or preview a PowerSchool roster before importing.</p></div> : <div className="roster-table">
            <div className="roster-row roster-head"><span>Student</span><span>Student #</span><span>School email</span><span>Login</span><span></span></div>
            {roster.map((student) => <div className="roster-row" key={student.enrollmentId}>
              <span className={styles.studentMeta}><strong>{student.displayName}</strong><small>{student.active ? "Active enrollment" : "Inactive enrollment"}</small></span>
              <span>{student.externalStudentKey ?? "—"}</span>
              {student.accountLinked ? <span className={styles.lockedEmail}><span>{student.email ?? "Email unavailable"}</span><small>Locked after account link</small></span> : <form className={styles.emailForm} action={updateStudentSchoolEmail}>
                <input type="hidden" name="sectionId" value={section.sectionId}/><input type="hidden" name="studentId" value={student.studentId}/><input name="schoolEmail" type="email" required defaultValue={student.email ?? ""} placeholder="student@school.org" aria-label={`School email for ${student.displayName}`}/><button type="submit">Save</button>
              </form>}
              <span className={styles.loginStatus}>{student.accountLinked ? <strong className={styles.linked}>Linked</strong> : student.email ? <strong className={styles.ready}>Ready</strong> : <strong className={styles.needsEmail}>Email needed</strong>}<small>{student.accountLinked ? "Google login connected" : student.email ? "Will match on school Google login" : "Add exact school Google email"}</small></span>
              <form action={setEnrollmentActive}><input type="hidden" name="sectionId" value={section.sectionId}/><input type="hidden" name="enrollmentId" value={student.enrollmentId}/><input type="hidden" name="active" value={student.active ? "false" : "true"}/><button className="text-button" type="submit">{student.active ? "Hide" : "Reactivate"}</button></form>
            </div>)}
          </div>}
        </article>
        <aside className="roster-sidebar">
          <article className="panel"><p className="eyebrow">Student login setup</p><h3>Exact school email = account identity</h3><p className="subtle">Students are linked only when the email authenticated by Google exactly matches the school email stored on their roster record. Names are never used to guess identity.</p></article>
          <article className="panel"><p className="eyebrow">Quick add</p><h3>Add one student</h3><form className="stack-form" action={addStudent}>
            <input type="hidden" name="sectionId" value={section.sectionId}/><label>Student name<input name="displayName" required placeholder="Last, First"/></label><label>Student number<input name="studentNumber" required placeholder="PowerSchool student #"/></label><label>School email <span className="optional">optional</span><input name="schoolEmail" type="email" placeholder="student@school.org"/></label><button className="primary-button" type="submit"><UserPlus size={17}/> Add to roster</button>
          </form></article>
        </aside>
      </div>

      <article className="panel full-width import-card-live">
        <div className="panel-header"><div><p className="eyebrow">PowerSchool import</p><h2>Preview a roster export</h2><p className="subtle">Supports multi-course .xlsx exports. Student Number is the preferred identity key; Name + Course exports are accepted but flagged for review.</p></div></div>
        <RosterImportPreview sectionId={section.sectionId} sections={sectionOptions}/>
      </article>
    </section>
  </main>;
}
