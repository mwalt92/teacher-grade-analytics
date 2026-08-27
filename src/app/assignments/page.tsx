import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ArrowLeft, Edit3, Plus, RotateCcw, Search } from "lucide-react";
import { getAssignmentManagementData } from "@/lib/data/assignment-management";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { archiveAssignment, restoreAssignment } from "./management-actions";
import styles from "./assignments.module.css";

type AssignmentPageProps = {
  searchParams: Promise<{ q?: string; period?: string; kind?: string; status?: string; notice?: string; error?: string }>;
};

function assignmentTypeLabel(kind: string) {
  if (kind === "quiz") return "Quiz";
  if (kind === "test") return "Test";
  return "Participation";
}

function currentReturnPath(params: { q: string; period: string; kind: string; status: string }) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.period !== "all") query.set("period", params.period);
  if (params.kind !== "all") query.set("kind", params.kind);
  if (params.status !== "active") query.set("status", params.status);
  const suffix = query.toString();
  return suffix ? `/assignments?${suffix}` : "/assignments";
}

export default async function AssignmentsPage({ searchParams }: AssignmentPageProps) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") redirect("/login");

  const sections = await getTeacherSections();
  const section = sections[0];
  if (!section) redirect("/");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const period = params.period ?? "all";
  const kind = ["participation", "quiz", "test"].includes(params.kind ?? "") ? params.kind! : "all";
  const status = params.status === "archived" || params.status === "all" ? params.status : "active";
  const data = await getAssignmentManagementData(section.sectionId);
  if (!data) {
    return <main className="content-wrap"><article className="panel"><h1>Assignments</h1><p className="subtle">The assignment workspace could not be loaded.</p></article></main>;
  }

  const activeCount = data.assignments.filter((assignment) => !assignment.archived).length;
  const archivedCount = data.assignments.length - activeCount;
  const normalizedSearch = q.toLowerCase();
  const visibleAssignments = data.assignments.filter((assignment) => {
    if (status === "active" && assignment.archived) return false;
    if (status === "archived" && !assignment.archived) return false;
    if (period !== "all" && assignment.gradingPeriod?.code !== period) return false;
    if (kind !== "all" && assignment.assignmentType !== kind) return false;
    if (normalizedSearch && !assignment.title.toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });
  const returnTo = currentReturnPath({ q, period, kind, status });
  const filterKey = `${q}|${period}|${kind}|${status}`;
  const notice = params.notice === "archived"
    ? "Assignment archived. It no longer counts in active grade calculations."
    : params.notice === "restored"
      ? "Assignment restored to active grade calculations."
      : params.notice === "deleted"
        ? "Empty assignment permanently deleted."
        : null;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Assignments</h1>
        <p className="subtle">{section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName} • {section.sectionName}</p>
      </div>
      <div className="grade-audit-header-actions">
        <Link className="secondary-link" href="/"><ArrowLeft size={17}/> Dashboard</Link>
        <Link className="secondary-link" href="/gradebook/assignments">Assignment Gradebook</Link>
        <Link className="primary-button" href="/assignments/new"><Plus size={17}/> New Assignment</Link>
      </div>
    </header>

    <section className={`content-wrap ${styles.content}`}>
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {params.error ? <div className={styles.error}>{params.error}</div> : null}

      <section className={styles.summaryGrid} aria-label="Assignment summary">
        <article className={styles.summaryCard}><span>Active assignments</span><strong>{activeCount}</strong></article>
        <article className={styles.summaryCard}><span>Archived</span><strong>{archivedCount}</strong></article>
        <article className={styles.summaryCard}><span>Showing now</span><strong>{visibleAssignments.length}</strong></article>
      </section>

      <article className={`panel ${styles.filtersPanel}`}>
        <div className="panel-header"><div><p className="eyebrow">Find assignments</p><h2>Filter the workspace</h2></div></div>
        <form key={filterKey} method="get" action="/assignments" className={styles.filterForm}>
          <label className={styles.searchField}><span>Search title</span><div className={styles.searchInput}><Search size={16}/><input name="q" defaultValue={q} placeholder="e.g. Unit 2 Quiz"/></div></label>
          <label><span>Grading period</span><select name="period" defaultValue={period}><option value="all">All periods</option>{data.periods.map((item) => <option value={item.code} key={item.id}>{item.code} — {item.name}</option>)}</select></label>
          <label><span>Type</span><select name="kind" defaultValue={kind}><option value="all">All types</option><option value="participation">Participation</option><option value="quiz">Quiz</option><option value="test">Test</option></select></label>
          <label><span>Status</span><select name="status" defaultValue={status}><option value="active">Active</option><option value="archived">Archived</option><option value="all">Active + archived</option></select></label>
          <button className="primary-button" type="submit">Apply</button>
          <Link className="secondary-link" href="/assignments">Clear</Link>
        </form>
      </article>

      <article className={`panel full-width ${styles.workspace}`}>
        <div className="panel-header"><div><p className="eyebrow">Assignment management</p><h2>{visibleAssignments.length} {visibleAssignments.length === 1 ? "assignment" : "assignments"}</h2><p className="subtle">Edit setup, open grade entry, or archive an assignment without deleting its history.</p></div></div>
        {visibleAssignments.length === 0 ? <div className={styles.empty}><h3>No assignments match these filters.</h3><p>Try clearing a filter or create a new assignment.</p></div> : <div className={styles.table} role="table" aria-label="Assignments">
          <div className={`${styles.row} ${styles.head}`} role="row"><span>Assignment</span><span>Period</span><span>Type</span><span>Date</span><span>Points</span><span>Grade activity</span><span>Actions</span></div>
          {visibleAssignments.map((assignment) => {
            const editHref = `/assignments/${assignment.id}/edit?returnTo=${encodeURIComponent(returnTo)}`;
            const gradeHref = `/assignments/${assignment.id}?returnTo=${encodeURIComponent(returnTo)}`;
            return <div className={`${styles.row} ${assignment.archived ? styles.archivedRow : ""}`} role="row" key={assignment.id}>
              <span className={styles.assignmentName}><strong>{assignment.title}</strong><small>{assignment.archived ? "Archived" : assignment.allowRetakes ? "Retakes allowed" : "Single attempt"}</small></span>
              <span>{assignment.gradingPeriod?.code ?? "—"}</span>
              <span>{assignmentTypeLabel(assignment.assignmentType)}</span>
              <span>{assignment.assignmentDate}</span>
              <span>{assignment.pointsPossible}</span>
              <span className={styles.activity}><strong>{assignment.scoredCount} scored</strong>{assignment.missingCount ? <small className={styles.missing}>{assignment.missingCount} missing</small> : <small>{assignment.gradeRecordCount} grade records</small>}{assignment.retakeCount ? <small>{assignment.retakeCount} retake attempt{assignment.retakeCount === 1 ? "" : "s"}</small> : null}</span>
              <span className={styles.actions}>
                {!assignment.archived ? <Link className="secondary-link" href={gradeHref}>Grade entry</Link> : null}
                <Link className="secondary-link" href={editHref}><Edit3 size={15}/> Edit</Link>
                <form action={assignment.archived ? restoreAssignment : archiveAssignment}>
                  <input type="hidden" name="assignmentId" value={assignment.id}/>
                  <input type="hidden" name="returnTo" value={returnTo}/>
                  <button className={styles.archiveButton} type="submit">{assignment.archived ? <><RotateCcw size={15}/> Restore</> : <><Archive size={15}/> Archive</>}</button>
                </form>
              </span>
            </div>;
          })}
        </div>}
      </article>
    </section>
  </main>;
}
