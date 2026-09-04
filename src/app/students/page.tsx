import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers3, UserPlus } from "lucide-react";
import { StudentsWorkspaceNav } from "@/components/students-workspace-nav";
import { TeacherContextBar } from "@/components/teacher-context-bar";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { addStudent, setEnrollmentActive } from "./actions";
import styles from "./students.module.css";

type RosterFilter = "active" | "inactive" | "all";

type StudentsSearchParams = {
  view?: string;
  scope?: string;
  section?: string;
};

function filterHref(filter: RosterFilter, scope: "section" | "all", sectionFilter: string) {
  const params = new URLSearchParams();
  if (filter !== "active") params.set("view", filter);
  if (scope === "all") {
    params.set("scope", "all");
    if (sectionFilter !== "all") params.set("section", sectionFilter);
  }
  const query = params.toString();
  return query ? `/students?${query}` : "/students";
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<StudentsSearchParams> }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") redirect("/login");

  const [sections, section, params] = await Promise.all([getTeacherSections(), getActiveTeacherSection(), searchParams]);
  if (!section) redirect("/");

  const filter: RosterFilter = params.view === "inactive" ? "inactive" : params.view === "all" ? "all" : "active";
  const offeringSections = sections
    .filter((item) => item.offeringId === section.offeringId)
    .sort((a, b) =>
      (a.periodNumber ?? Number.MAX_SAFE_INTEGER) - (b.periodNumber ?? Number.MAX_SAFE_INTEGER)
      || a.sortOrder - b.sortOrder
      || a.sectionName.localeCompare(b.sectionName));
  const canShowAllSections = offeringSections.length > 1;
  const scope: "section" | "all" = params.scope === "all" && canShowAllSections ? "all" : "section";
  const requestedSectionFilter = params.section ?? "all";
  const sectionFilter = scope === "all" && requestedSectionFilter !== "all" && offeringSections.some((item) => item.sectionId === requestedSectionFilter)
    ? requestedSectionFilter
    : "all";
  const visibleOfferingSections = scope === "all" && sectionFilter !== "all"
    ? offeringSections.filter((item) => item.sectionId === sectionFilter)
    : offeringSections;

  const combinedRows = scope === "all"
    ? (await Promise.all(visibleOfferingSections.map(async (item) => {
      const roster = await getSectionRoster(item.sectionId, filter);
      return roster.map((student) => ({ student, section: item }));
    }))).flat().sort((a, b) =>
      (a.section.periodNumber ?? Number.MAX_SAFE_INTEGER) - (b.section.periodNumber ?? Number.MAX_SAFE_INTEGER)
      || a.section.sortOrder - b.section.sortOrder
      || a.student.displayName.localeCompare(b.student.displayName))
    : [];

  const roster = scope === "section" ? await getSectionRoster(section.sectionId, filter) : [];
  const totalRows = scope === "all" ? combinedRows.length : roster.length;
  const returnTo = filterHref(filter, scope, sectionFilter);
  const courseLabel = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;
  const sectionHref = filterHref(filter, "section", "all");
  const allHref = filterHref(filter, "all", "all");

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Students</p>
        <h1>Roster</h1>
        <p className="subtle">{courseLabel} • {scope === "all" ? "All Sections" : section.sectionName}</p>
      </div>
    </header>
    <TeacherPrimaryNav/>
    <TeacherContextBar
      sections={sections}
      activeSectionId={section.sectionId}
      returnTo={returnTo}
      scope={canShowAllSections ? {
        active: scope,
        sectionLabel: section.sectionName,
        sectionHref,
        allLabel: `All Sections (${offeringSections.length})`,
        allHref,
        ariaLabel: "Roster section scope",
      } : undefined}
    />
    <StudentsWorkspaceNav active="roster"/>

    <nav className="main-nav" aria-label="Roster filters" style={{ background: "var(--surface-soft)", paddingTop: 8, paddingBottom: 4 }}>
      <Link className={filter === "active" ? "nav-button active" : "nav-button"} href={filterHref("active", scope, sectionFilter)}>Active</Link>
      <Link className={filter === "inactive" ? "nav-button active" : "nav-button"} href={filterHref("inactive", scope, sectionFilter)}>Inactive</Link>
      <Link className={filter === "all" ? "nav-button active" : "nav-button"} href={filterHref("all", scope, sectionFilter)}>All students</Link>
    </nav>

    <section className="content-wrap">
      {scope === "all" ? <div className={styles.sectionFilterBar}>
        <div><Layers3 size={18}/><span><strong>All Sections roster</strong><small>Read students together without changing the active class-period context.</small></span></div>
        <nav aria-label="Filter combined roster by section">
          <Link className={sectionFilter === "all" ? styles.sectionFilterActive : styles.sectionFilterLink} href={filterHref(filter, "all", "all")}>All</Link>
          {offeringSections.map((item) => <Link className={sectionFilter === item.sectionId ? styles.sectionFilterActive : styles.sectionFilterLink} href={filterHref(filter, "all", item.sectionId)} key={item.sectionId}>{item.sectionName}</Link>)}
        </nav>
      </div> : null}

      <div className="roster-layout">
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">{filter} roster</p><h2>{totalRows} {totalRows === 1 ? "student" : "students"}{scope === "all" ? ` across ${visibleOfferingSections.length} ${visibleOfferingSections.length === 1 ? "section" : "sections"}` : ""}</h2></div><span className="save-indicator">● Live Supabase data</span></div>
          {totalRows === 0 ? <div className="empty-state"><UserPlus size={30}/><h3>No students here yet</h3><p className="subtle">{scope === "all" ? "No enrollments match this combined-roster filter." : "Add a student manually for testing, or use the Import Center for a PowerSchool roster."}</p></div> : scope === "all" ? <div className={styles.allRosterTable}>
            <div className={`${styles.allRosterRow} ${styles.allRosterHead}`}><span>Student</span><span>Section</span><span>Student #</span><span>Email</span><span>Status</span><span></span></div>
            {combinedRows.map(({ student, section: rowSection }) => {
              const profileParams = new URLSearchParams({ sectionId: rowSection.sectionId, returnTo });
              return <div className={styles.allRosterRow} key={student.enrollmentId}>
                <Link className={styles.studentProfileLink} href={`/students/${student.studentId}?${profileParams.toString()}`}>{student.displayName}</Link>
                <span className={styles.sectionCell}><strong>{rowSection.sectionName}</strong>{rowSection.periodNumber != null ? <small>Period {rowSection.periodNumber}</small> : null}</span>
                <span>{student.externalStudentKey ? <details className={styles.studentNumber}><summary className="text-button"><span className={styles.showLabel}>Click to show</span><span className={styles.hideLabel}>Hide</span></summary><span className={styles.studentNumberValue}>{student.externalStudentKey}</span></details> : "—"}</span>
                <span className={styles.emailCell}>{student.email ? <span className={styles.emailDisplay} title={student.email}>{student.email}</span> : "Not linked yet"}</span>
                <span className={student.active ? "status success-pill" : "status neutral-pill"}>{student.active ? "Active" : "Inactive"}</span>
                <form action={setEnrollmentActive}><input type="hidden" name="sectionId" value={rowSection.sectionId}/><input type="hidden" name="enrollmentId" value={student.enrollmentId}/><input type="hidden" name="active" value={student.active ? "false" : "true"}/><button className="text-button" type="submit">{student.active ? "Deactivate" : "Reactivate"}</button></form>
              </div>;
            })}
          </div> : <div className="roster-table">
            <div className="roster-row roster-head"><span>Student</span><span>Student #</span><span>Email</span><span>Status</span><span></span></div>
            {roster.map((student) => {
              const profileParams = new URLSearchParams({ sectionId: section.sectionId, returnTo });
              return <div className="roster-row" key={student.enrollmentId}>
                <Link className={styles.studentProfileLink} href={`/students/${student.studentId}?${profileParams.toString()}`}>{student.displayName}</Link>
                <span>{student.externalStudentKey ? <details className={styles.studentNumber}><summary className="text-button"><span className={styles.showLabel}>Click to show</span><span className={styles.hideLabel}>Hide</span></summary><span className={styles.studentNumberValue}>{student.externalStudentKey}</span></details> : "—"}</span>
                <span className={styles.emailCell}>{student.email ? <span className={styles.emailDisplay} title={student.email}>{student.email}</span> : "Not linked yet"}</span>
                <span className={student.active ? "status success-pill" : "status neutral-pill"}>{student.active ? "Active" : "Inactive"}</span>
                <form action={setEnrollmentActive}><input type="hidden" name="sectionId" value={section.sectionId}/><input type="hidden" name="enrollmentId" value={student.enrollmentId}/><input type="hidden" name="active" value={student.active ? "false" : "true"}/><button className="text-button" type="submit">{student.active ? "Deactivate" : "Reactivate"}</button></form>
              </div>;
            })}
          </div>}
        </article>

        {scope === "section" ? <aside className="roster-sidebar">
          <article className="panel"><p className="eyebrow">Quick add</p><h3>Add one student</h3><form className="stack-form" action={addStudent}>
            <input type="hidden" name="sectionId" value={section.sectionId}/><label>Student name<input name="displayName" required placeholder="Last, First"/></label><label>Student number<input name="studentNumber" required placeholder="PowerSchool student #"/></label><label>School email <span className="optional">optional</span><input name="schoolEmail" type="email" placeholder="student@school.org"/></label><button className="primary-button" type="submit"><UserPlus size={17}/> Add to roster</button>
          </form></article>
        </aside> : <aside className="roster-sidebar">
          <article className={`panel ${styles.sectionToolsNote}`}><p className="eyebrow">Roster tools</p><h3>Keep imports separate from daily roster work</h3><p>Use this page for student status and individual roster maintenance. PowerSchool uploads and email reconciliation now live in the dedicated Import Center.</p><Link className="secondary-link" href="/students/import">Open Import Center</Link></article>
        </aside>}
      </div>
    </section>
  </main>;
}
