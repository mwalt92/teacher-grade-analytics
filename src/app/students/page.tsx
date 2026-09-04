import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers3, UserPlus } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { addStudent, setEnrollmentActive } from "./actions";
import { EmailReconciliation } from "./email-reconciliation";
import { RosterImportPreview } from "./roster-import-preview";
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
  const activeRoster = scope === "section" && filter !== "active" ? await getSectionRoster(section.sectionId, "active") : roster;
  const allSectionEmailRosters = scope === "all"
    ? await Promise.all(offeringSections.map(async (item) => ({
      section: item,
      roster: await getSectionRoster(item.sectionId, "active"),
    })))
    : [];
  const totalRows = scope === "all" ? combinedRows.length : roster.length;
  const orderedImportSections = [
    ...offeringSections,
    ...sections.filter((item) => item.offeringId !== section.offeringId),
  ];
  const sectionOptions = orderedImportSections.map((item) => ({
    id: item.sectionId,
    label: `${item.courseCode ? `${item.courseName} ${item.courseCode}` : item.courseName} — ${item.sectionName}`,
  }));
  const returnTo = filterHref(filter, scope, sectionFilter);
  const courseLabel = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Roster</h1>
        <p className="subtle">{courseLabel} • {scope === "all" ? "All Sections" : section.sectionName}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo={returnTo}/>
      </div>
    </header>
    <TeacherPrimaryNav/>

    {canShowAllSections ? <nav className="main-nav" aria-label="Roster section scope" style={{ background: "var(--surface-soft)", paddingTop: 8, paddingBottom: 4 }}>
      <Link className={scope === "section" ? "nav-button active" : "nav-button"} href={filterHref(filter, "section", "all")}>{section.sectionName}</Link>
      <Link className={scope === "all" ? "nav-button active" : "nav-button"} href={filterHref(filter, "all", "all")}>All Sections ({offeringSections.length})</Link>
    </nav> : null}

    <nav className="main-nav" aria-label="Roster filters" style={{ background: "var(--surface-soft)", paddingTop: canShowAllSections ? 4 : 8 }}>
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
          {totalRows === 0 ? <div className="empty-state"><UserPlus size={30}/><h3>No students here yet</h3><p className="subtle">{scope === "all" ? "No enrollments match this combined-roster filter. Use the Import Center below to load one or more class periods." : "Add a student manually for testing, or preview a PowerSchool roster before importing."}</p></div> : scope === "all" ? <div className={styles.allRosterTable}>
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
          <article className={`panel ${styles.sectionToolsNote}`}><p className="eyebrow">Roster tools</p><h3>Import and email tools work across sections</h3><p>Use the Import Center below to upload once and map each detected PowerSchool course to its destination class period. Email reconciliation is available below as a separate reviewed panel for each class period. Quick Add stays section-specific.</p></article>
        </aside>}
      </div>

      <article className="panel full-width import-card-live">
        <div className="panel-header"><div><p className="eyebrow">Import Center • {scope === "all" ? "Multi-section" : "Step 1"}</p><h2>{scope === "all" ? "Import PowerSchool rosters across sections" : "Preview a PowerSchool roster export"}</h2><p className="subtle">{scope === "all" ? "Upload one multi-course .xlsx export, then explicitly map each detected PowerSchool course to the correct destination section before anything is committed." : "Supports multi-course .xlsx exports. Student Number is the preferred identity key; Name + Course exports are accepted but flagged for review."}</p></div></div>
        <RosterImportPreview sectionId={section.sectionId} sections={sectionOptions}/>
      </article>

      {scope === "section" ? <article className="panel full-width import-card-live">
        <EmailReconciliation
          sectionId={section.sectionId}
          students={activeRoster.map((student) => ({
            displayName: student.displayName,
            studentNumber: student.externalStudentKey ?? "",
            currentEmail: student.email,
          }))}
        />
      </article> : <>
        <article className="panel full-width import-card-live">
          <div className="panel-header"><div><p className="eyebrow">Import Center • Step 2</p><h2>Reconcile school emails by class period</h2><p className="subtle">Each class period keeps its own reviewed email list. Paste and save one section at a time below so the existing one-to-one identity checks remain unchanged.</p></div></div>
        </article>
        {allSectionEmailRosters.map(({ section: emailSection, roster: emailRoster }) => <article className="panel full-width import-card-live" key={emailSection.sectionId}>
          <div className="panel-header"><div><p className="eyebrow">Email reconciliation • {emailSection.sectionName}</p><h2>{emailSection.sectionName}</h2><p className="subtle">{emailRoster.length} active {emailRoster.length === 1 ? "student" : "students"}. Paste the PowerSchool email list for this class period only.</p></div></div>
          <EmailReconciliation
            sectionId={emailSection.sectionId}
            students={emailRoster.map((student) => ({
              displayName: student.displayName,
              studentNumber: student.externalStudentKey ?? "",
              currentEmail: student.email,
            }))}
          />
        </article>)}
      </>}
    </section>
  </main>;
}
